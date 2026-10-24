import { DEFAULT_DESTINATION, isDestination, migrateDestination } from '../data/destinations';
import type { SortMode } from '../features/search/evaluateListing';
import type { Booking } from '../types/booking';
import type { Destination } from '../types/destination';
import type { Car, Listing } from '../types/listing';

export interface User {
  role: 'driver' | 'host';
  name: string;
  email: string;
  phone: string;
}

export type LevelFilter = 'any' | 'L2' | 'L1';

export interface Persisted {
  /** Bump when the saved shape changes and add a step to migrateState. */
  version: number;
  user: User | null;
  car: Car | null;
  destination: Destination;
  startHour: number;
  hours: number;
  level: LevelFilter;
  sort: SortMode;
  hostListing: Listing | null;
  booking: Booking | null;
}

export const STATE_VERSION = 2;

export const DEFAULTS: Persisted = {
  version: STATE_VERSION,
  user: null,
  car: null,
  destination: DEFAULT_DESTINATION,
  startHour: 10,
  hours: 4,
  level: 'any',
  sort: 'fit',
  hostListing: null,
  booking: null,
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Turn whatever was saved (any older version, or garbage) into valid current state.
 * v1 stored `destinationId` (a station id) on the state and on the booking; v2 stores a full Destination.
 */
export function migrateState(raw: unknown): Persisted {
  if (!isObj(raw)) return DEFAULTS;
  const saved = raw as Partial<Persisted> & { destinationId?: unknown };

  let booking: Booking | null = null;
  if (isObj(saved.booking)) {
    const b = saved.booking as Obj;
    const { destinationId: _legacy, ...rest } = b;
    booking = { ...(rest as unknown as Booking), destination: isDestination(b.destination) ? b.destination : migrateDestination({ destinationId: b.destinationId }) };
  }

  const { destinationId: _drop, ...rest } = saved;
  return {
    ...DEFAULTS,
    ...rest,
    version: STATE_VERSION,
    destination: migrateDestination(saved),
    booking,
  };
}
