import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_CAR } from '../data/evFallbackSeed';
import { SEEDED_LISTINGS } from '../data/listings';
import type { Car, Listing } from '../types/listing';
import { stashAccount, type AccountData, type StashResult } from './accounts';
import { DEFAULTS, loadSavedState, saveState, type Persisted } from './persisted';

export type { LevelFilter, Persisted, User } from './persisted';

/** Why signing out stopped instead of removing the account's data. */
export type SignOutProblem = 'NOT_REGISTERED' | 'STORAGE';
export type SignOutResult = { ok: true } | { ok: false; reason: SignOutProblem };

interface AppContextValue extends Persisted {
  update: (patch: Partial<Persisted>) => void;
  /**
   * Sign out. The account's own data (profile, car, host listing, booking) is kept under its email so signing
   * back in restores it; the search choices and everything else on screen reset.
   * If that data cannot be kept, nothing is removed and the reason comes back, so the page can ask first.
   * `force` signs out anyway and removes the data from this browser.
   */
  signOut: (opts?: { force?: boolean }) => SignOutResult;
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

  const signOut = useCallback((opts: { force?: boolean } = {}): SignOutResult => {
    const current = stateRef.current;
    if (!current.user) {
      setState(DEFAULTS);
      return { ok: true };
    }
    // Shrink the signed-in copy first. Otherwise the listing's photos are stored twice for a moment, which is often
    // what fills the browser's storage and makes the save fail.
    let stash: StashResult;
    try {
      saveState(localStorage, DEFAULTS);
      stash = stashAccount(localStorage, current);
    } catch {
      stash = { ok: false, reason: 'STORAGE' };
    }
    if (!stash.ok && !opts.force) {
      // Put the signed-in copy back and stay signed in. If even that fails, the state is still in memory.
      try {
        saveState(localStorage, current);
      } catch {
        // ignore
      }
      return { ok: false, reason: stash.reason === 'NOT_REGISTERED' ? 'NOT_REGISTERED' : 'STORAGE' };
    }
    setState(DEFAULTS);
    return { ok: true };
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
