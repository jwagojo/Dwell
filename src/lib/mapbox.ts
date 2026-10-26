/**
 * Mapbox configuration for address search (Geocoding API). The token is optional: without one, address search uses
 * Photon (OpenStreetMap), see adapters/addressSearch.ts. The map itself uses MapLibre and needs no token (lib/map.ts).
 * The token is a PUBLIC (pk.) token read from VITE_MAPBOX_TOKEN in .env.local. It ships in the browser bundle,
 * so restrict it by URL in the Mapbox dashboard (docs/mapbox-setup.md). Secret (sk.) tokens are refused.
 */

export type MapboxTokenStatus = 'ok' | 'missing' | 'secret' | 'invalid';

export function classifyMapboxToken(raw: string | undefined): MapboxTokenStatus {
  const token = (raw ?? '').trim();
  if (token === '') return 'missing';
  if (token.startsWith('sk.')) return 'secret';
  if (!token.startsWith('pk.')) return 'invalid'; // includes the .env.example placeholder
  return 'ok';
}

const rawToken = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim() ?? '';

export const mapboxTokenStatus: MapboxTokenStatus = classifyMapboxToken(rawToken);
export const hasMapboxToken = mapboxTokenStatus === 'ok';
/** Only ever a public token. Empty string when missing, secret, or malformed. */
export const MAPBOX_TOKEN: string = hasMapboxToken ? rawToken : '';

export function describeTokenProblem(status: MapboxTokenStatus): string {
  switch (status) {
    case 'missing':
      return 'No Mapbox token. Add VITE_MAPBOX_TOKEN to .env or .env.local, save it, and restart the dev server.';
    case 'secret':
      return 'VITE_MAPBOX_TOKEN is a secret (sk.) token and was ignored. Use a public (pk.) token.';
    case 'invalid':
      return 'VITE_MAPBOX_TOKEN is not a public (pk.) token.';
    default:
      return '';
  }
}

/** Rough center of Massachusetts, used to bias address search and as a last-resort camera. */
export const MASSACHUSETTS_CENTER = { lat: 42.3601, lng: -71.0589 };

if (import.meta.env.DEV && !hasMapboxToken) {
  console.warn(`[Dwell] ${describeTokenProblem(mapboxTokenStatus)} Address search uses OpenStreetMap (Photon) instead. See docs/mapbox-setup.md.`);
}
