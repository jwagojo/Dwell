export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters. Used for the search radius and the Pickup geofence. */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const metersToMiles = (m: number) => m / 1609.344;

/** Move a point by metres north and east. Used by the pin nudge buttons. */
export const offsetMeters = (p: LatLng, northMeters: number, eastMeters: number): LatLng => ({
  lat: p.lat + northMeters / 111_195,
  lng: p.lng + eastMeters / (111_195 * Math.cos((p.lat * Math.PI) / 180)),
});

/** Move a point north by `meters` (used to simulate phone positions in the demo controls). */
export const offsetNorth = (p: LatLng, meters: number): LatLng => ({
  lat: p.lat + meters / 111_195,
  lng: p.lng,
});

const WALK_DETOUR_FACTOR = 1.25; // streets are longer than straight lines
const WALK_METERS_PER_MIN = 80;

/** Estimated walking distance and whole minutes from a straight-line distance. Replaced by Mapbox later. */
export function estimateWalk(straightLineMeters: number): { meters: number; minutes: number } {
  const meters = straightLineMeters * WALK_DETOUR_FACTOR;
  return { meters, minutes: Math.max(1, Math.round(meters / WALK_METERS_PER_MIN)) };
}

/** A lat/lng rectangle: what the map shows, or a square around a point. Does not handle the antimeridian (Massachusetts only). */
export interface GeoBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const boundsContain = (b: GeoBounds, p: LatLng) => p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;

/** The square that reaches `radiusMeters` from `center` in each direction. Used until a live map reports what it shows. */
export function boundsAround(center: LatLng, radiusMeters: number): GeoBounds {
  const sw = offsetMeters(center, -radiusMeters, -radiusMeters);
  const ne = offsetMeters(center, radiusMeters, radiusMeters);
  return { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng };
}
