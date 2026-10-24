import { sampleIrradianceFor } from '../../data/sampleIrradiance';
import { settle } from '../../engines/billing';
import { computeEmissions, computeGreenScore, computeSolarShare } from '../../engines/climate';
import { MILES_PER_KWH } from '../../engines/constants';
import { roundHalfUp } from '../../engines/money';
import { haversineDistanceMeters, metersToMiles } from '../../lib/geo';
import type { Booking, BookingResult } from '../../types/booking';
import type { Listing } from '../../types/listing';

export const bookedEndTs = (b: Booking) => b.dayStart + (b.startHour + b.hours) * 3_600_000;
export const bookedStartTs = (b: Booking) => b.dayStart + b.startHour * 3_600_000;

/** Final bill plus the impact numbers shown on the receipt, from the values frozen at booking time. */
export function settleBooking(b: Booking, listing: Listing, pickupAt: number, flagged: boolean): BookingResult | null {
  const bill = settle({
    price_per_hr: b.pricePerHr,
    booked_hours: b.hours,
    booked_end_timestamp: bookedEndTs(b),
    pickup_timestamp: pickupAt,
  });
  if (!bill.ok) return null;

  const milesAdded = roundHalfUp(b.pEff * b.hours * MILES_PER_KWH, 1);
  let solarShare: number | null = null;
  let co2Kg: number | null = null;
  let greenScore: number | null = null;

  const share = computeSolarShare({
    system_kW: listing.solarKw,
    P_eff: b.pEff,
    booked_hours: b.hours,
    irradiance_W_m2: sampleIrradianceFor(b.startHour, b.hours),
  });
  if (share.ok) {
    solarShare = share.value;
    const input = {
      P_eff: b.pEff,
      booked_hours: b.hours,
      solar_share: share.value,
      estimated_miles_added: milesAdded,
      transit_miles: metersToMiles(haversineDistanceMeters(listing, b.destination)),
    };
    const emissions = computeEmissions(input);
    if (emissions.ok) co2Kg = Math.max(emissions.value.gas_co2_saved_kg, 0);
    const g = computeGreenScore(input);
    if (g.ok) greenScore = g.value;
  }

  return {
    pickupAt,
    lateMinutes: bill.value.late_minutes,
    lateFee: bill.value.late_fee,
    subtotal: bill.value.subtotal,
    serviceFee: bill.value.service_fee,
    total: bill.value.customer_total,
    flagged,
    milesAdded,
    solarShare,
    co2Kg,
    greenScore,
  };
}
