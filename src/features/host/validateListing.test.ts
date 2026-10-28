import { describe, expect, it } from 'vitest';
import { FIELD_STEP, validateListingInput } from './validateListing';

const valid = (over: Record<string, unknown> = {}) => ({
  title: 'Central driveway',
  street: '',
  neighborhood: '',
  address: { line: '12 Pearl St', unit: '', city: 'Cambridge', zip: '02139' },
  lat: 42.3636,
  lng: -71.1046,
  spotType: 'Driveway',
  spots: 2,
  rightToList: true,
  level: 'L2',
  chargerKw: 9.6,
  plug: 'J1772',
  adapters: 'J1772_TO_NACS',
  outdoorOutlet: false,
  solarKw: 0,
  rate: 0.3,
  rateSource: 'FALLBACK',
  rateDataMonth: null,
  earningsHr: 2.75,
  windows: [{ id: 'w1', days: [4, 0, 0], start: 20, end: 6 }],
  instructions: 'Pull all the way up the driveway, charger on the left.',
  photoKeys: ['media/listings/l1/a.jpg'],
  termsAccepted: true,
  ...over,
});

const errorsOf = (over: Record<string, unknown>) => {
  const r = validateListingInput(valid(over));
  return r.ok ? {} : r.errors;
};

describe('validateListingInput', () => {
  it('accepts a complete listing and normalizes it', () => {
    const r = validateListingInput(valid());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.street).toBe('Pearl St');
    expect(r.value.neighborhood).toBe('Cambridge');
    expect(r.value.address.unit).toBeNull();
    expect(r.value.windows[0].days).toEqual([0, 4]);
  });

  it('rejects garbage without throwing and maps every field to a wizard step', () => {
    const r = validateListingInput('nope');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    for (const field of Object.keys(r.errors)) expect(FIELD_STEP).toHaveProperty(field);
  });

  it.each([
    [{ address: { line: '12 Pearl St', city: 'Cambridge', zip: '10001' } }, 'zip'],
    [{ lat: 40.7, lng: -74 }, 'pin'],
    [{ spots: 5 }, 'spots'],
    [{ rightToList: false }, 'rightToList'],
    [{ chargerKw: 2.9 }, 'kw'],
    [{ level: 'L1', chargerKw: 1.92, outdoorOutlet: true }, null],
    [{ level: 'L1', chargerKw: 2.0, outdoorOutlet: true }, 'kw'],
    [{ level: 'L1', chargerKw: 1.44 }, 'outdoorOutlet'],
    [{ solarKw: 51 }, 'solarKw'],
    [{ rate: 1.01 }, 'rate'],
    [{ rateSource: 'EIA', rateDataMonth: null }, 'rateSource'],
    [{ earningsHr: 0 }, 'earnings'],
    [{ earningsHr: 5.51 }, 'earnings'],
    [{ earningsHr: 5.5 }, null],
    [{ photoKeys: [] }, 'photos'],
    [{ photoKeys: Array.from({ length: 9 }, (_, i) => `k${i}`) }, 'photos'],
    [{ instructions: 'Too short' }, 'instructions'],
    [{ windows: [{ days: [0], start: 9, end: 9 }] }, 'windows'],
    [{ windows: [{ days: [], start: 9, end: 17 }] }, 'windows'],
    [{ windows: [{ days: [7], start: 9, end: 17 }] }, 'windows'],
    [{ termsAccepted: 'yes' }, 'terms'],
  ])('%j -> %s', (over, field) => {
    const errors = errorsOf(over);
    if (field === null) expect(errors).toEqual({});
    else expect(Object.keys(errors)).toEqual([field]);
  });
});
