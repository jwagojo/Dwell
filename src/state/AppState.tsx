import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_CAR } from '../data/evFallbackSeed';
import { SEEDED_LISTINGS } from '../data/listings';
import type { Car, Listing } from '../types/listing';
import { stashAccount, type AccountData } from './accounts';
import { DEFAULTS, loadSavedState, saveState, type Persisted } from './persisted';

export type { LevelFilter, Persisted, User } from './persisted';

interface AppContextValue extends Persisted {
  update: (patch: Partial<Persisted>) => void;
  /**
   * Sign out. The account's own data (profile, car, host listing, booking) is kept under its email so signing
   * back in restores it; the search choices and everything else on screen reset.
   */
  signOut: () => void;
  /** Start a session for an account that sign-in has already verified. */
  signIn: (data: AccountData) => void;
  /** Seeded sample listings plus the one the signed-in host published */
  listings: Listing[];
  /** The driver's car, or a default for hosts previewing search */
  activeCar: Car;
}

// PROTOTYPE ONLY. Real sign-up and sign-in arrive with Amazon Cognito (tasks.md 13.1).
// Passwords are never kept in this state. accounts.ts keeps a salted hash for the local prototype sign-in.
// Geocoded addresses saved here come from permanent geocoding (see adapters/mapboxGeocoding.ts).
function load(): Persisted {
  try {
    return loadSavedState(localStorage);
  } catch {
    return DEFAULTS; // storage blocked
  }
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);

  useEffect(() => {
    try {
      saveState(localStorage, state);
    } catch {
      // Storage full or unavailable: the prototype keeps working in memory.
    }
  }, [state]);

  const update = useCallback((patch: Partial<Persisted>) => setState((s) => ({ ...s, ...patch })), []);
  // The latest state, readable from callbacks without making them change on every update.
  const stateRef = useRef(state);
  stateRef.current = state;

  const signOut = useCallback(() => {
    try {
      stashAccount(localStorage, stateRef.current);
    } catch {
      // Storage blocked: sign out anyway.
    }
    setState(DEFAULTS);
  }, []);
  const signIn = useCallback((data: AccountData) => setState({ ...DEFAULTS, ...data }), []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      update,
      signOut,
      signIn,
      listings: state.hostListing ? [state.hostListing, ...SEEDED_LISTINGS] : SEEDED_LISTINGS,
      activeCar: state.car ?? DEFAULT_CAR,
    }),
    [state, update, signOut, signIn],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider');
  return ctx;
}
