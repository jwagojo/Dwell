import { describe, expect, it } from 'vitest';
import { manualCar, versionLabel } from './CarPicker';

describe('manualCar (My car isn’t listed)', () => {
  it('builds a car with a known speed, rounded to 0.1 kW', () => {
    expect(manualCar({ name: '  Kia   EV6 ', kw: '10.94', unknownKw: false, plug: 'J1772' })).toEqual({ ok: true, car: { id: 'other', name: 'Kia EV6', maxAcKw: 10.9, plug: 'J1772' } });
  });

  it('leaves the speed unknown (priced at the charger’s full power)', () => {
    expect(manualCar({ name: 'Lucid Air', kw: '', unknownKw: true, plug: 'NACS' })).toEqual({ ok: true, car: { id: 'other', name: 'Lucid Air', maxAcKw: null, plug: 'NACS' } });
  });

  it.each([
    [{ name: 'K', kw: '7', unknownKw: false }, 'name'],
    [{ name: 'Kia EV6', kw: '', unknownKw: false }, 'kw'],
    [{ name: 'Kia EV6', kw: '2.9', unknownKw: false }, 'kw'],
    [{ name: 'Kia EV6', kw: '48', unknownKw: false }, 'kw'],
  ])('rejects %j on %s', (input, field) => {
    expect(manualCar({ plug: 'J1772', ...input })).toMatchObject({ ok: false, field });
  });

  it('labels entered and listed cars', () => {
    expect(versionLabel({ id: 'other', name: 'Kia EV6', maxAcKw: null, plug: 'J1772' })).toBe('Entered by you · speed unknown');
    expect(versionLabel({ id: 'x', name: '2024 Tesla Model Y Long Range', maxAcKw: 11, plug: 'NACS', make: 'Tesla', model: 'Model Y', year: 2024, version: 'Long Range' })).toBe('2024 Long Range · 11 kW');
  });
});
