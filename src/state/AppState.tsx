import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_CAR } from '../data/evFallbackSeed';
import { SEEDED_LISTINGS } from '../data/listings';
import type { Car, Listing } from '../types/listing';
import { DEFAULTS, migrateState, type Persisted } from './persisted';

export type { LevelFilter, Persisted, User } from './persisted';

interface AppContextValue extends Persisted {
  update: (patch: Partial<Persisted>) => void;
  /** Seeded sample listings plus the one the signed-in host published */
  listings: Listing[];
  /** The driver's car, or a default for hosts previewing search */
  activeCar: Car;
}

// PROTOTYPE ONLY. Real sign-up and sign-in arrive with Amazon Cognito (tasks.md 13.1).
// Passwords are collected by the forms but never stored or sent anywhere.
// Geocoded addresses saved here come from permanent geocoding (see adapters/mapboxGeocoding.ts).
const STORAGE_KEY = 'voltlot.prototype.v1';

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrateState(JSON.parse(raw)) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or unavailable: the prototype keeps working in memory.
    }
  }, [state]);

  const update = useCallback((patch: Partial<Persisted>) => setState((s) => ({ ...s, ...patch })), []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      update,
      listings: state.hostListing ? [state.hostListing, ...SEEDED_LISTINGS] : SEEDED_LISTINGS,
      activeCar: state.car ?? DEFAULT_CAR,
    }),
    [state, update],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider');
  return ctx;
}
