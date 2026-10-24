import {
  FULL_SUN_W_M2,
  GAS_KG_PER_MILE,
  GREEN_REF_CO2_KG,
  GREEN_REF_TRANSIT_MILES,
  GREEN_WEIGHTS,
  GRID_KG_PER_KWH,
  HOUSE_LOAD_KW,
  SOLAR_LOSS_FACTOR,
} from './constants';
import { roundHalfUp } from './money';
import { fail, isNum, ok, type EngineResult } from './types';

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

export interface SolarShareInput {
  system_kW: number; // >= 0
  P_eff: number; // > 0
  booked_hours: number; // > 0
  irradiance_W_m2: number[]; // hourly values from the booking start; needs ceil(booked_hours) entries
}

/**
 * solar_share = sum(usable solar kW per hour) / (P_eff x booked_hours), clamped to [0, 1].
 * For a fractional booked_hours the last partial hour counts as a full hour of sunlight, then the clamp applies.
 */
export function computeSolarShare(input: SolarShareInput): EngineResult<number> {
  const { system_kW, P_eff, booked_hours, irradiance_W_m2 } = input;
  if (!isNum(system_kW) || system_kW < 0) return fail('system_kW');
  if (!isNum(P_eff) || P_eff <= 0) return fail('P_eff');
  if (!isNum(booked_hours) || booked_hours <= 0) return fail('booked_hours');
  const hoursNeeded = Math.ceil(booked_hours);
  if (!Array.isArray(irradiance_W_m2) || irradiance_W_m2.length < hoursNeeded) {
    return fail('irradiance_W_m2', 'Solar data unavailable');
  }
  let usableTotal = 0;
  for (let h = 0; h < hoursNeeded; h++) {
    const I = irradiance_W_m2[h];
    if (!isNum(I) || I < 0) return fail('irradiance_W_m2', 'Solar data unavailable');
    const solar_kW = system_kW * (I / FULL_SUN_W_M2) * SOLAR_LOSS_FACTOR;
    usableTotal += Math.min(Math.max(solar_kW - HOUSE_LOAD_KW, 0), P_eff);
  }
  return ok(clamp01(usableTotal / (P_eff * booked_hours)));
}

export interface EmissionsInput {
  P_eff: number;
  booked_hours: number;
  solar_share: number;
  estimated_miles_added: number;
}

export interface EmissionsOutput {
  grid_kWh: number;
  gas_co2_saved_kg: number;
}

export function computeEmissions(input: EmissionsInput): EngineResult<EmissionsOutput> {
  const { P_eff, booked_hours, solar_share, estimated_miles_added } = input;
  if (!isNum(P_eff) || P_eff <= 0) return fail('P_eff');
  if (!isNum(booked_hours) || booked_hours <= 0) return fail('booked_hours');
  if (!isNum(solar_share) || solar_share < 0) return fail('solar_share');
  if (!isNum(estimated_miles_added) || estimated_miles_added < 0) return fail('estimated_miles_added');
  const grid_kWh = P_eff * booked_hours * (1 - solar_share);
  const gas_co2_saved_kg = estimated_miles_added * GAS_KG_PER_MILE - grid_kWh * GRID_KG_PER_KWH;
  return ok({ grid_kWh, gas_co2_saved_kg });
}

export interface GreenScoreInput extends EmissionsInput {
  transit_miles: number; // >= 0
}

export interface GreenScoreTerms {
  solar: { value: number; weight: number; score: number };
  transit: { value: number; reference: number; weight: number; score: number };
  co2: { value: number; reference: number; weight: number; score: number };
}

/** The three weighted terms behind the score, so the UI can show the formula as a table. */
export function greenScoreTerms(input: GreenScoreInput): EngineResult<GreenScoreTerms> {
  const { transit_miles } = input;
  if (!isNum(transit_miles) || transit_miles < 0) return fail('transit_miles');
  const emissions = computeEmissions(input);
  if (!emissions.ok) return emissions;
  const co2 = Math.max(emissions.value.gas_co2_saved_kg, 0);
  return ok({
    solar: { value: input.solar_share, weight: GREEN_WEIGHTS.solar, score: GREEN_WEIGHTS.solar * input.solar_share },
    transit: {
      value: transit_miles,
      reference: GREEN_REF_TRANSIT_MILES,
      weight: GREEN_WEIGHTS.transit,
      score: GREEN_WEIGHTS.transit * Math.min(transit_miles / GREEN_REF_TRANSIT_MILES, 1),
    },
    co2: {
      value: co2,
      reference: GREEN_REF_CO2_KG,
      weight: GREEN_WEIGHTS.co2,
      score: GREEN_WEIGHTS.co2 * Math.min(co2 / GREEN_REF_CO2_KG, 1),
    },
  });
}

/** Green Score G in [0, 1], rounded to 3 decimal places. */
export function computeGreenScore(input: GreenScoreInput): EngineResult<number> {
  const terms = greenScoreTerms(input);
  if (!terms.ok) return terms;
  const g = terms.value.solar.score + terms.value.transit.score + terms.value.co2.score;
  return ok(roundHalfUp(clamp01(g), 3));
}
