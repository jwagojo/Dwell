import { MILES_PER_KWH } from './constants';
import { roundHalfUp, roundUp } from './money';
import { fail, isNum, ok, type EngineResult } from './types';

export interface PricingInput {
  charger_kW: number; // > 0
  car_max_AC_kW: number | null; // null = unknown car, priced at the charger's full power
  local_rate: number; // $/kWh, > 0
  host_earnings_hr: number; // >= 0
  booked_hours: number; // > 0
}

export interface PricingOutput {
  P_eff: number;
  electricity_cost_per_hr: number;
  price_per_hr: number;
  estimated_miles_added: number;
}

/** P_eff = min(charger kW, car kW). The price is an upper bound on the host's electricity cost. */
export function computePrice(input: PricingInput): EngineResult<PricingOutput> {
  const { charger_kW, car_max_AC_kW, local_rate, host_earnings_hr, booked_hours } = input;
  if (!isNum(charger_kW) || charger_kW <= 0) return fail('charger_kW');
  if (car_max_AC_kW !== null && (!isNum(car_max_AC_kW) || car_max_AC_kW <= 0)) return fail('car_max_AC_kW');
  if (!isNum(local_rate) || local_rate <= 0) return fail('local_rate');
  if (!isNum(host_earnings_hr) || host_earnings_hr < 0) return fail('host_earnings_hr');
  if (!isNum(booked_hours) || booked_hours <= 0) return fail('booked_hours');

  const P_eff = Math.min(charger_kW, car_max_AC_kW ?? charger_kW);
  // Rounded UP to the cent so the price never falls below the electricity the car can draw (Property 1, tasks.md 5.2).
  const electricity_cost_per_hr = roundUp(P_eff * local_rate, 2);
  const price_per_hr = roundHalfUp(electricity_cost_per_hr + host_earnings_hr, 2);
  const estimated_miles_added = roundHalfUp(P_eff * booked_hours * MILES_PER_KWH, 1);
  return ok({ P_eff, electricity_cost_per_hr, price_per_hr, estimated_miles_added });
}
