// Feature: voltlot-mvp, Property 2: Green Score Bounds Invariant
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeGreenScore, computeSolarShare } from './climate';
import { MILES_PER_KWH } from './constants';

/**
 * For every solar size, irradiance series, transit distance and booking, solar_share and the Green Score G are finite
 * and within [0, 1]. Overnight (all zero irradiance) gives solar_share ~ 0, reported as is (design.md Property 2).
 */
const scenario = fc
  .record({
    system_kW: fc.double({ min: 0, max: 25, noNaN: true }),
    irradiance: fc.oneof(
      fc.array(fc.double({ min: 0, max: 1300, noNaN: true }), { minLength: 1, maxLength: 24 }),
      fc.integer({ min: 1, max: 24 }).map((n) => Array<number>(n).fill(0)), // overnight
    ),
    transit_miles: fc.double({ min: 0, max: 100, noNaN: true }),
    P_eff: fc.double({ min: 0.0001, max: 22, noNaN: true }),
    hoursFraction: fc.double({ min: 0.0001, max: 1, noNaN: true }),
  })
  .map((s) => ({ ...s, booked_hours: s.hoursFraction * s.irradiance.length }));

const inRange = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;

describe('Property 2: Green Score Bounds', () => {
  it('solar_share and G are finite and in [0, 1]', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const share = computeSolarShare({ system_kW: s.system_kW, P_eff: s.P_eff, booked_hours: s.booked_hours, irradiance_W_m2: s.irradiance });
        expect(share.ok).toBe(true);
        if (!share.ok) return;
        expect(inRange(share.value)).toBe(true);
        const g = computeGreenScore({
          P_eff: s.P_eff,
          booked_hours: s.booked_hours,
          solar_share: share.value,
          estimated_miles_added: s.P_eff * s.booked_hours * MILES_PER_KWH,
          transit_miles: s.transit_miles,
        });
        expect(g.ok).toBe(true);
        if (g.ok) expect(inRange(g.value)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('reports about zero solar share overnight instead of a substitute value', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const night = Array<number>(s.irradiance.length).fill(0);
        const share = computeSolarShare({ system_kW: s.system_kW, P_eff: s.P_eff, booked_hours: s.booked_hours, irradiance_W_m2: night });
        expect(share.ok && Math.abs(share.value)).toBeLessThan(0.001);
      }),
      { numRuns: 200 },
    );
  });
});
