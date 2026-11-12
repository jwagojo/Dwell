// Feature: voltlot-mvp, Property 1: Host Cost Upper-Bound Invariant
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { settle } from './billing';
import { computePrice } from './pricing';

/**
 * The host's payout (excluding the service fee) never falls below the most electricity the booked car can draw,
 * during the booking and any overstay. The car draws at most P_eff = min(charger_kW, car_max_AC_kW), and an unknown
 * car is priced as the charger's full kW (design.md Property 1, as amended Oct 28, 2026).
 */
const inputs = fc.record({
  charger_kW: fc.double({ min: 1.44, max: 19.2, noNaN: true }),
  car_max_AC_kW: fc.option(fc.double({ min: 3.0, max: 22.0, noNaN: true }), { nil: null }),
  local_rate: fc.double({ min: 0.1, max: 0.65, noNaN: true }),
  // 0 is where rounding bites, so it is drawn often; the rest of the range is covered too.
  host_earnings_hr: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 1000, noNaN: true })),
  booked_hours: fc.double({ min: 0.5, max: 24, noNaN: true }),
  late_minutes: fc.integer({ min: 0, max: 720 }),
});

describe('Property 1: Host Cost Upper-Bound', () => {
  it('payout >= P_eff x (booked + late hours) x local_rate', () => {
    fc.assert(
      fc.property(inputs, (i) => {
        const price = computePrice(i);
        expect(price.ok).toBe(true);
        if (!price.ok) return;
        const end = 1_800_000_000_000;
        const bill = settle({
          price_per_hr: price.value.price_per_hr,
          booked_hours: i.booked_hours,
          booked_end_timestamp: end,
          pickup_timestamp: end + i.late_minutes * 60_000,
        });
        expect(bill.ok).toBe(true);
        if (!bill.ok) return;
        const P_eff = Math.min(i.charger_kW, i.car_max_AC_kW ?? i.charger_kW);
        const payout = price.value.price_per_hr * i.booked_hours + bill.value.late_fee;
        const maxCost = P_eff * (i.booked_hours + bill.value.late_minutes / 60) * i.local_rate;
        // 1e-9 absorbs floating-point noise in the comparison itself, not rounding in the engines.
        expect(payout).toBeGreaterThanOrEqual(maxCost - 1e-9);
      }),
      { numRuns: 500 },
    );
  });

  it('the unknown-car worst case prices at the charger full power', () => {
    fc.assert(
      fc.property(inputs, (i) => {
        const r = computePrice({ ...i, car_max_AC_kW: null });
        expect(r.ok && r.value.P_eff).toBe(i.charger_kW);
      }),
      { numRuns: 100 },
    );
  });
});

// Kept separate so it fails loudly if someone reintroduces half-up rounding of the electricity cost.
describe('Property 1 regression', () => {
  it('holds at the counterexample found on Oct 28, 2026 with half-up rounding', () => {
    // 1.44 kW x $0.1003/kWh = $0.144432/hr: half-up gives $0.14 and under-collects; rounding up gives $0.15.
    const p = computePrice({ charger_kW: 1.44, car_max_AC_kW: null, local_rate: 0.1003, host_earnings_hr: 0, booked_hours: 24 });
    expect(p.ok && p.value.electricity_cost_per_hr).toBe(0.15);
    expect(p.ok && p.value.price_per_hr * 24).toBeGreaterThanOrEqual(1.44 * 24 * 0.1003);
  });

  it('holds when one late minute has a sub-cent late fee (found Oct 28, 2026)', () => {
    // 1 min at $0.15/hr x 1.5 = $0.00375: half-up gave $0.00 and left the minute of electricity unpaid.
    const i = { charger_kW: 1.4516129225806422, car_max_AC_kW: null, local_rate: 0.1000000000000002, host_earnings_hr: 0, booked_hours: 0.5 };
    const p = computePrice(i);
    if (!p.ok) throw new Error('price');
    const bill = settle({ price_per_hr: p.value.price_per_hr, booked_hours: 0.5, booked_end_timestamp: 0, pickup_timestamp: 60_000 });
    if (!bill.ok) throw new Error('bill');
    expect(bill.value.late_fee).toBe(0.01);
    expect(p.value.price_per_hr * 0.5 + bill.value.late_fee).toBeGreaterThanOrEqual(i.charger_kW * (0.5 + 1 / 60) * i.local_rate);
  });
});
