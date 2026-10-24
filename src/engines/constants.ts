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
