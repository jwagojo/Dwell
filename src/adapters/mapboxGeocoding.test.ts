import { describe, expect, it, vi } from 'vitest';
import {
  buildForwardUrl,
  isMassachusetts,
  parseFeature,
  parseForwardResponse,
  searchAddresses,
  type GeocodedAddress,
} from './mapboxGeocoding';

// Shaped like a Geocoding v6 forward response. Coordinates are illustrative, not surveyed.
const lowell = {
  type: 'Feature',
  id: 'dXJuOm1ieGFkcjpsb3dlbGw',
  geometry: { type: 'Point', coordinates: [-71.3265, 42.6553] },
  properties: {
    mapbox_id: 'dXJuOm1ieGFkcjpsb3dlbGw',
    feature_type: 'address',
    name: '1 University Avenue',
    place_formatted: 'Lowell, Massachusetts 01854, United States',
    coordinates: { latitude: 42.6553, longitude: -71.3265, accuracy: 'rooftop' },
    context: {
      address: { name: '1 University Avenue', address_number: '1', street_name: 'University Avenue' },
      street: { name: 'University Avenue' },
      postcode: { name: '01854' },
      place: { name: 'Lowell' },
      region: { name: 'Massachusetts', region_code: 'MA', region_code_full: 'US-MA' },
      country: { name: 'United States', country_code: 'US', country_code_alpha_3: 'USA' },
    },
  },
};

const austin = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-97.74, 30.28] },
  properties: {
    mapbox_id: 'austin-1',
    feature_type: 'address',
    name: '1 University Avenue',
    coordinates: { latitude: 30.28, longitude: -97.74 },
    context: {
      address: { name: '1 University Avenue', address_number: '1', street_name: 'University Avenue' },
      postcode: { name: '78705' },
      place: { name: 'Austin' },
      region: { name: 'Texas', region_code: 'TX', region_code_full: 'US-TX' },
      country: { name: 'United States', country_code: 'US' },
    },
  },
};

const collection = (...features: unknown[]) => ({ type: 'FeatureCollection', features });

describe('buildForwardUrl', () => {
  const url = new URL(buildForwardUrl('1 University Ave Lowell', 'pk.test'));
  it('targets Geocoding v6 forward with the token', () => {
    expect(url.origin + url.pathname).toBe('https://api.mapbox.com/search/geocode/v6/forward');
    expect(url.searchParams.get('access_token')).toBe('pk.test');
    expect(url.searchParams.get('q')).toBe('1 University Ave Lowell');
  });
  it('searches the US, autocompletes addresses and allows storing results', () => {
    expect(url.searchParams.get('country')).toBe('us');
    expect(url.searchParams.get('types')).toBe('address');
    expect(url.searchParams.get('autocomplete')).toBe('true');
    expect(url.searchParams.get('permanent')).toBe('true');
  });
  it('biases to Massachusetts using longitude,latitude order', () => {
    expect(url.searchParams.get('proximity')).toBe('-71.0589,42.3601');
  });
});

describe('parseFeature', () => {
  it('reads a Massachusetts address with ZIP 01854 from the result context', () => {
    const a = parseFeature(lowell) as GeocodedAddress;
    expect(a).toMatchObject({
      line1: '1 University Avenue',
      streetName: 'University Avenue',
      addressNumber: '1',
      city: 'Lowell',
      state: 'MA',
      zip: '01854',
      country: 'US',
      label: '1 University Avenue, Lowell, MA 01854',
    });
    expect(isMassachusetts(a)).toBe(true);
  });

  it('keeps latitude and longitude the right way round (Mapbox geometry is [lng, lat])', () => {
    const a = parseFeature({ ...lowell, properties: { ...lowell.properties, coordinates: undefined } }) as GeocodedAddress;
    expect(a.lat).toBeCloseTo(42.6553, 4);
    expect(a.lng).toBeCloseTo(-71.3265, 4);
  });

  it('flags results outside Massachusetts', () => {
    expect(isMassachusetts(parseFeature(austin) as GeocodedAddress)).toBe(false);
  });

  it('skips features without coordinates', () => {
    expect(parseFeature({ properties: { name: 'x' } })).toBeNull();
    expect(parseFeature('nope')).toBeNull();
  });
});

describe('parseForwardResponse', () => {
  it('returns all usable features in order', () => {
    expect(parseForwardResponse(collection(lowell, austin, { properties: {} }))?.map((a) => a.city)).toEqual(['Lowell', 'Austin']);
  });
  it('returns null when the shape is wrong', () => {
    expect(parseForwardResponse({ message: 'nope' })).toBeNull();
  });
});

const okResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('searchAddresses', () => {
  it('does not call the network for fewer than 3 characters', async () => {
    const fetchImpl = vi.fn();
    expect(await searchAddresses('1 ', { token: 'pk.t', fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ ok: true, results: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a missing token without calling the network', async () => {
    const fetchImpl = vi.fn();
    const r = await searchAddresses('1 University', { token: '', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: 'NO_TOKEN' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns parsed results', async () => {
    const r = await searchAddresses('1 University Ave', { token: 'pk.t', fetchImpl: (async () => okResponse(collection(lowell))) as typeof fetch });
    expect(r.ok && r.results[0].zip).toBe('01854');
  });

  it.each([
    [401, /rejected the token/],
    [403, /URL restrictions/],
    [429, /Too many/],
    [500, /failed \(500\)/],
  ])('explains HTTP %i', async (status, message) => {
    const r = await searchAddresses('1 University Ave', { token: 'pk.t', fetchImpl: (async () => okResponse({}, status)) as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: 'HTTP', status });
    expect(!r.ok && r.message).toMatch(message);
  });

  it('reports network failure', async () => {
    const r = await searchAddresses('1 University Ave', { token: 'pk.t', fetchImpl: (async () => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: 'NETWORK' });
  });

  it('reports a cancelled request as ABORTED, not as an error', async () => {
    const controller = new AbortController();
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;
    const pending = searchAddresses('1 University Ave', { token: 'pk.t', fetchImpl, signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, reason: 'ABORTED' });
  });

  it('rejects an unexpected body', async () => {
    const r = await searchAddresses('1 University Ave', { token: 'pk.t', fetchImpl: (async () => okResponse({ hello: 1 })) as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: 'BAD_RESPONSE' });
  });
});
