import { hasMapboxToken } from '../lib/mapbox';
import type { GeocodeResult, SearchOptions } from './geocodingTypes';
import { searchAddresses as searchMapbox } from './mapboxGeocoding';
import { searchPhoton } from './photonGeocoding';

export { ADDRESS_TYPES, DESTINATION_TYPES, isMassachusetts } from './geocodingTypes';
export type { GeocodedAddress, GeocodeResult, SearchOptions } from './geocodingTypes';

/**
 * The one address search the app uses. With a Mapbox token it uses Mapbox Geocoding; with none it uses Photon
 * (OpenStreetMap), so any address can be searched with no setup.
 */
export const ADDRESS_SEARCH_PROVIDER: 'mapbox' | 'photon' = hasMapboxToken ? 'mapbox' : 'photon';

/** Shown under results when the data comes from OpenStreetMap, which asks for credit. */
export const ADDRESS_SEARCH_CREDIT = ADDRESS_SEARCH_PROVIDER === 'photon' ? 'Address data © OpenStreetMap contributors' : undefined;

export function searchAddresses(query: string, opts: SearchOptions = {}): Promise<GeocodeResult> {
  // An explicit token (used by tests) always means Mapbox.
  return hasMapboxToken || opts.token !== undefined ? searchMapbox(query, opts) : searchPhoton(query, opts);
}
