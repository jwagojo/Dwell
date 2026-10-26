import type { Booking } from '../../types/booking';
import { bookedEndTs } from './settleBooking';

/**
 * A reservation the driver never checked in to, whose booked window is over. It no longer blocks a new booking or
 * shows as active. Nothing is charged or released: no-show rules are an open product decision (product.md), so this
 * only stops a stale reservation from hanging around forever.
 */
export const isReservationExpired = (b: Booking, nowMs: number): boolean => b.status === 'RESERVED' && nowMs >= bookedEndTs(b);

/** Reserved (and not expired) or charging. A charging session past its end stays live: late minutes keep counting. */
export const isBookingLive = (b: Booking | null, nowMs: number): boolean =>
  b !== null && b.status !== 'COMPLETED' && !isReservationExpired(b, nowMs);

/**
 * Why a listing cannot be booked right now, for reasons about the account rather than the charger:
 * - ACTIVE_BOOKING: the account already has a session that is reserved or charging. Booking again would replace it
 *   (the prototype keeps one booking per account), losing the running session and its bill.
 * - OWN_LISTING: the account is the host of this listing.
 * Returns null when booking is allowed. A completed or expired booking does not block a new one.
 */
export type BookingBlock = { kind: 'ACTIVE_BOOKING'; booking: Booking } | { kind: 'OWN_LISTING' } | null;

export function bookingBlock(listingId: string, current: Booking | null, hostListingId: string | null, nowMs: number): BookingBlock {
  if (hostListingId !== null && listingId === hostListingId) return { kind: 'OWN_LISTING' };
  if (current && isBookingLive(current, nowMs)) return { kind: 'ACTIVE_BOOKING', booking: current };
  return null;
}

/**
 * Bookings are for today. A start hour earlier than the current hour has already passed. The current hour itself
 * still counts as "now", so a driver arriving at 10:20 can book from 10 AM.
 */
export const startHasPassed = (startHour: number, nowMs: number): boolean => startHour < new Date(nowMs).getHours();
