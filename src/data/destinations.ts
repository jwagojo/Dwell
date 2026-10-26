import type { GeocodedAddress } from '../adapters/geocodingTypes';
import type { Destination } from '../types/destination';
import { DEFAULT_STATION_ID, STATIONS, stationById, type Station } from './stations';

export const stationToDestination = (s: Station): Destination => ({
  kind: 'station',
  id: s.id,
  label: s.name,
  lat: s.lat,
  lng: s.lng,
  routes: s.routes,
  primary: s.primary,
});

export const DEFAULT_DESTINATION: Destination = stationToDestination(stationById(DEFAULT_STATION_ID));

export const stationIdToDestination = (id: string): Destination => stationToDestination(stationById(id));

/** An address destination has no routes: MBTA V3 has no trip planner and we do not guess. */
export const addressToDestination = (a: GeocodedAddress): Destination => ({
  kind: 'address',
  id: a.id,
  label: a.label,
  lat: a.lat,
  lng: a.lng,
});

/** The destination made from "use my location". It is an address with no routes, like any other address. */
export const CURRENT_LOCATION_ID = 'my-location';

/** About 110 m. Plenty for "chargers near me", and it keeps a precise position off the device's storage. */
const roundCoord = (n: number) => Math.round(n * 1000) / 1000;

export const currentLocationDestination = (lat: number, lng: number): Destination => ({
  kind: 'address',
  id: CURRENT_LOCATION_ID,
  label: 'My location',
  lat: roundCoord(lat),
  lng: roundCoord(lng),
});

export const isCurrentLocation = (d: Destination | null | undefined): boolean => d?.id === CURRENT_LOCATION_ID;

/** How to say the place in a sentence: "Chargers near your location", "Chargers near Central". */
export const placeName = (d: Destination): string => (isCurrentLocation(d) ? 'your location' : d.label);

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function isDestination(v: unknown): v is Destination {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Partial<Destination>;
  return (
    (d.kind === 'station' || d.kind === 'address') &&
    typeof d.id === 'string' &&
    typeof d.label === 'string' &&
    isFiniteNum(d.lat) &&
    isFiniteNum(d.lng)
  );
}

/**
 * Older saved state stored only `destinationId` (a station id). Accept either shape and always return a valid
 * Destination, falling back to the default station for anything unrecognized.
 */
export function migrateDestination(saved: { destination?: unknown; destinationId?: unknown }): Destination {
  if (isDestination(saved.destination)) return saved.destination;
  if (typeof saved.destinationId === 'string' && STATIONS.some((s) => s.id === saved.destinationId)) {
    return stationIdToDestination(saved.destinationId);
  }
  return DEFAULT_DESTINATION;
}
