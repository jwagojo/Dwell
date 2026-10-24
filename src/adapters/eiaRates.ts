import { RATE_LOOKUP_TIMEOUT_MS } from '../engines/constants';
import { isPlausibleCents, isValidDataMonth, type EiaRate } from '../engines/rate';

/**
 * Typed adapter for the U.S. Energy Information Administration (EIA) Open Data API v2.
 *
 * What it returns: the latest valid Massachusetts RESIDENTIAL monthly average retail price. That is ONE statewide
 * number. EIA does not publish ZIP-level or utility-level tariffs here, so nothing in this file may be described as
 * either. EIA reports cents per kWh and lags real time by a couple of months, so the result is an estimate.
 *
 * Network access lives here; the choice of rate and the unit conversion live in the pure engine (engines/rate.ts).
 * Nothing in this module throws, and no message it produces contains the request URL or the API key.
 *
 * KEY EXPOSURE: with no backend yet, the key is a VITE_ variable, so it is compiled into the browser bundle and
 * visible to anyone who opens the site. EIA keys are free and revocable. Move the call behind a server (Amplify
 * function) before production, then the key stays server-side.
 */

export const EIA_ENDPOINT = 'https://api.eia.gov/v2/electricity/retail-sales/data/';
/** Rows requested, newest first. A few spare rows let us skip a latest month that has no usable price yet. */
export const EIA_ROW_LIMIT = 12;

const rawKey = (import.meta.env.VITE_EIA_API_KEY as string | undefined)?.trim() ?? '';
/** The .env.example placeholder counts as "not configured". */
export const EIA_API_KEY: string = rawKey.startsWith('your-') ? '' : rawKey;
export const hasEiaKey = EIA_API_KEY.length > 0;

if (import.meta.env.DEV && !hasEiaKey) {
  console.warn('[VoltLot] VITE_EIA_API_KEY is not set. The electricity rate will use the $0.30/kWh fallback estimate. See docs/eia-rates.md.');
}

export type RateLookupFailure = 'NO_KEY' | 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'BAD_RESPONSE' | 'NO_VALID_RECORD' | 'ABORTED';

export type RateLookupResult =
  | { ok: true; rate: EiaRate }
  | { ok: false; reason: RateLookupFailure; status?: number; message: string };

export function buildEiaUrl(apiKey: string, length: number = EIA_ROW_LIMIT): string {
  const params = new URLSearchParams();
  params.set('api_key', apiKey);
  params.set('frequency', 'monthly');
  params.set('data[0]', 'price');
  params.set('facets[stateid][]', 'MA');
  params.set('facets[sectorid][]', 'RES');
  params.set('sort[0][column]', 'period');
  params.set('sort[0][direction]', 'desc');
  params.set('length', String(length));
  return `${EIA_ENDPOINT}?${params.toString()}`;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
/** EIA v2 returns numbers as strings ("30.48"); accept real numbers too. */
const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
/** EIA labels the unit "cents per kilowatt-hour". The conversion by 100 is only valid for cents, so check it. */
const isCentsPerKwh = (units: unknown): boolean => typeof units === 'string' && /\bcents?\s+per\s+kilowatt-?\s?hour\b/i.test(units);

/**
 * Validate an EIA response and return the latest valid record.
 * Valid means: a Massachusetts residential row, a YYYY-MM period, a numeric price in cents per kWh, and a price that
 * converts to a plausible rate. Rows are not trusted to arrive sorted: the newest valid period wins.
 */
export function parseEiaResponse(json: unknown): { ok: true; rate: EiaRate } | { ok: false; reason: 'BAD_RESPONSE' | 'NO_VALID_RECORD' } {
  const rows = isObj(json) && isObj(json.response) && Array.isArray(json.response.data) ? json.response.data : null;
  if (!rows) return { ok: false, reason: 'BAD_RESPONSE' };

  let best: EiaRate | null = null;
  for (const row of rows) {
    if (!isObj(row)) continue;
    if (row.stateid !== 'MA' || row.sectorid !== 'RES') continue;
    if (!isValidDataMonth(row.period)) continue;
    if (!isCentsPerKwh(row['price-units'])) continue;
    const cents = toNumber(row.price);
    if (cents === null || !isPlausibleCents(cents)) continue;
    if (!best || row.period > best.period) best = { centsPerKwh: cents, period: row.period };
  }
  return best ? { ok: true, rate: best } : { ok: false, reason: 'NO_VALID_RECORD' };
}

export interface LookupOptions {
  apiKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** One request to EIA, with the 5-second budget. Never throws. */
export async function fetchMassachusettsResidentialRate(opts: LookupOptions = {}): Promise<RateLookupResult> {
  const apiKey = opts.apiKey ?? EIA_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NO_KEY', message: 'The EIA API key is not configured.' };

  const timeoutMs = opts.timeoutMs ?? RATE_LOOKUP_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onCallerAbort);

  try {
    const res = await (opts.fetchImpl ?? fetch)(buildEiaUrl(apiKey), { signal: controller.signal });
    if (!res.ok) {
      const message =
        res.status === 401 || res.status === 403
          ? 'EIA rejected the API key.'
          : res.status === 429
            ? 'EIA is rate limiting requests.'
            : `EIA returned an error (${res.status}).`;
      return { ok: false, reason: 'HTTP', status: res.status, message };
    }
    const parsed = parseEiaResponse(await res.json());
    if (parsed.ok) return parsed;
    return {
      ok: false,
      reason: parsed.reason,
      message: parsed.reason === 'BAD_RESPONSE' ? 'EIA returned an unexpected response.' : 'EIA had no usable Massachusetts residential price.',
    };
  } catch (err) {
    if (timedOut) return { ok: false, reason: 'TIMEOUT', message: `The EIA lookup took longer than ${timeoutMs / 1000} seconds.` };
    if (opts.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      return { ok: false, reason: 'ABORTED', message: 'The EIA lookup was cancelled.' };
    }
    if (err instanceof SyntaxError) return { ok: false, reason: 'BAD_RESPONSE', message: 'EIA returned an unexpected response.' };
    return { ok: false, reason: 'NETWORK', message: 'Could not reach EIA.' };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onCallerAbort);
  }
}

