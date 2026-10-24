import { describe, expect, it } from 'vitest';
import { addressToDestination, migrateDestination, stationIdToDestination } from '../data/destinations';
import type { GeocodedAddress } from '../adapters/mapboxGeocoding';
import { DEFAULTS, LEGACY_STORAGE_KEY, STATE_VERSION, STORAGE_KEY, loadSavedState, migrateState, saveState } from './persisted';

const lowell: GeocodedAddress = {
  id: 'mbx-lowell',
  featureType: 'address',
  label: '1 University Avenue, Lowell, MA 01854',
  line1: '1 University Avenue',
  addressNumber: '1',
  streetName: 'University Avenue',
  city: 'Lowell',
  neighborhood: 'Lowell',
  state: 'MA',
  zip: '01854',
  country: 'US',
  lat: 42.6553,
  lng: -71.3265,
};

describe('destinations', () => {
  it('turns a station into a destination with its routes', () => {
    const d = stationIdToDestination('central');
    expect(d).toMatchObject({ kind: 'station', id: 'central', label: 'Central Square' });
    expect(d.routes).toContain('Red Line');
  });

  it('never invents routes for an address', () => {
    const d = addressToDestination(lowell);
    expect(d).toMatchObject({ kind: 'address', id: 'mbx-lowell', lat: 42.6553, lng: -71.3265 });
    expect(d.routes).toBeUndefined();
    expect(d.primary).toBeUndefined();
  });

  it('migrates a legacy station id and falls back safely', () => {
    expect(migrateDestination({ destinationId: 'harvard' })).toMatchObject({ kind: 'station', id: 'harvard' });
    expect(migrateDestination({ destinationId: 'atlantis' }).id).toBe('central');
    expect(migrateDestination({}).id).toBe('central');
    expect(migrateDestination({ destination: { kind: 'address', id: 'x' } }).id).toBe('central'); // incomplete object
  });
});

describe('migrateState', () => {
  it('upgrades v1 state: destinationId becomes a destination, on the state and on the booking', () => {
    const v1 = {
      user: { role: 'driver', name: 'Dana', email: 'd@example.com', phone: '6175550123' },
      car: null,
      destinationId: 'kendall',
      startHour: 9,
      hours: 3,
      level: 'L2',
      sort: 'price',
      hostListing: null,
      booking: { id: 'bk-1', listingId: 'pearl-st', destinationId: 'porter', hours: 3, status: 'RESERVED' },
    };
    const s = migrateState(v1);
    expect(s.version).toBe(STATE_VERSION);
    expect(s.destination).toMatchObject({ kind: 'station', id: 'kendall' });
    expect(s.booking?.destination).toMatchObject({ kind: 'station', id: 'porter' });
    expect(s).not.toHaveProperty('destinationId');
    expect(s.booking).not.toHaveProperty('destinationId');
    expect(s).toMatchObject({ startHour: 9, hours: 3, level: 'L2', sort: 'price', user: { name: 'Dana' } });
  });

  it('keeps an address destination and an already-migrated booking', () => {
    const dest = addressToDestination(lowell);
    const s = migrateState({ version: 2, destination: dest, booking: { id: 'b', destination: dest } });
    expect(s.destination).toEqual(dest);
    expect(s.booking?.destination).toEqual(dest);
  });

  it('returns defaults for garbage', () => {
    expect(migrateState(null)).toEqual(DEFAULTS);
    expect(migrateState('x')).toEqual(DEFAULTS);
    expect(migrateState([])).toEqual(DEFAULTS);
  });
});

describe('saved state after the rename to Dwell', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
  };
  const user = { role: 'driver', name: 'Dana', email: 'd@example.com', phone: '6175550123' };

  it('uses the Dwell key and keeps the old one only as a fallback', () => {
    expect(STORAGE_KEY).toBe('dwell.prototype.v1');
    expect(LEGACY_STORAGE_KEY).toBe('voltlot.prototype.v1');
  });

  it('carries an existing VoltLot-era save over, so nobody is signed out', () => {
    const store = memory();
    store.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ version: 2, user, hours: 6 }));
    const loaded = loadSavedState(store);
    expect(loaded).toMatchObject({ hours: 6, user: { name: 'Dana' } });
    saveState(store, loaded);
    expect(store.raw.has(STORAGE_KEY)).toBe(true);
    expect(store.raw.has(LEGACY_STORAGE_KEY)).toBe(false);
  });

  it('prefers the new key when both exist', () => {
    const store = memory();
    store.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ version: 2, hours: 2 }));
    store.setItem(STORAGE_KEY, JSON.stringify({ version: 2, hours: 9 }));
    expect(loadSavedState(store).hours).toBe(9);
  });

  it('falls back to defaults for nothing or garbage', () => {
    expect(loadSavedState(memory())).toEqual(DEFAULTS);
    const bad = memory();
    bad.setItem(STORAGE_KEY, '{nope');
    expect(loadSavedState(bad)).toEqual(DEFAULTS);
  });
});
