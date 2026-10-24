import { describe, expect, it } from 'vitest';
import { computeEmissions, computeGreenScore, computeSolarShare } from './climate';

describe('computeSolarShare', () => {
  it('matches the hand vector: 6 kW system, 650 W/m2 for 4 h, 9.6 kW draw', () => {
    const r = computeSolarShare({ system_kW: 6, P_eff: 9.6, booked_hours: 4, irradiance_W_m2: [650, 650, 650, 650] });
    expect(r.ok && r.value).toBeCloseTo(0.2208, 3);
  });

  it('matches the UI example: 5.9 kW system on the sample morning profile', () => {
    const r = computeSolarShare({ system_kW: 5.9, P_eff: 6.6, booked_hours: 4, irradiance_W_m2: [540, 600, 620, 590] });
    expect(r.ok && r.value).toBeCloseTo(0.2686, 3);
  });

  it('subtracts the 1 kW house load: weak sun gives zero usable solar', () => {
    const r = computeSolarShare({ system_kW: 1, P_eff: 3, booked_hours: 2, irradiance_W_m2: [500, 500] });
    expect(r.ok && r.value).toBe(0);
  });

  it('never exceeds the car draw: huge system, full sun', () => {
    const r = computeSolarShare({ system_kW: 25, P_eff: 3, booked_hours: 2, irradiance_W_m2: [1300, 1300] });
    expect(r.ok && r.value).toBe(1);
  });

  it('returns about 0 overnight, without substituting a larger value', () => {
    const r = computeSolarShare({ system_kW: 10, P_eff: 7.2, booked_hours: 8, irradiance_W_m2: Array(8).fill(0) });
    expect(r.ok && Math.abs(r.value)).toBeLessThan(0.001);
  });

  it('reports solar data unavailable when the series is too short', () => {
    expect(computeSolarShare({ system_kW: 6, P_eff: 6, booked_hours: 4, irradiance_W_m2: [500, 500, 500] })).toMatchObject({
      ok: false,
      invalidInput: 'irradiance_W_m2',
    });
  });

  it('rejects negative or missing numbers and names the field', () => {
    expect(computeSolarShare({ system_kW: -1, P_eff: 6, booked_hours: 1, irradiance_W_m2: [500] })).toMatchObject({ ok: false, invalidInput: 'system_kW' });
  });
});

describe('emissions and Green Score', () => {
  it('computes grid kWh and gas CO2 saved', () => {
    const r = computeEmissions({ P_eff: 9.6, booked_hours: 4, solar_share: 0, estimated_miles_added: 134.4 });
    expect(r.ok && r.value.grid_kWh).toBeCloseTo(38.4, 6);
    expect(r.ok && r.value.gas_co2_saved_kg).toBeCloseTo(134.4 * 0.4 - 38.4 * 0.33, 6);
  });

  it('matches the hand vector: G = 0.442', () => {
    const r = computeGreenScore({ P_eff: 9.6, booked_hours: 4, solar_share: 0.220833, estimated_miles_added: 134.4, transit_miles: 6.5 });
    expect(r).toEqual({ ok: true, value: 0.442 });
  });

  it('matches the UI example: Pearl St listing scores about 0.39', () => {
    const r = computeGreenScore({ P_eff: 6.6, booked_hours: 4, solar_share: 0.26864, estimated_miles_added: 92.4, transit_miles: 0.39 });
    expect(r.ok && r.value).toBeCloseTo(0.389, 3);
  });

  it('stays within [0, 1] at the extremes', () => {
    const hi = computeGreenScore({ P_eff: 22, booked_hours: 24, solar_share: 1, estimated_miles_added: 1848, transit_miles: 100 });
    const lo = computeGreenScore({ P_eff: 0.5, booked_hours: 1, solar_share: 0, estimated_miles_added: 0, transit_miles: 0 });
    expect(hi.ok && hi.value).toBe(1);
    expect(lo.ok && lo.value).toBe(0);
  });

  it('rejects negative transit miles', () => {
    expect(computeGreenScore({ P_eff: 6, booked_hours: 1, solar_share: 0.2, estimated_miles_added: 21, transit_miles: -1 })).toMatchObject({
      ok: false,
      invalidInput: 'transit_miles',
    });
  });
});
