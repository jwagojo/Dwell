import { SEARCH_RADIUS_MI_MAX, SEARCH_RADIUS_MI_MIN } from '../../engines/constants';
import { haversineDistanceMeters, type LatLng } from '../../lib/geo';
import type { Listing } from '../../types/listing';

export const METERS_PER_MILE = 1609.344;

/** Keep a radius within the supported range (Req 2.1); anything unreadable gives null. */
export function clampRadiusMiles(miles: unknown): number | null {
  if (typeof miles !== 'number' || !Number.isFinite(miles)) return null;
  return Math.min(Math.max(miles, SEARCH_RADIUS_MI_MIN), SEARCH_RADIUS_MI_MAX);
}

/**
 * Listings within `radiusMiles` of `center`, by great-circle distance (voltlot-rules.md §2: DynamoDB has no radius
 * query, so the filter runs here). The radius is inclusive and clamped to 0.1 to 25 miles. Inactive listings never
 * reach the app, so there is nothing to drop for them.
 */
export function filterByRadius(listings: Listing[], center: LatLng, radiusMiles: number): Listing[] {
  const radiusM = (clampRadiusMiles(radiusMiles) ?? SEARCH_RADIUS_MI_MIN) * METERS_PER_MILE;
  return listings.filter((l) => haversineDistanceMeters(center, l) <= radiusM);
}
