import { sampleIrradianceFor } from '../../data/sampleIrradiance';
import { settle } from '../../engines/billing';
import { computeGreenScore, computeSolarShare, greenScoreTerms, type GreenScoreTerms } from '../../engines/climate';
import { isPlugBookable } from '../../engines/plug';
import { computePrice } from '../../engines/pricing';
import { isOpenFor } from '../../lib/availability';
import { estimateWalk, haversineDistanceMeters, metersToMiles, type LatLng } from '../../lib/geo';
import type { Car, Listing } from '../../types/listing';

export interface SearchWindow {
  /** Hour of day the booking starts, 0..23 */
  startHour: number;
  /** Whole hours, 1..12 */
  hours: number;
  /** Monday = 0 */
  dayIndex: number;
}

export interface Evaluation {
  listing: Listing;
  plugOk: boolean;
  open: boolean;
  chargerSlower: boolean;
  /** Straight-line meters from the listing to the destination. null when the driver has not chosen a destination. */
  distanceM: number | null;
  walkMinutes: number | null;
  walkMeters: number | null;
  /** True when the walk is the straight-line estimate, false when it is a routed walk (Mapbox) */
  walkEstimated: boolean;
  /** Straight-line miles from the listing to the destination. An estimate: no trip planner or Directions yet. null without a destination. */
  transitMiles: number | null;
  pEff: number;
  electricityPerHr: number;
  pricePerHr: number;
  /** Customer total for the window, service fee included */
  total: number;
  milesAdded: number;
  /** null when sunlight data is unavailable */
  solarShare: number | null;
  /** null when sunlight data is unavailable or there is no destination (the transit term needs one) */
  greenScore: number | null;
  greenTerms: GreenScoreTerms | null;
}

/**
 * Combine the pure engines for one listing, one car and one booking window. Returns null if inputs are invalid.
 * `destination` is null when the driver is just browsing the map: the price and the solar share still work, but the
 * walk, the transit miles and therefore the Green Score do not, and they stay null instead of being guessed.
 */
export interface LiveData {
  /**
   * Hourly irradiance for the booking window (Open-Meteo). Omitted: the sample clear-day profile (prototype and the
   * landing illustration). null: unavailable, so solar share and the Green Score are reported unavailable (Req 4.2).
   */
  irradiance?: number[] | null;
  /** A routed walk to the destination. Omitted or null: the straight-line estimate. */
  walk?: { minutes: number; meters: number } | null;
}

export function evaluateListing(listing: Listing, car: Car, destination: LatLng | null, win: SearchWindow, live: LiveData = {}): Evaluation | null {
  const price = computePrice({
    charger_kW: listing.chargerKw,
    car_max_AC_kW: car.maxAcKw,
    local_rate: listing.rate,
    host_earnings_hr: listing.earningsHr,
    booked_hours: win.hours,
  });
  if (!price.ok) return null;
  const { P_eff, electricity_cost_per_hr, price_per_hr, estimated_miles_added } = price.value;

  const billing = settle({ price_per_hr, booked_hours: win.hours, booked_end_timestamp: 0, pickup_timestamp: 0 });
  if (!billing.ok) return null;

  const distanceM = destination ? haversineDistanceMeters(listing, destination) : null;
  const routedWalk = distanceM !== null ? (live.walk ?? null) : null;
  const walk = routedWalk ?? (distanceM !== null ? estimateWalk(distanceM) : null);
  const transitMiles = distanceM !== null ? metersToMiles(distanceM) : null;

  let solarShare: number | null = null;
  let greenScore: number | null = null;
  let greenTerms: GreenScoreTerms | null = null;
  const share = computeSolarShare({
    system_kW: listing.solarKw,
    P_eff,
    booked_hours: win.hours,
    irradiance_W_m2: live.irradiance === undefined ? sampleIrradianceFor(win.startHour, win.hours) : (live.irradiance ?? []),
  });
  if (share.ok) {
    solarShare = share.value;
  }
  if (share.ok && transitMiles !== null) {
    const climateInput = {
      P_eff,
      booked_hours: win.hours,
      solar_share: share.value,
      estimated_miles_added,
      transit_miles: transitMiles,
    };
    const g = computeGreenScore(climateInput);
    const terms = greenScoreTerms(climateInput);
    if (g.ok) greenScore = g.value;
    if (terms.ok) greenTerms = terms.value;
  }

  return {
    listing,
    plugOk: isPlugBookable(listing.plug, listing.adapters, car.plug),
    open: isOpenFor(listing.windows, win.dayIndex, win.startHour, win.hours),
    chargerSlower: car.maxAcKw !== null && listing.chargerKw < car.maxAcKw,
    distanceM,
    walkMinutes: walk?.minutes ?? null,
    walkMeters: walk?.meters ?? null,
    walkEstimated: routedWalk === null,
    transitMiles,
    pEff: P_eff,
    electricityPerHr: electricity_cost_per_hr,
    pricePerHr: price_per_hr,
    total: billing.value.customer_total,
    milesAdded: estimated_miles_added,
    solarShare,
    greenScore,
    greenTerms,
  };
}

export type SortMode = 'fit' | 'price';

/** Best fit: chargers at least as fast as the car first, then shortest walk. Price: cheapest per hour first. */
export function sortEvaluations(list: Evaluation[], mode: SortMode): Evaluation[] {
  const copy = [...list];
  // Without a destination there is no walk to compare, so every listing ties on it and price decides.
  const walk = (e: Evaluation) => e.walkMinutes ?? 0;
  if (mode === 'price') return copy.sort((a, b) => a.pricePerHr - b.pricePerHr || walk(a) - walk(b));
  return copy.sort((a, b) => Number(a.chargerSlower) - Number(b.chargerSlower) || walk(a) - walk(b) || a.pricePerHr - b.pricePerHr);
}

export const SEARCH_RADIUS_M = 2500;
