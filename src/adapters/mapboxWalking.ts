import { EXTERNAL_API_TIMEOUT_MS } from '../engines/constants';
import type { LatLng } from '../lib/geo';
import { MAPBOX_TOKEN } from '../lib/mapbox';

/**
 * Walking times from a destination to listings with the Mapbox Matrix API, walking profile (tasks.md 18.5, Req 2.1,
 * 2.4). One request covers up to 24 listings. Uses the public, URL-restricted `pk.` token. Without a token, or on any
 * failure, callers keep the straight-line estimate (lib/geo.ts estimateWalk). 10 s budget, never throws.
 */
export const MAPBOX_WALK_TIMEOUT_MS = EXTERNAL_API_TIMEOUT_MS;
/** 25 coordinates per request: the destination plus 24 listings. */
export const MAX_LISTINGS_PER_REQUEST = 24;

export interface Walk {
  minutes: number;
  meters: number;
}
export type WalkResult = { ok: true; walks: Map<string, Walk> } | { ok: false; reason: 'NO_TOKEN' | 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'BAD_RESPONSE' };

const coord = (p: LatLng) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;

export function buildMatrixUrl(destination: LatLng, points: LatLng[], token: string): string {
  const path = [destination, ...points].map(coord).join(';');
  const p = new URLSearchParams({ sources: '0', annotations: 'duration,distance', access_token: token });
  return `https://api.mapbox.com/directions-matrix/v1/mapbox/walking/${path}?${p.toString()}`;
}

/** Walks from the destination (row 0) to each listing. Unroutable pairs (null) are left out, so they fall back to the estimate. */
export function parseMatrix(json: unknown, ids: string[]): Map<string, Walk> | null {
  const j = json as { code?: unknown; durations?: unknown; distances?: unknown } | null;
  if (!j || j.code !== 'Ok' || !Array.isArray(j.durations) || !Array.isArray(j.distances)) return null;
  const durations = j.durations[0] as unknown[];
  const distances = j.distances[0] as unknown[];
  if (!Array.isArray(durations) || !Array.isArray(distances)) return null;
  const walks = new Map<string, Walk>();
  ids.forEach((id, i) => {
    const s = durations[i + 1];
    const m = distances[i + 1];
    if (typeof s === 'number' && Number.isFinite(s) && typeof m === 'number' && Number.isFinite(m)) {
      walks.set(id, { minutes: Math.max(1, Math.round(s / 60)), meters: m });
    }
  });
  return walks;
}

async function fetchChunk(destination: LatLng, chunk: (LatLng & { id: string })[], token: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<WalkResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(buildMatrixUrl(destination, chunk, token), { signal: controller.signal });
    if (!res.ok) return { ok: false, reason: 'HTTP' };
    const walks = parseMatrix(await res.json(), chunk.map((c) => c.id));
    return walks ? { ok: true, walks } : { ok: false, reason: 'BAD_RESPONSE' };
  } catch (err) {
    if (controller.signal.aborted) return { ok: false, reason: 'TIMEOUT' };
    return { ok: false, reason: err instanceof SyntaxError ? 'BAD_RESPONSE' : 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, Walk>();
const cacheKey = (d: LatLng, id: string) => `${coord(d)}>${id}`;

/** Test hook */
export function resetWalkCache(): void {
  cache.clear();
}

/** Walks for every listing it could route; already-known pairs come from memory. */
export async function getWalks(
  destination: LatLng,
  listings: (LatLng & { id: string })[],
  deps: { token?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<WalkResult> {
  const token = deps.token ?? MAPBOX_TOKEN;
  if (!token) return { ok: false, reason: 'NO_TOKEN' };
  const walks = new Map<string, Walk>();
  const missing = listings.filter((l) => {
    const hit = cache.get(cacheKey(destination, l.id));
    if (hit) walks.set(l.id, hit);
    return !hit;
  });
  const chunks: (LatLng & { id: string })[][] = [];
  for (let i = 0; i < missing.length; i += MAX_LISTINGS_PER_REQUEST) chunks.push(missing.slice(i, i + MAX_LISTINGS_PER_REQUEST));
  const results = await Promise.all(chunks.map((c) => fetchChunk(destination, c, token, deps.fetchImpl ?? fetch, deps.timeoutMs ?? MAPBOX_WALK_TIMEOUT_MS)));
  let firstFailure: WalkResult | null = null;
  for (const r of results) {
    if (!r.ok) {
      firstFailure ??= r;
      continue;
    }
    for (const [id, w] of r.walks) {
      walks.set(id, w);
      cache.set(cacheKey(destination, id), w);
    }
  }
  if (walks.size === 0 && firstFailure) return firstFailure;
  return { ok: true, walks };
}
