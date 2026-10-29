import { describe, expect, it } from 'vitest';
import { SEEDED_LISTINGS } from './seed-data/listings';
import { toEngineListing } from '../functions/shared/mappers';
import { listingItems, SEED_HOST_ID } from './seed';

describe('seed data', () => {
  it('validates all sample listings and keeps the hotlinked photos out of the bucket', () => {
    const { items, problems } = listingItems();
    expect(problems).toEqual([]);
    expect(items).toHaveLength(SEEDED_LISTINGS.length);
    for (const item of items) {
      expect(item.hostId).toBe(SEED_HOST_ID);
      expect(item.activePartition).toBe('ACTIVE');
      expect(item.photo_keys.every((k) => k.startsWith(`media/listings/${item.listingId}/`))).toBe(true);
    }
    expect(items.find((i) => i.listingId === 'vl-01')?.photo_keys).toHaveLength(3);
  });

  it('prices a seeded listing exactly like the sample it came from', () => {
    const item = listingItems().items.find((i) => i.listingId === 'walk-hill-st')!;
    const sample = SEEDED_LISTINGS.find((l) => l.id === 'walk-hill-st')!;
    const engine = toEngineListing(item);
    expect([engine.chargerKw, engine.rate, engine.earningsHr, engine.solarKw, engine.plug, engine.adapters]).toEqual([sample.chargerKw, sample.rate, sample.earningsHr, sample.solarKw, sample.plug, sample.adapters]);
  });
});
