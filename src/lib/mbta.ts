/**
 * MBTA V3 API (tasks.md 18.5, Req 2.1): routes serving the stops near a point. Pure request and response helpers used
 * by the get-transit Lambda. Route labels match the app's badges (data/transit.ts): "Red Line", "Green Line",
 * "Orange Line", "Blue Line", "Commuter Rail", and bus numbers like "1" or "CT2".
 */

export const MBTA_API = 'https://api-v3.mbta.com';
/** About 450 m north-south: the stops someone would walk to from the destination. */
export const NEARBY_STOPS_RADIUS_DEG = 0.004;
export const MAX_STOPS = 20;

export function buildStopsUrl(lat: number, lng: number): string {
  const p = new URLSearchParams({
    'filter[latitude]': lat.toFixed(5),
    'filter[longitude]': lng.toFixed(5),
    'filter[radius]': String(NEARBY_STOPS_RADIUS_DEG),
    sort: 'distance',
    'page[limit]': String(MAX_STOPS),
    'fields[stop]': 'name,location_type',
  });
  return `${MBTA_API}/stops?${p.toString()}`;
}

export const buildRoutesUrl = (stopIds: string[]) =>
  `${MBTA_API}/routes?${new URLSearchParams({ 'filter[stop]': stopIds.join(','), 'fields[route]': 'short_name,long_name,type' }).toString()}`;

type JsonApi = { data?: { id?: unknown; attributes?: Record<string, unknown> }[] };

/** Stop and station ids (location_type 0 or 1); entrances and nodes carry no routes. Nearest first. */
export function parseStops(json: unknown): { stopIds: string[]; nearestName: string | null } | null {
  const data = (json as JsonApi | null)?.data;
  if (!Array.isArray(data)) return null;
  const stops = data.filter((s) => typeof s.id === 'string' && [0, 1].includes(Number(s.attributes?.location_type ?? 0)));
  return { stopIds: stops.map((s) => s.id as string), nearestName: typeof stops[0]?.attributes?.name === 'string' ? (stops[0].attributes.name as string) : null };
}

const RAIL_ORDER = ['Red Line', 'Orange Line', 'Green Line', 'Blue Line', 'Mattapan Line', 'Commuter Rail'];

/** Badge label for one MBTA route, or null for ferries and anything unknown. */
export function routeLabel(id: string, attrs: Record<string, unknown>): string | null {
  const type = Number(attrs.type);
  const long = typeof attrs.long_name === 'string' ? attrs.long_name : '';
  const short = typeof attrs.short_name === 'string' ? attrs.short_name : '';
  if (type === 0 || type === 1) {
    if (id.startsWith('Green')) return 'Green Line';
    if (id === 'Mattapan') return 'Mattapan Line';
    return long || null;
  }
  if (type === 2) return 'Commuter Rail';
  if (type === 3) return short || null;
  return null;
}

/** Unique route labels, rail first in a fixed order, then buses in numeric order. */
export function parseRoutes(json: unknown): string[] | null {
  const data = (json as JsonApi | null)?.data;
  if (!Array.isArray(data)) return null;
  const labels = new Set<string>();
  for (const r of data) {
    if (typeof r.id !== 'string' || !r.attributes) continue;
    const label = routeLabel(r.id, r.attributes);
    if (label) labels.add(label);
  }
  const rail = RAIL_ORDER.filter((l) => labels.has(l));
  const other = [...labels].filter((l) => !RAIL_ORDER.includes(l)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return [...rail, ...other];
}