/* ---------- Central cache ----------
   The value is statewide and changes monthly, so one fetch serves every Massachusetts ZIP and every host.
   - concurrent callers share one in-flight request
   - a good result is kept for 24 hours (memory, plus localStorage so a reload does not refetch)
   - a failure is remembered for 60 seconds so typing in the form cannot hammer EIA, then it may retry */

export const RATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const RATE_FAILURE_TTL_MS = 60 * 1000;
export const RATE_STORAGE_KEY = 'voltlot.eia.ma-residential-rate.v1';

type Failure = Extract<RateLookupResult, { ok: false }>;

interface CacheState {
  ok: { rate: EiaRate; at: number } | null;
  failure: { result: Failure; at: number } | null;
  inflight: Promise<RateLookupResult> | null;
}
const cache: CacheState = { ok: null, failure: null, inflight: null };

export interface CachedLookupOptions extends LookupOptions {
  now?: () => number;
  /** Pass null to disable persistence. Defaults to localStorage when available. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

const defaultStorage = (): CachedLookupOptions['storage'] => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

function readStored(storage: CachedLookupOptions['storage'], now: number): { rate: EiaRate; at: number } | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RATE_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<{ centsPerKwh: number; period: string; at: number }>;
    // Re-validate: stored data is untrusted input too.
    if (!isPlausibleCents(v.centsPerKwh) || !isValidDataMonth(v.period) || typeof v.at !== 'number') return null;
    if (now - v.at > RATE_CACHE_TTL_MS || v.at > now) return null;
    return { rate: { centsPerKwh: v.centsPerKwh, period: v.period }, at: v.at };
  } catch {
    return null;
  }
}

export function getMassachusettsResidentialRate(opts: CachedLookupOptions = {}): Promise<RateLookupResult> {
  const now = (opts.now ?? Date.now)();
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;

  if (cache.ok && now - cache.ok.at <= RATE_CACHE_TTL_MS) return Promise.resolve({ ok: true, rate: cache.ok.rate });
  const stored = readStored(storage, now);
  if (stored) {
    cache.ok = stored;
    return Promise.resolve({ ok: true, rate: stored.rate });
  }
  if (cache.failure && now - cache.failure.at < RATE_FAILURE_TTL_MS) return Promise.resolve(cache.failure.result);
  if (cache.inflight) return cache.inflight;

  cache.inflight = fetchMassachusettsResidentialRate(opts)
    .then((result) => {
      if (result.ok) {
        cache.ok = { rate: result.rate, at: now };
        cache.failure = null;
        try {
          storage?.setItem(RATE_STORAGE_KEY, JSON.stringify({ ...result.rate, at: now }));
        } catch {
          // Storage full or blocked: the in-memory cache still works.
        }
      } else if (result.reason !== 'NO_KEY' && result.reason !== 'ABORTED') {
        cache.failure = { result, at: now };
      }
      return result;
    })
    .finally(() => {
      cache.inflight = null;
    });
  return cache.inflight;
}

/** Test seam: forget everything in memory. Pass `{ storage }` to also clear the persisted copy. */
export function resetEiaRateCache(opts: { storage?: CachedLookupOptions['storage'] } = {}): void {
  cache.ok = null;
  cache.failure = null;
  cache.inflight = null;
  try {
    opts.storage?.removeItem(RATE_STORAGE_KEY);
  } catch {
    // ignore
  }
}
