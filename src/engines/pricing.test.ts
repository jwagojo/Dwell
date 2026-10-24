import { describe, expect, it } from 'vitest';
import { roundHalfUp } from './money';
import { computePrice } from './pricing';

const base = { charger_kW: 9.6, local_rate: 0.3, host_earnings_hr: 1.5, booked_hours: 4 };

describe('roundHalfUp', () => {
  it('rounds the floating-point boundary cases up', () => {
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(2.675, 2)).toBe(2.68);
    expect(roundHalfUp(134.25, 1)).toBe(134.3);
    expect(roundHalfUp(19.272, 2)).toBe(19.27);
    expect(roundHalfUp(0, 2)).toBe(0);
  });
});

describe('computePrice (README §5 worked example)', () => {
  it('prices a 3 kW car on a 9.6 kW charger', () => {
    const r = computePrice({ ...base, car_max_AC_kW: 3 });
    expect(r).toEqual({ ok: true, value: { P_eff: 3, electricity_cost_per_hr: 0.9, price_per_hr: 2.4, estimated_miles_added: 42 } });
  });

  it('prices an 11 kW car, limited by the charger to 9.6 kW', () => {
    const r = computePrice({ ...base, car_max_AC_kW: 11 });
    expect(r).toEqual({ ok: true, value: { P_eff: 9.6, electricity_cost_per_hr: 2.88, price_per_hr: 4.38, estimated_miles_added: 134.4 } });
  });

  it('prices an unknown car at the charger full power', () => {
    const r = computePrice({ ...base, car_max_AC_kW: null });
    expect(r.ok && r.value.P_eff).toBe(9.6);
  });

  it('matches the UI example: Leaf 6.6 kW, $0.30/kWh, $2.75 earnings', () => {
    const r = computePrice({ ...base, car_max_AC_kW: 6.6, host_earnings_hr: 2.75 });
    expect(r.ok && r.value.price_per_hr).toBe(4.73);
  });

  it('rejects invalid input and names the field', () => {
    expect(computePrice({ ...base, car_max_AC_kW: 3, booked_hours: 0 })).toMatchObject({ ok: false, invalidInput: 'booked_hours' });
    expect(computePrice({ ...base, car_max_AC_kW: 3, charger_kW: Number.NaN })).toMatchObject({ ok: false, invalidInput: 'charger_kW' });
    expect(computePrice({ ...base, car_max_AC_kW: -1 })).toMatchObject({ ok: false, invalidInput: 'car_max_AC_kW' });
  });
});
