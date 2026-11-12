import { GetParameterCommand } from '@aws-sdk/client-ssm';
import { EXTERNAL_API_TIMEOUT_MS } from '../../src/engines/constants';
import { isInMassachusettsArea } from '../../src/lib/massachusetts';
import { buildRoutesUrl, buildStopsUrl, parseRoutes, parseStops } from '../../src/lib/mbta';
import { ssm } from '../shared/clients';
import { env } from '../shared/env';
import { api, badRequest, json, userId } from '../shared/http';

/**
 * GET /transit?lat=..&lng=..: the MBTA routes serving the stops within about 450 m of a point (tasks.md 18.5,
 * Req 2.1). The MBTA V3 API works without a key at a low rate limit; a free key in SSM Parameter Store
 * (/dwell/<stage>/mbta-api-key, optional) raises it. Results are cached for a day per point rounded to ~110 m, so one
 * lookup serves everyone heading to the same place. MBTA problems never fail the request: `transit` is null with a
 * reason, and the app keeps its sample station routes.
 */
export const TRANSIT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const KEY_RETRY_MS = 5 * 60 * 1000;

export interface Transit {
  routes: string[];
  nearestStop: string | null;
}
type Failure = 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'BAD_RESPONSE';

const cache = new Map<string, { at: number; transit: Transit | null; reason: Failure | null }>();
let key: { value: string | null; at: number } | undefined;

/** Test hook */
export function resetTransitCache(): void {
  cache.clear();
  key = undefined;
}

async function apiKey(now: number): Promise<string | null> {
  if (key && (key.value !== null || now - key.at < KEY_RETRY_MS)) return key.value;
  try {
    const res = await ssm.send(new GetParameterCommand({ Name: env('MBTA_KEY_PARAM'), WithDecryption: true }));
    key = { value: res.Parameter?.Value?.trim() || null, at: now };
  } catch (err) {
    // No key, or SSM unavailable: the MBTA API still answers without one.
    if ((err as Error).name !== 'ParameterNotFound') console.warn(JSON.stringify({ level: 'WARN', message: 'Could not read the MBTA key parameter', name: (err as Error).name }));
    key = { value: null, at: now };
  }
  return key.value;
}

async function getJson(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/vnd.api+json', ...headers }, signal });
  if (!res.ok) throw Object.assign(new Error(`MBTA ${res.status}`), { reason: 'HTTP' as Failure });
  return res.json();
}

export async function lookupTransit(lat: number, lng: number, now = Date.now()): Promise<{ transit: Transit | null; reason: Failure | null }> {
  const k = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cache.get(k);
  if (hit && now - hit.at < (hit.transit ? TRANSIT_CACHE_TTL_MS : FAILURE_TTL_MS)) return { transit: hit.transit, reason: hit.reason };

  const mbtaKey = await apiKey(now);
  const headers: Record<string, string> = mbtaKey ? { 'x-api-key': mbtaKey } : {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_API_TIMEOUT_MS);
  let result: { transit: Transit | null; reason: Failure | null };
  try {
    const stops = parseStops(await getJson(buildStopsUrl(lat, lng), headers, controller.signal));
    if (!stops) throw Object.assign(new Error('bad stops'), { reason: 'BAD_RESPONSE' as Failure });
    let routes: string[] = [];
    if (stops.stopIds.length > 0) {
      const parsed = parseRoutes(await getJson(buildRoutesUrl(stops.stopIds), headers, controller.signal));
      if (!parsed) throw Object.assign(new Error('bad routes'), { reason: 'BAD_RESPONSE' as Failure });
      routes = parsed;
    }
    result = { transit: { routes, nearestStop: stops.nearestName }, reason: null };
  } catch (err) {
    const reason: Failure = controller.signal.aborted ? 'TIMEOUT' : ((err as { reason?: Failure }).reason ?? (err instanceof SyntaxError ? 'BAD_RESPONSE' : 'NETWORK'));
    console.warn(JSON.stringify({ level: 'WARN', message: 'MBTA lookup failed', reason }));
    result = { transit: null, reason };
  } finally {
    clearTimeout(timer);
  }
  cache.set(k, { at: now, ...result });
  return result;
}

export const handler = api(async (event) => {
  userId(event);
  const lat = Number(event.queryStringParameters?.lat);
  const lng = Number(event.queryStringParameters?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInMassachusettsArea(lat, lng)) {
    throw badRequest('lat and lng must be a point in Massachusetts.', { field: 'lat' });
  }
  const { transit, reason } = await lookupTransit(lat, lng);
  return json(200, { transit, fallbackReason: reason });
});
