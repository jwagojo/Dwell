import { GetParameterCommand } from '@aws-sdk/client-ssm';
import { RATE_LOOKUP_TIMEOUT_MS } from '../../src/engines/constants';
import { resolveRate, type EiaRate } from '../../src/engines/rate';
import { buildEiaUrl, parseEiaResponse } from '../../src/lib/eia';
import { ssm } from '../shared/clients';
import { env } from '../shared/env';
import { api, json, userId } from '../shared/http';

/**
 * GET /rate: the Massachusetts statewide residential average from EIA (Req 1.6), or the labeled $0.30/kWh fallback
 * estimate (Req 1.7). Same contract as the browser adapter (adapters/eiaRates.ts), but the API key stays in SSM
 * Parameter Store and one cached value serves every host. The value is statewide, not ZIP- or utility-specific.
 */

export const RATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const RATE_FAILURE_TTL_MS = 60 * 1000;
/** A missing key is re-read after this long, so adding the parameter does not need a redeploy. */
const KEY_RETRY_MS = 5 * 60 * 1000;

export type RateFailure = 'NO_KEY' | 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'BAD_RESPONSE' | 'NO_VALID_RECORD';

const cache = {
  key: undefined as { value: string | null; at: number } | undefined,
  ok: null as { rate: EiaRate; at: number } | null,
  failure: null as { reason: RateFailure; at: number } | null,
};

/** Test hook: forget cached values between tests. */
export function resetRateCache(): void {
  cache.key = undefined;
  cache.ok = null;
  cache.failure = null;
}

async function apiKey(now: number): Promise<string | null> {
  if (cache.key && (cache.key.value !== null || now - cache.key.at < KEY_RETRY_MS)) return cache.key.value;
  try {
    const res = await ssm.send(new GetParameterCommand({ Name: env('EIA_KEY_PARAM'), WithDecryption: true }));
    cache.key = { value: res.Parameter?.Value?.trim() || null, at: now };
  } catch (err) {
    if ((err as Error).name !== 'ParameterNotFound') throw err;
    cache.key = { value: null, at: now };
  }
  return cache.key.value;
}

async function fetchRate(key: string): Promise<{ ok: true; rate: EiaRate } | { ok: false; reason: RateFailure }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RATE_LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(buildEiaUrl(key), { signal: controller.signal });
    if (!res.ok) return { ok: false, reason: 'HTTP' };
    return parseEiaResponse(await res.json());
  } catch (err) {
    if (controller.signal.aborted) return { ok: false, reason: 'TIMEOUT' };
    if (err instanceof SyntaxError) return { ok: false, reason: 'BAD_RESPONSE' };
    return { ok: false, reason: 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }
}

/** Never throws for EIA problems: they become the fallback with a reason. The URL and key are never logged. */
export async function lookupRate(now: number): Promise<{ rate: ReturnType<typeof resolveRate>; reason: RateFailure | null }> {
  if (cache.ok && now - cache.ok.at <= RATE_CACHE_TTL_MS) return { rate: resolveRate(cache.ok.rate), reason: null };
  if (cache.failure && now - cache.failure.at < RATE_FAILURE_TTL_MS) return { rate: resolveRate(null), reason: cache.failure.reason };
  let key: string | null = null;
  try {
    key = await apiKey(now);
  } catch (err) {
    // SSM itself failed (throttled, permissions). The rate still degrades to the fallback, it never fails the form.
    console.error(JSON.stringify({ level: 'ERROR', message: 'Could not read the EIA key parameter', name: (err as Error).name }));
  }
  const result = key ? await fetchRate(key) : ({ ok: false, reason: 'NO_KEY' } as const);
  if (result.ok) {
    cache.ok = { rate: result.rate, at: now };
    cache.failure = null;
    return { rate: resolveRate(result.rate), reason: null };
  }
  cache.failure = { reason: result.reason, at: now };
  console.warn(JSON.stringify({ level: 'WARN', message: 'EIA rate unavailable, using the fallback estimate', reason: result.reason }));
  return { rate: resolveRate(null), reason: result.reason };
}

export const handler = api(async (event) => {
  userId(event);
  const { rate, reason } = await lookupRate(Date.now());
  return json(200, { rate, fallbackReason: reason });
});
