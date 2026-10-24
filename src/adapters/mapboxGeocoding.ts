import { MAPBOX_TOKEN, MASSACHUSETTS_CENTER, describeTokenProblem, mapboxTokenStatus } from '../lib/mapbox';

/**
 * Typed adapter for Mapbox Geocoding API v6 (forward). It never throws: callers get a result object.
 * Coordinates from Mapbox are [longitude, latitude]; this module converts them to { lat, lng } once, here.
 */

export const GEOCODING_ENDPOINT = 'https://api.mapbox.com/search/geocode/v6/forward';
export const MIN_QUERY_LENGTH = 3;
export const GEOCODE_RESULT_LIMIT = 5;

/**
 * Results are saved in this prototype's localStorage (listings, destinations), and Mapbox only allows storing
 * results from the Permanent Geocoding API (permanent=true). That mode is billed at a higher rate and needs a
 * card on file. Set to false only if nothing returned is ever stored.
 */
export const USE_PERMANENT_GEOCODING = true;

export interface GeocodedAddress {
  /** Mapbox ID, stable across requests */
  id: string;
  featureType: string;
  /** Short display label, e.g. "1 University Ave, Lowell, MA 01854" */
  label: string;
  /** House number and street, e.g. "1 University Ave" (just the name for non-address features) */
  line1: string;
  addressNumber: string;
  streetName: string;
  city: string;
  /** Sub-city name when Mapbox provides one, otherwise the city */
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
  /** Comma-separated v6 feature types. Defaults to street addresses. */
  types?: string;
  proximity?: { lat: number; lng: number };
  limit?: number;
  /** Test seams */
  token?: string;
  fetchImpl?: typeof fetch;
}

export const ADDRESS_TYPES = 'address';
/** Destinations may also be streets, neighborhoods and towns (v6 has no points of interest). */
export const DESTINATION_TYPES = 'address,street,neighborhood,locality,place';

export function buildForwardUrl(query: string, token: string, opts: SearchOptions = {}): string {
  const p = opts.proximity ?? MASSACHUSETTS_CENTER;
  const params = new URLSearchParams({
    q: query.trim(),
    access_token: token,
    country: 'us',
    types: opts.types ?? ADDRESS_TYPES,
    autocomplete: 'true',
    limit: String(opts.limit ?? GEOCODE_RESULT_LIMIT),
    language: 'en',
    proximity: `${p.lng},${p.lat}`, // longitude,latitude
  });
  if (USE_PERMANENT_GEOCODING) params.set('permanent', 'true');
  return `${GEOCODING_ENDPOINT}?${params.toString()}`;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ctxName = (ctx: Json | undefined, key: string): string => (isObj(ctx?.[key]) ? str((ctx![key] as Json).name) : '');

/** Turn one v6 feature into a GeocodedAddress. Returns null when it has no usable coordinates. */
export function parseFeature(feature: unknown): GeocodedAddress | null {
  if (!isObj(feature)) return null;
  const props = isObj(feature.properties) ? feature.properties : {};
  const ctx = isObj(props.context) ? props.context : undefined;
  const coords = isObj(props.coordinates) ? props.coordinates : {};
  const geometry = isObj(feature.geometry) ? feature.geometry : {};
  const gc = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];

  // Prefer the explicit coordinate object; the GeoJSON geometry is [longitude, latitude].
  const lat = num(coords.latitude) ?? num(gc[1]);
  const lng = num(coords.longitude) ?? num(gc[0]);
  if (lat === null || lng === null) return null;

  const featureType = str(props.feature_type);
  const name = str(props.name) || str(props.name_preferred);
  const addressCtx = isObj(ctx?.address) ? (ctx!.address as Json) : undefined;
  const streetCtx = isObj(ctx?.street) ? (ctx!.street as Json) : undefined;

  const addressNumber = str(addressCtx?.address_number);
  const streetName = str(addressCtx?.street_name) || str(streetCtx?.name) || (featureType === 'street' ? name : '');

  const regionCtx = isObj(ctx?.region) ? (ctx!.region as Json) : undefined;
  const regionCode = str(regionCtx?.region_code) || str(regionCtx?.region_code_full).replace(/^US-/, '');
  const state = regionCode || (str(regionCtx?.name) === 'Massachusetts' ? 'MA' : '');

  const countryCtx = isObj(ctx?.country) ? (ctx!.country as Json) : undefined;
  const country = str(countryCtx?.country_code).toUpperCase();

  const city = ctxName(ctx, 'place') || (featureType === 'place' ? name : '');
  const neighborhood = ctxName(ctx, 'neighborhood') || ctxName(ctx, 'locality') || city;
  const zip = ctxName(ctx, 'postcode');

  const line1 = featureType === 'address' && addressNumber && streetName ? `${addressNumber} ${streetName}` : name;
  const label = [line1, city && city !== line1 ? city : '', `${state} ${zip}`.trim()].filter(Boolean).join(', ');

  return {
    id: str(props.mapbox_id) || str(feature.id) || `${lat},${lng}`,
    featureType,
    label: label || str(props.full_address) || name,
    line1,
    addressNumber,
    streetName,
    city,
    neighborhood,
    state,
    zip,
    country,
    lat,
    lng,
    accuracy: str(coords.accuracy) || undefined,
  };
}

export function parseForwardResponse(json: unknown): GeocodedAddress[] | null {
  if (!isObj(json) || !Array.isArray(json.features)) return null;
  return json.features.map(parseFeature).filter((a): a is GeocodedAddress => a !== null);
}

/** Validate Massachusetts from the result's own geographic context, never from the typed text. */
export const isMassachusetts = (a: Pick<GeocodedAddress, 'state' | 'country'>): boolean => a.country === 'US' && a.state === 'MA';

export async function searchAddresses(query: string, opts: SearchOptions = {}): Promise<GeocodeResult> {
  const token = opts.token ?? MAPBOX_TOKEN;
  if (!token) return { ok: false, reason: 'NO_TOKEN', message: describeTokenProblem(opts.token === undefined ? mapboxTokenStatus : 'missing') };
  if (query.trim().length < MIN_QUERY_LENGTH) return { ok: true, results: [] };

  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(buildForwardUrl(query, token, opts), { signal: opts.signal });
  } catch (err) {
    if (opts.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      return { ok: false, reason: 'ABORTED', message: 'Search cancelled' };
    }
    return { ok: false, reason: 'NETWORK', message: 'Could not reach the address search. Check your connection.' };
  }

  if (!res.ok) {
    const message =
      res.status === 401
        ? 'Mapbox rejected the token (401).'
        : res.status === 403
          ? 'Mapbox blocked this request (403). Check the token’s URL restrictions and that permanent geocoding is enabled on the account.'
          : res.status === 429
            ? 'Too many address searches. Wait a moment and try again.'
            : `Address search failed (${res.status}).`;
    return { ok: false, reason: 'HTTP', status: res.status, message };
  }

  try {
    const parsed = parseForwardResponse(await res.json());
    if (!parsed) return { ok: false, reason: 'BAD_RESPONSE', message: 'Address search returned something unexpected.' };
    return { ok: true, results: parsed };
  } catch (err) {
    if (opts.signal?.aborted) return { ok: false, reason: 'ABORTED', message: 'Search cancelled' };
    return { ok: false, reason: 'BAD_RESPONSE', message: 'Address search returned something unexpected.' };
  }
}
