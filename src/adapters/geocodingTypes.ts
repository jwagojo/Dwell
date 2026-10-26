/**
 * What every address-search provider returns, shared so the Mapbox and Photon adapters stay interchangeable.
 * Coordinates are always { lat, lng } here. Providers that use [longitude, latitude] convert once, in their own file.
 */

export const MIN_QUERY_LENGTH = 3;
export const GEOCODE_RESULT_LIMIT = 5;

export interface GeocodedAddress {
  /** Provider ID, stable across requests */
  id: string;
  featureType: string;
  /** Short display label, e.g. "1 University Ave, Lowell, MA 01854" */
  label: string;
  /** House number and street, e.g. "1 University Ave" (just the name for non-address features) */
  line1: string;
  addressNumber: string;
  streetName: string;
  city: string;
  /** Sub-city name when the provider has one, otherwise the city */
  neighborhood: string;
  /** Two-letter state code, e.g. "MA" */
  state: string;
  zip: string;
  /** Two-letter country code, e.g. "US" */
  country: string;
  lat: number;
  lng: number;
  accuracy?: string;
}

export type GeocodeFailure = 'NO_TOKEN' | 'NETWORK' | 'HTTP' | 'BAD_RESPONSE' | 'ABORTED';

export type GeocodeResult =
  | { ok: true; results: GeocodedAddress[] }
  | { ok: false; reason: GeocodeFailure; status?: number; message: string };

export interface SearchOptions {
  signal?: AbortSignal;
  /** Comma-separated feature types (Mapbox v6 names, which both providers understand). Defaults to street addresses. */
  types?: string;
  proximity?: { lat: number; lng: number };
  limit?: number;
  /** Test seams */
  token?: string;
  fetchImpl?: typeof fetch;
}

export const ADDRESS_TYPES = 'address';
/** Destinations may also be streets, neighborhoods and towns. */
export const DESTINATION_TYPES = 'address,street,neighborhood,locality,place';

/** Validate Massachusetts from the result's own geographic context, never from the typed text. */
export const isMassachusetts = (a: Pick<GeocodedAddress, 'state' | 'country'>): boolean => a.country === 'US' && a.state === 'MA';
