import { describe, expect, it } from 'vitest';
import { DEFAULT_CAR, EV_MODELS } from './evFallbackSeed';
import { MOCK_LISTINGS, SEEDED_LISTINGS } from './listings';
import { stationToDestination } from './destinations';
import { stationById } from './stations';
import { SEARCH_RADIUS_M, evaluateListing } from '../features/search/evaluateListing';
import { haversineDistanceMeters } from '../lib/geo';
import { isMassachusettsZip, stripHouseNumber } from '../lib/massachusetts';

describe('mockListings.json', () => {
  it('has the 19 supplied addresses with unique opaque ids', () => {
    expect(MOCK_LISTINGS).toHaveLength(19);
    expect(new Set(MOCK_LISTINGS.map((l) => l.id)).size).toBe(19);
    expect(MOCK_LISTINGS.every((l) => /^vl-\d{2}$/.test(l.id))).toBe(true);
    expect(new Set(SEEDED_LISTINGS.map((l) => l.id)).size).toBe(SEEDED_LISTINGS.length);
  });

  it.each(MOCK_LISTINGS.map((l) => [l.id, l] as const))('%s is well formed', (_id, l) => {
    // location: Cambridge and Somerville, never swapped lat/lng
    expect(l.lat).toBeGreaterThan(42.35);
    expect(l.lat).toBeLessThan(42.41);
    expect(l.lng).toBeGreaterThan(-71.16);
    expect(l.lng).toBeLessThan(-71.08);

    // privacy: public street is a name only, exact address is kept private
    expect(l.street).toBe(stripHouseNumber(l.privateAddress!.line));
    expect(l.street).not.toMatch(/\d/);
    expect(l.privateAddress).toMatchObject({ state: 'MA' });
    expect(isMassachusettsZip(l.privateAddress!.zip)).toBe(true);

    // charger
    expect(['L1', 'L2']).toContain(l.level);
    expect(['J1772', 'NACS']).toContain(l.plug);
    expect(['NONE', 'J1772_TO_NACS', 'NACS_TO_J1772', 'BOTH']).toContain(l.adapters);
    expect(l.chargerKw).toBeGreaterThanOrEqual(1.44);
    expect(l.chargerKw).toBeLessThanOrEqual(19.2);
    if (l.level === 'L1') expect(l.chargerKw).toBeLessThanOrEqual(1.92);
    else expect(l.chargerKw).toBeGreaterThanOrEqual(3);
    // an adapter must convert FROM this charger's plug, so J1772_TO_NACS only makes sense on a J1772 charger
    if (l.adapters === 'J1772_TO_NACS') expect(l.plug).toBe('J1772');
    if (l.adapters === 'NACS_TO_J1772') expect(l.plug).toBe('NACS');
    expect(l.solarKw).toBeGreaterThanOrEqual(0);
    expect(l.solarKw).toBeLessThanOrEqual(50);
    expect(l.spots).toBeGreaterThanOrEqual(1);

    // money
    expect(l.rate).toBeGreaterThanOrEqual(0.05);
    expect(l.rate).toBeLessThanOrEqual(1);
    expect(l.earningsHr).toBeGreaterThanOrEqual(1.5); // mock hosts earn $1.50 to $2.00 per hour
    expect(l.earningsHr).toBeLessThanOrEqual(2);

    // availability
    expect(l.windows.length).toBeGreaterThan(0);
    for (const w of l.windows) {
      expect(w.days.length).toBeGreaterThan(0);
      expect(w.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)).toBe(true);
      expect(w.start).toBeGreaterThanOrEqual(0);
      expect(w.start).toBeLessThanOrEqual(23);
      expect(w.end).toBeGreaterThanOrEqual(0);
      expect(w.end).toBeLessThanOrEqual(24);
      expect(w.start).not.toBe(w.end);
    }

    expect(l.instructions.length).toBeGreaterThanOrEqual(20);

    // photos: direct image links only (a Zillow page link is not an image)
    for (const url of l.photos) expect(url).toMatch(/^https:\/\/photos\.zillowstatic\.com\/fp\/[0-9a-f]{32}-[\w]+\.webp$/);

    // every listing can be priced for every seeded car
    for (const car of EV_MODELS) {
      expect(evaluateListing(l, car, stationById('central'), { startHour: 10, hours: 4, dayIndex: 2 })).not.toBeNull();
    }
  });

  it('keeps the one page-link entry photo-less (21 Cottage Park Ave)', () => {
    const l = MOCK_LISTINGS.find((x) => x.privateAddress?.line === '21 Cottage Park Ave')!;
    expect(l.photos).toEqual([]);
  });

  it('gives every Cambridge station a usable demo (a bookable, open listing within the radius)', () => {
    for (const id of ['central', 'harvard', 'kendall', 'porter']) {
      const dest = stationToDestination(stationById(id));
      const shown = SEEDED_LISTINGS.filter((l) => haversineDistanceMeters(l, dest) <= SEARCH_RADIUS_M)
        .map((l) => evaluateListing(l, DEFAULT_CAR, dest, { startHour: 10, hours: 4, dayIndex: 5 }))
        .filter((e) => e && e.plugOk && e.open);
      expect(shown.length, `${id} has results on a Saturday at 10 AM`).toBeGreaterThanOrEqual(2);
    }
  });

  it('exercises the hidden-by-plug and not-open states for a Leaf near Central Square', () => {
    const dest = stationToDestination(stationById('central'));
    const evals = SEEDED_LISTINGS.filter((l) => haversineDistanceMeters(l, dest) <= SEARCH_RADIUS_M).map((l) =>
      evaluateListing(l, DEFAULT_CAR, dest, { startHour: 10, hours: 4, dayIndex: 2 }),
    );
    expect(evals.some((e) => e && !e.plugOk)).toBe(true);
    expect(evals.some((e) => e && e.plugOk && !e.open)).toBe(true);
  });
});
