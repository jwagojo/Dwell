import { DEFAULT_DESTINATION, isCurrentLocation, isDestination, migrateDestination } from '../data/destinations';
import type { SortMode } from '../features/search/evaluateListing';
import type { Booking } from '../types/booking';
import type { Destination } from '../types/destination';
import type { Car, Listing } from '../types/listing';

/** One account does both jobs: finding parking and hosting a charger. There is no role. */
export interface User {
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
  /** null when the search box is empty and the driver is browsing the map */
  destination: Destination | null;
  startHour: number;
  hours: number;
  level: LevelFilter;
  sort: SortMode;
  hostListing: Listing | null;
  booking: Booking | null;
}

export const STATE_VERSION = 3;

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
 * v3 drops `user.role`: accounts used to be a driver or a host, and now every account can do both.
 */
export function migrateState(raw: unknown): Persisted {
  if (!isObj(raw)) return DEFAULTS;
  const saved = raw as Partial<Persisted> & { destinationId?: unknown };

  let booking: Booking | null = null;
  if (isObj(saved.booking)) {
    const b = saved.booking as Obj;
    const { destinationId: _legacy, ...rest } = b;
    booking = {
      ...(rest as unknown as Booking),
      destination: b.destination === null ? null : isDestination(b.destination) ? b.destination : migrateDestination({ destinationId: b.destinationId }),
    };
  }

  let user: User | null = null;
  if (isObj(saved.user)) {
    const { role: _role, ...account } = saved.user as Obj;
    user = account as unknown as User;
  }

  const { destinationId: _drop, ...rest } = saved;
  return {
    ...DEFAULTS,
    ...rest,
    version: STATE_VERSION,
    user,
    // An explicit null means the driver cleared the search box; anything else unreadable falls back to the default.
    // "My location" is not kept between visits: it would point at where the driver was, not where they are now.
    destination:
      saved.destination === null ? null : isDestination(saved.destination) && isCurrentLocation(saved.destination) ? DEFAULT_DESTINATION : migrateDestination(saved),
    booking,
  };
}

/** Current storage key. */
export const STORAGE_KEY = 'dwell.prototype.v1';
/** The prototype saved under this key before it was renamed to Dwell. It is read once, then replaced. */
export const LEGACY_STORAGE_KEY = 'voltlot.prototype.v1';
/** Backend mode keeps only search choices, under its own key, so the prototype's saved state is left alone. */
export const BACKEND_STORAGE_KEY = 'dwell.backend.prefs.v1';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Load saved state: the current key first, then the legacy one. Anything unreadable gives the defaults. */
export function loadSavedState(storage: KeyValueStore, key: string = STORAGE_KEY): Persisted {
  try {
    const raw = storage.getItem(key) ?? (key === STORAGE_KEY ? storage.getItem(LEGACY_STORAGE_KEY) : null);
    return raw ? migrateState(JSON.parse(raw)) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Save under the current key and drop the legacy copy so the two never disagree. */
export function saveState(storage: KeyValueStore, state: Persisted, key: string = STORAGE_KEY): void {
  storage.setItem(key, JSON.stringify(state));
  if (key === STORAGE_KEY) storage.removeItem(LEGACY_STORAGE_KEY);
}
