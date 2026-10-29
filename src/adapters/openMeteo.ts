import { EXTERNAL_API_TIMEOUT_MS } from '../engines/constants';
import { buildOpenMeteoUrl, parseOpenMeteo, type IrradianceSeries } from '../lib/openMeteo';

/**
 * Browser adapter for Open-Meteo hourly irradiance (tasks.md 18.5). No key. 10 s budget, never throws. Results are
 * cached per point rounded to about 1 km for an hour (sunlight barely differs within a neighborhood), and concurrent
 * callers share one request. A failure is remembered for a minute so the page does not hammer the service.
 */
export const OPEN_METEO_TIMEOUT_MS = EXTERNAL_API_TIMEOUT_MS;
const OK_TTL_MS = 60 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;

export type SunlightResult = { ok: true; series: IrradianceSeries } | { ok: false; reason: 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'BAD_RESPONSE' };

const cache = new Map<string, { at: number; result: SunlightResult } | { at: number; inflight: Promise<SunlightResult> }>();
const keyOf = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

/** Test hook */
export function resetSunlightCache(): void {
  cache.clear();
}

export async function fetchSunlight(lat: number, lng: number, deps: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<SunlightResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? OPEN_METEO_TIMEOUT_MS);
  try {
    const res = await (deps.fetchImpl ?? fetch)(buildOpenMeteoUrl(lat, lng), { signal: controller.signal });
    if (!res.ok) return { ok: false, reason: 'HTTP' };
    const series = parseOpenMeteo(await res.json());
    return series ? { ok: true, series } : { ok: false, reason: 'BAD_RESPONSE' };
  } catch (err) {
    if (controller.signal.aborted) return { ok: false, reason: 'TIMEOUT' };
    return { ok: false, reason: err instanceof SyntaxError ? 'BAD_RESPONSE' : 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }
}

export function getSunlight(lat: number, lng: number, now = Date.now()): Promise<SunlightResult> {
  const key = keyOf(lat, lng);
  const hit = cache.get(key);
  if (hit && 'inflight' in hit) return hit.inflight;
  if (hit && 'result' in hit && now - hit.at < (hit.result.ok ? OK_TTL_MS : FAIL_TTL_MS)) return Promise.resolve(hit.result);
  const inflight = fetchSunlight(Number(lat.toFixed(2)), Number(lng.toFixed(2))).then((result) => {
    cache.set(key, { at: Date.now(), result });
    return result;
  });
  cache.set(key, { at: now, inflight });
  return inflight;
}
