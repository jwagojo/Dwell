import type { LineKey } from '../../src/data/transit';
import { isInMassachusettsArea } from '../../src/lib/massachusetts';
import type { Destination } from '../../src/types/destination';
import { badRequest } from './http';

/** Small validators for request bodies. Each throws a 400 that names the field. */

const LINE_KEYS: readonly LineKey[] = ['red', 'green', 'orange', 'cr'];

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function intInRange(body: Record<string, unknown>, field: string, min: number, max: number): number {
  const v = body[field];
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) {
    throw badRequest(`${field} must be a whole number from ${min} to ${max}.`, { field });
  }
  return v as number;
}

/** A point the phone reported. Not trusted for anything but a distance check. */
export function parsePosition(v: unknown, field: string): { lat: number; lng: number } {
  if (!isObj(v) || !finite(v.lat) || !finite(v.lng) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) {
    throw badRequest(`${field} needs numeric lat and lng.`, { field });
  }
  return { lat: v.lat, lng: v.lng };
}

const shortText = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null);

/** Where the driver is headed (station, address, or "My location"). Frozen on the booking for the Green Score. */
export function parseDestination(v: unknown): Destination | null {
  if (v === null || v === undefined) return null;
  const field = 'destination';
  if (!isObj(v) || (v.kind !== 'station' && v.kind !== 'address')) throw badRequest('destination.kind must be "station" or "address".', { field });
  const id = shortText(v.id, 200);
  const label = shortText(v.label, 200);
  if (!id || !label) throw badRequest('destination needs an id and a label.', { field });
  const { lat, lng } = parsePosition(v, field);
  if (!isInMassachusettsArea(lat, lng)) throw badRequest('Destinations must be in Massachusetts.', { field });
  const dest: Destination = { kind: v.kind, id, label, lat, lng };
  if (Array.isArray(v.routes)) {
    const routes = v.routes.map((r) => shortText(r, 40)).filter((r): r is string => r !== null).slice(0, 12);
    if (routes.length > 0) dest.routes = routes;
  }
  if (typeof v.primary === 'string' && (LINE_KEYS as readonly string[]).includes(v.primary)) dest.primary = v.primary as LineKey;
  return dest;
}
