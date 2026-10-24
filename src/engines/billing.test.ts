import { describe, expect, it } from 'vitest';
import { lateRatePerMinute, settle } from './billing';

const END = 1_000_000_000_000;
const MIN = 60_000;
const at = (price: number, hours: number, lateMin: number) =>
  settle({ price_per_hr: price, booked_hours: hours, booked_end_timestamp: END, pickup_timestamp: END + lateMin * MIN });

describe('settle', () => {
  it('bills on-time sessions with the 10% fee (README worked examples)', () => {
    expect(at(2.4, 4, 0)).toMatchObject({ ok: true, value: { late_minutes: 0, late_fee: 0, customer_total: 10.56 } });
    expect(at(4.38, 4, 0)).toMatchObject({ ok: true, value: { customer_total: 19.27 } });
  });

  it('bills the README late example: $2.00/hr price, 30 minutes late = $1.50', () => {
    expect(at(2, 1, 30)).toMatchObject({ ok: true, value: { late_minutes: 30, late_fee: 1.5 } });
  });

  it('matches the UI example: $4.73/hr, 4 h, 25 min late', () => {
    expect(at(4.73, 4, 25)).toMatchObject({ ok: true, value: { late_fee: 2.96, customer_total: 24.07 } });
  });

  it('gives no refund for early pickup', () => {
    expect(at(4.73, 4, -60)).toMatchObject({ ok: true, value: { late_minutes: 0, customer_total: 20.81 } });
  });

  it('rounds a partial late minute up and has no grace period', () => {
    const r = settle({ price_per_hr: 2, booked_hours: 1, booked_end_timestamp: END, pickup_timestamp: END + 1000 });
    expect(r).toMatchObject({ ok: true, value: { late_minutes: 1 } });
  });

  it('keeps receipt lines adding up to the total', () => {
    const r = at(4.73, 4, 25);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.subtotal + r.value.late_fee + r.value.service_fee).toBeCloseTo(r.value.customer_total, 2);
  });

  it('rejects invalid input', () => {
    expect(at(-1, 4, 0)).toMatchObject({ ok: false, invalidInput: 'price_per_hr' });
  });
});

describe('lateRatePerMinute', () => {
  it('is 1.5x the hourly price divided by 60', () => {
    expect(lateRatePerMinute(4.73)).toBeCloseTo(0.1183, 3);
  });
});
