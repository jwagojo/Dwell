// Single home for every rate, multiplier, weight, radius and limit.
// Values marked PLACEHOLDER are provisional (README §5, §6, §10). Change them here only.

export const MILES_PER_KWH = 3.5;

export const LATE_MULTIPLIER = 1.5; // PLACEHOLDER
export const SERVICE_FEE = 0.1; // PLACEHOLDER
export const PICKUP_RADIUS_M = 50; // PLACEHOLDER

export const GAS_KG_PER_MILE = 0.4; // PLACEHOLDER (EPA typical passenger vehicle, verify)
export const GRID_KG_PER_KWH = 0.33; // PLACEHOLDER (ISO-NE factor, to look up)

export const HOUSE_LOAD_KW = 1.0;
export const SOLAR_LOSS_FACTOR = 0.8;
export const FULL_SUN_W_M2 = 1000;

export const GREEN_WEIGHTS = { solar: 0.5, transit: 0.25, co2: 0.25 } as const; // PLACEHOLDER
export const GREEN_REF_TRANSIT_MILES = 20; // PLACEHOLDER
export const GREEN_REF_CO2_KG = 5; // PLACEHOLDER

export const DEFAULT_LOCAL_RATE = 0.3; // $/kWh fallback estimate when the EIA lookup is unavailable or invalid
export const RATE_LOOKUP_TIMEOUT_MS = 5_000; // budget for the EIA electricity-price lookup
export const EARNINGS_CAP_MULTIPLE = 2;
export const SUGGESTED_EARNINGS_HR = 2.75; // PLACEHOLDER: suggested host earnings per hour
export const MIN_LOCAL_RATE = 0.05;
export const MAX_LOCAL_RATE = 1.0;

export const CHARGER_KW_MIN = 1.44;
export const CHARGER_KW_MAX = 19.2;
/** Level 2 starts at 3.0 kW; Level 1 tops out at 1.92 kW (16 A at 120 V). */
export const L2_KW_MIN = 3.0;
export const L1_KW_MAX = 1.92;
/** Largest home solar system the host form accepts, kW. Property 2's domain stops at 25 kW (open decision, tech.md). */
export const SOLAR_KW_MAX = 50;
/** Car max AC charge rate accepted for a manually entered car, kW (same range as the seeded EVSpec table). */
export const CAR_KW_MIN = 3.0;
export const CAR_KW_MAX = 22.0;
export const MAX_SPOTS = 4;
export const MAX_LISTING_PHOTOS = 8;
export const MIN_INSTRUCTIONS_CHARS = 20;
/** Bookings are whole hours, today only. */
export const MAX_BOOKING_HOURS = 12;
/** Largest photo upload accepted by the API, bytes. The app resizes photos to small JPEGs first. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
