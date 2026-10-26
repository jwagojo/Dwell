import { describe, expect, it } from 'vitest';
import type { Booking } from '../../types/booking';
import { bookingBlock, isBookingLive, isReservationExpired, startHasPassed } from './bookingGuard';
import { checkPickupDistance } from './pickup';

const DAY = new Date(2026, 9, 26, 0, 0, 0, 0).getTime(); // local midnight
const at = (hour: number, minute = 0) => DAY + hour * 3_600_000 + minute * 60_000;

const booking = (status: Booking['status']): Booking => ({
  id: 'bk-1',
  listingId: 'vl-01',
  dayStart: DAY,
  startHour: 10,
  hours: 4, // 10 AM to 2 PM
  destination: null,
  carName: 'Nissan Leaf',
  carKw: 6.6,
  pEff: 6.6,
  pricePerHr: 3.78,
  total: 16.63,
  status,
});

describe('checkPickupDistance (50 m geofence)', () => {
  it('compares the exact distance, so 50.4 m is outside', () => {
    expect(checkPickupDistance(50.4).ok).toBe(false);
    expect(checkPickupDistance(50.01).ok).toBe(false);
  });
  it('allows the boundary and anything inside it', () => {
    expect(checkPickupDistance(50).ok).toBe(true);
    expect(checkPickupDistance(49.99).ok).toBe(true);
    expect(checkPickupDistance(0).ok).toBe(true);
  });
  it('never shows a number that contradicts the result', () => {
    expect(checkPickupDistance(50.4).metersShown).toBe(51);
    expect(checkPickupDistance(49.6).metersShown).toBe(49);
    expect(checkPickupDistance(18).metersShown).toBe(18);
  });
});

describe('reservation expiry', () => {
  it('expires a reservation once its booked window is over', () => {
    expect(isReservationExpired(booking('RESERVED'), at(13, 59))).toBe(false);
    expect(isReservationExpired(booking('RESERVED'), at(14))).toBe(true);
  });
  it('never expires a charging session: late minutes keep counting', () => {
    expect(isReservationExpired(booking('ACTIVE'), at(23))).toBe(false);
    expect(isBookingLive(booking('ACTIVE'), at(23))).toBe(true);
  });
  it('treats completed and expired bookings as not live', () => {
    expect(isBookingLive(booking('COMPLETED'), at(11))).toBe(false);
    expect(isBookingLive(booking('RESERVED'), at(15))).toBe(false);
    expect(isBookingLive(null, at(11))).toBe(false);
  });
});

describe('bookingBlock', () => {
  it('blocks while a booking is reserved or charging', () => {
    expect(bookingBlock('vl-02', booking('RESERVED'), null, at(9))).toMatchObject({ kind: 'ACTIVE_BOOKING' });
    expect(bookingBlock('vl-02', booking('ACTIVE'), null, at(16))).toMatchObject({ kind: 'ACTIVE_BOOKING' });
  });
  it('allows a new booking once the last one is completed or expired, or when there is none', () => {
    expect(bookingBlock('vl-02', booking('COMPLETED'), null, at(11))).toBeNull();
    expect(bookingBlock('vl-02', booking('RESERVED'), null, at(15))).toBeNull();
    expect(bookingBlock('vl-02', null, null, at(11))).toBeNull();
  });
  it('blocks the host from booking their own listing', () => {
    expect(bookingBlock('host-1', null, 'host-1', at(11))).toEqual({ kind: 'OWN_LISTING' });
    expect(bookingBlock('vl-02', null, 'host-1', at(11))).toBeNull();
  });
});

describe('startHasPassed', () => {
  it('treats earlier hours as passed and the current hour as still bookable', () => {
    expect(startHasPassed(9, at(10, 20))).toBe(true);
    expect(startHasPassed(10, at(10, 20))).toBe(false);
    expect(startHasPassed(18, at(10, 20))).toBe(false);
  });
});
