import { MASSACHUSETTS_CENTER } from '../lib/mapbox';
import {
  ADDRESS_TYPES,
  GEOCODE_RESULT_LIMIT,
  MIN_QUERY_LENGTH,
  type GeocodedAddress,
  type GeocodeResult,
  type SearchOptions,
} from './geocodingTypes';

/**
 * Typed adapter for Photon, a free search-as-you-type geocoder over OpenStreetMap data. It needs no key or account,
 * so address search works with nothing configured. It never throws: callers get a result object.
 *
 * Limits to know about: the public server (photon.komoot.io) is for reasonable use, has no uptime promise and may
 * throttle heavy traffic. Self-host Photon, or set VITE_MAPBOX_TOKEN to use Mapbox instead, before real launch.
 * Results are OpenStreetMap data (ODbL), so the UI credits OpenStreetMap contributors.
 * Only United States results are returned. GeoJSON coordinates are [longitude, latitude]; they are converted once, here.
 */

export const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';
/** Budget for one lookup, per the project's adapter timeouts (geocoding: 10 s). */
export const PHOTON_TIMEOUT_MS = 10_000;
/** Ask for extra rows because non-US and unusable rows are dropped afterwards. */
const FETCH_LIMIT = 12;

/** Our feature types (Mapbox v6 names) to the Photon layers that can produce them. */
const LAYERS: Record<string, string[]> = {
  address: ['house'],
  street: ['house', 'street'],
  neighborhood: ['district', 'locality'],
  locality: ['locality'],
  place: ['city'],
};

const STATE_CODES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT',
  Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE',
  Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA',
  Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'Puerto Rico': 'PR',
};

const wanted = (types: string | undefined) => new Set((types ?? ADDRESS_TYPES).split(',').map((t) => t.trim()).filter(Boolean));

export function buildPhotonUrl(query: string, opts: SearchOptions = {}): string {
  const p = opts.proximity ?? MASSACHUSETTS_CENTER;
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(FETCH_LIMIT),
    lang: 'en',
    lat: String(p.lat),
    lon: String(p.lng),
  });
  const layers = new Set([...wanted(opts.types)].flatMap((t) => LAYERS[t] ?? []));
  for (const layer of layers) params.append('layer', layer);
  return `${PHOTON_ENDPOINT}?${params.toString()}`;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Turn one Photon feature into a GeocodedAddress. Returns null when it is unusable or not in the United States. */
export function parsePhotonFeature(feature: unknown): GeocodedAddress | null {
  if (!isObj(feature)) return null;
  const props = isObj(feature.properties) ? feature.properties : {};
  const geometry = isObj(feature.geometry) ? feature.geometry : {};
  const gc = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  const lng = num(gc[0]);
  const lat = num(gc[1]);
  if (lat === null || lng === null) return null;

  const country = str(props.countrycode).toUpperCase();
  if (country !== 'US') return null;

  const type = str(props.type);
  const name = str(props.name);
  const houseNumber = str(props.housenumber);
  const street = str(props.street);

  let featureType: string;
  if (type === 'house') featureType = houseNumber && street ? 'address' : 'street';
  else if (type === 'street') featureType = 'street';
  else if (type === 'district') featureType = 'neighborhood';
  else if (type === 'locality') featureType = 'locality';
  else if (type === 'city') featureType = 'place';
  else return null; // counties, states, countries and "other" are not places to drive to

  const city = str(props.city) || (featureType === 'place' ? name : '');
  const neighborhood = str(props.district) || (featureType === 'neighborhood' || featureType === 'locality' ? name : '') || str(props.locality) || city;
  const stateName = str(props.state);
  const state = STATE_CODES[stateName] ?? '';
  const zip = str(props.postcode);

  const line1 = featureType === 'address' ? `${houseNumber} ${street}` : name || street;
  if (!line1) return null;
  const label = [line1, city && city !== line1 ? city : '', `${state} ${zip}`.trim()].filter(Boolean).join(', ');

  const osmType = str(props.osm_type);
  const osmId = typeof props.osm_id === 'number' || typeof props.osm_id === 'string' ? String(props.osm_id) : '';

  return {
    id: osmType && osmId ? `osm-${osmType}${osmId}` : `${lat},${lng}`,
    featureType,
    label,
    line1,
    addressNumber: featureType === 'address' ? houseNumber : '',
    streetName: featureType === 'address' ? street : featureType === 'street' ? street || name : '',
    city,
    neighborhood,
    state,
    zip,
    country,
    lat,
    lng,
  };
}

/** Parse a Photon response, keeping only the requested feature types and dropping duplicates. */
export function parsePhotonResponse(json: unknown, types?: string, limit = GEOCODE_RESULT_LIMIT): GeocodedAddress[] | null {
  if (!isObj(json) || !Array.isArray(json.features)) return null;
  const allowed = wanted(types);
  const seen = new Set<string>();
  const out: GeocodedAddress[] = [];
  for (const f of json.features) {
    const a = parsePhotonFeature(f);
    if (!a || !allowed.has(a.featureType)) continue;
    // OpenStreetMap often has several records for one address (a house plus the shops inside it). One row is enough.
    if (seen.has(a.label)) continue;
    seen.add(a.label);
    out.push(a);
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchPhoton(query: string, opts: SearchOptions = {}): Promise<GeocodeResult> {
  if (query.trim().length < MIN_QUERY_LENGTH) return { ok: true, results: [] };

  const doFetch = opts.fetchImpl ?? fetch;
  const timeout = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(PHOTON_TIMEOUT_MS) : undefined;
  const signals = [opts.signal, timeout].filter((s): s is AbortSignal => s !== undefined);
  const signal = signals.length > 1 && 'any' in AbortSignal ? AbortSignal.any(signals) : signals[0];

  let res: Response;
  try {
    res = await doFetch(buildPhotonUrl(query, opts), { signal });
  } catch (err) {
    if (opts.signal?.aborted) return { ok: false, reason: 'ABORTED', message: 'Search cancelled' };
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { ok: false, reason: 'NETWORK', message: 'Address search took too long. Try again in a moment.' };
    }
    if (err instanceof DOMException && err.name === 'AbortError') return { ok: false, reason: 'ABORTED', message: 'Search cancelled' };
    return { ok: false, reason: 'NETWORK', message: 'Could not reach the address search. Check your connection.' };
  }

  if (!res.ok) {
    const message = res.status === 429 ? 'Too many address searches. Wait a moment and try again.' : `Address search failed (${res.status}).`;
    return { ok: false, reason: 'HTTP', status: res.status, message };
  }

  try {
    const parsed = parsePhotonResponse(await res.json(), opts.types, opts.limit ?? GEOCODE_RESULT_LIMIT);
    if (!parsed) return { ok: false, reason: 'BAD_RESPONSE', message: 'Address search returned something unexpected.' };
    return { ok: true, results: parsed };
  } catch {
    if (opts.signal?.aborted) return { ok: false, reason: 'ABORTED', message: 'Search cancelled' };
    return { ok: false, reason: 'BAD_RESPONSE', message: 'Address search returned something unexpected.' };
  }
}
