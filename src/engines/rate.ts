import { DEFAULT_LOCAL_RATE, MAX_LOCAL_RATE, MIN_LOCAL_RATE } from './constants';
import { roundHalfUp } from './money';

/**
 * Electricity-rate selection. Pure and deterministic: no network, no clock.
 *
 * The MVP rate is ONE Massachusetts statewide residential average from the U.S. Energy Information Administration
 * (EIA). It is not ZIP-specific and not utility-specific: a ZIP only tells us the host is at a supported
 * Massachusetts location. EIA reports cents per kWh, monthly, a couple of months behind, so the result is an estimate
 * the host can replace with the rate on their electricity bill.
 */

export const CENTS_PER_DOLLAR = 100;

export type RateSource = 'EIA' | 'DEFAULT_0_30';

/** One validated EIA record: the price exactly as EIA reports it (cents per kWh) and the month it describes. */
export interface EiaRate {
  centsPerKwh: number;
  /** Data month as returned by EIA, "YYYY-MM" */
  period: string;
}

export interface RateResolution {
  /** Dollars per kWh */
  local_rate: number;
  source: RateSource;
  /** "YYYY-MM" of the EIA data, or null for the fallback */
  dataMonth: string | null;
  overridable: true;
}

export const isValidDataMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** EIA cents/kWh -> dollars/kWh. Rounded to 5 decimals to remove floating-point noise (30.48 -> 0.3048). */
export const centsToDollars = (cents: number): number => roundHalfUp(cents / CENTS_PER_DOLLAR, 5);

/** The cents range that converts to a plausible residential rate. Anything outside is treated as bad data. */
export const MIN_VALID_CENTS = MIN_LOCAL_RATE * CENTS_PER_DOLLAR;
export const MAX_VALID_CENTS = MAX_LOCAL_RATE * CENTS_PER_DOLLAR;

export const isPlausibleCents = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= MIN_VALID_CENTS && v <= MAX_VALID_CENTS;

/**
 * Pick the rate to pre-fill. A valid EIA record wins; anything else (no record, bad month, implausible price) gives
 * the documented $0.30/kWh fallback estimate. Either way the host may override it.
 */
export function resolveRate(eia: EiaRate | null): RateResolution {
  if (eia && isValidDataMonth(eia.period) && isPlausibleCents(eia.centsPerKwh)) {
    return { local_rate: centsToDollars(eia.centsPerKwh), source: 'EIA', dataMonth: eia.period, overridable: true };
  }
  return { local_rate: DEFAULT_LOCAL_RATE, source: 'DEFAULT_0_30', dataMonth: null, overridable: true };
}
