import { LATE_MULTIPLIER, SERVICE_FEE } from './constants';
import { roundHalfUp, roundUp } from './money';
import { fail, isNum, ok, type EngineResult } from './types';

export interface BillingInput {
  price_per_hr: number;
  booked_hours: number;
  booked_end_timestamp: number; // epoch ms
  pickup_timestamp: number; // epoch ms; early pickup is allowed and earns no refund
}

export interface BillingOutput {
  late_minutes: number;
  late_fee: number;
  /** price_per_hr x booked_hours, before late fee and service fee */
  subtotal: number;
  /** service fee in dollars, derived so the receipt lines always add up to customer_total */
  service_fee: number;
  customer_total: number;
}

/** Late rate per minute, for display ("$0.12/min"). */
export const lateRatePerMinute = (price_per_hr: number): number => (price_per_hr * LATE_MULTIPLIER) / 60;

/**
 * Settle a session at the Pickup tap.
 * Whole late minutes are rounded up so the host is never under-collected (assumption: spec is silent on partial minutes).
 */
export function settle(input: BillingInput): EngineResult<BillingOutput> {
  const { price_per_hr, booked_hours, booked_end_timestamp, pickup_timestamp } = input;
  if (!isNum(price_per_hr) || price_per_hr < 0) return fail('price_per_hr');
  if (!isNum(booked_hours) || booked_hours <= 0) return fail('booked_hours');
  if (!isNum(booked_end_timestamp)) return fail('booked_end_timestamp');
  if (!isNum(pickup_timestamp)) return fail('pickup_timestamp');

  const late_minutes = Math.max(0, Math.ceil((pickup_timestamp - booked_end_timestamp) / 60000));
  // Rounded UP to the cent: rounding a small late fee down to $0 would leave the overstay electricity unpaid (Property 1).
  const late_fee = roundUp((late_minutes / 60) * (price_per_hr * LATE_MULTIPLIER), 2);
  const subtotal = roundHalfUp(price_per_hr * booked_hours, 2);
  const customer_total = roundHalfUp((price_per_hr * booked_hours + late_fee) * (1 + SERVICE_FEE), 2);
  const service_fee = roundHalfUp(customer_total - subtotal - late_fee, 2);
  return ok({ late_minutes, late_fee, subtotal, service_fee, customer_total });
}
