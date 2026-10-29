import { describe, expect, it } from 'vitest';
import { offsetNorth } from '../../lib/geo';
import type { Listing } from '../../types/listing';
import { clampRadiusMiles, filterByRadius, METERS_PER_MILE } from './filterListings';

const center = { lat: 42.3655, lng: -71.1038 };
const at = (id: string, metersNorth: number) => ({ id, ...offsetNorth(center, metersNorth) }) as unknown as Listing;

describe('filterByRadius (Req 2.1)', () => {
  const listings = [at('here', 0), at('half-mile', 0.5 * METERS_PER_MILE - 5), at('two-miles', 2 * METERS_PER_MILE + 5), at('far', 30 * METERS_PER_MILE)];

  it('keeps listings inside the radius by great-circle distance', () => {
    expect(filterByRadius(listings, center, 0.5).map((l) => l.id)).toEqual(['here', 'half-mile']);
    expect(filterByRadius(listings, center, 2).map((l) => l.id)).toEqual(['here', 'half-mile']);
    expect(filterByRadius(listings, center, 5).map((l) => l.id)).toEqual(['here', 'half-mile', 'two-miles']);
  });

  it('clamps the radius to 0.1 to 25 miles', () => {
    expect(filterByRadius(listings, center, 1000).map((l) => l.id)).not.toContain('far');
    expect(filterByRadius([at('near', 100)], center, 0).map((l) => l.id)).toEqual(['near']); // 0 becomes 0.1 mi (161 m)
    expect([clampRadiusMiles(0.05), clampRadiusMiles(40), clampRadiusMiles(3), clampRadiusMiles('2'), clampRadiusMiles(Number.NaN)]).toEqual([0.1, 25, 3, null, null]);
  });
});
