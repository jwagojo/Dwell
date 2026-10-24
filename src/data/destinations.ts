import type { GeocodedAddress } from '../adapters/mapboxGeocoding';
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
