import { describe, expect, it } from 'vitest';
import { evaluateListing } from './evaluateListing';
import { matchesSearchLimits, NO_SEARCH_LIMITS } from './searchLimits';
import type { Car, Listing } from '../../types/listing';

const car: Car = { id: 'leaf', name: 'Leaf', plug: 'J1772', maxAcKw: 6.6 };
const listing: Listing = { id: 'l1', title: 'Driveway', street: 'Pearl St', neighborhood: 'Cambridge', lat: 42.3654, lng: -71.1031, spotType: 'Driveway', chargerKw: 9.6, level: 'L2', plug: 'J1772', adapters: 'NONE', solarKw: 0, spots: 1, hostName: 'Host', rate: .3, earningsHr: 1.5, windows: [{ id: 'w1', days: [0], start: 0, end: 23 }], instructions: '', photos: [] };

describe('search limits', () => {
  it('compares the fee-inclusive total, rather than hourly price or the subtotal', () => {
    const e = evaluateListing(listing, car, listing, { startHour: 14, hours: 3, dayIndex: 0 })!;
    expect(e.total).toBe(11.48);
    expect(matchesSearchLimits(e, { ...NO_SEARCH_LIMITS, maxTotalUsd: 11 })).toBe(false);
    expect(matchesSearchLimits(e, { ...NO_SEARCH_LIMITS, maxTotalUsd: e.total })).toBe(true);
    expect(matchesSearchLimits(e, { ...NO_SEARCH_LIMITS, maxTotalUsd: e.total, budgetExclusive: true })).toBe(false);
  });

  it('requires a known walk for a walking limit, and preserves results without limits', () => {
    const e = evaluateListing(listing, car, null, { startHour: 14, hours: 3, dayIndex: 0 })!;
    expect(matchesSearchLimits(e, NO_SEARCH_LIMITS)).toBe(true);
    expect(matchesSearchLimits(e, { ...NO_SEARCH_LIMITS, maxWalkMinutes: 10 })).toBe(false);
    expect(matchesSearchLimits({ ...e, walkMinutes: 10 }, { ...NO_SEARCH_LIMITS, maxWalkMinutes: 10 })).toBe(true);
    expect(matchesSearchLimits({ ...e, walkMinutes: 11 }, { ...NO_SEARCH_LIMITS, maxWalkMinutes: 10 })).toBe(false);
  });
});
