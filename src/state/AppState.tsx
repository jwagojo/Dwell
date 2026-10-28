import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_CAR } from '../data/evFallbackSeed';
import type { Booking } from '../types/booking';
import type { Car, Listing } from '../types/listing';
import { stashAccount, type AccountData, type StashResult } from './accounts';
import type { DwellBackend } from './backend';
import { BACKEND_STORAGE_KEY, DEFAULTS, loadSavedState, saveState, type Persisted } from './persisted';
export type { LevelFilter, Persisted, User } from './persisted';

/** Why signing out stopped instead of removing the account's data. */
export type SignOutProblem = 'NOT_REGISTERED' | 'STORAGE';
export type SignOutResult = { ok: true } | { ok: false; reason: SignOutProblem };
export type SyncResult = { ok: true } | { ok: false; message: string };

interface AppContextValue extends Persisted {
  update: (patch: Partial<Persisted>) => void;
  /**
   * Sign out. Prototype: the account's own data (profile, car, host listing, booking) is kept under its email so
   * signing back in restores it; if that data cannot be kept, nothing is removed and the reason comes back, so the
   * page can ask first. `force` signs out anyway. Backend: the session is revoked and the server keeps everything.
   */
  signOut: (opts?: { force?: boolean }) => SignOutResult;
  /** Prototype: start a session for an account that sign-in has already verified. */
  signIn: (data: AccountData) => void;
  /** Backend: active listings from the API. Prototype (no /config.json): only the account's own listing. */
  listings: Listing[];
  /** The driver's car, or a default for hosts previewing search */
  activeCar: Car;
  /** The Cognito session and API client, or null in prototype mode (no /config.json). */
  backend: DwellBackend | null;
  /** Backend: reload the account (profile, car, listing, booking) and the listings from the API. */
  syncAccount: () => Promise<SyncResult>;
  /** Backend: take a booking returned by the API, keeping this browser's photos and pickup step for it. */
  applyBooking: (booking: Booking) => void;
}

// Prototype mode: passwords are never kept in this state; accounts.ts keeps a salted hash for the local sign-in.
// Geocoded addresses saved here come from permanent geocoding (see adapters/mapboxGeocoding.ts).
function load(key?: string): Persisted {
  try {
    return loadSavedState(localStorage, key);
  } catch {
    return DEFAULTS; // storage blocked
  }
}

/** Backend mode keeps only search choices in localStorage; the account lives on the server. */
const prefsOnly = (s: Persisted): Persisted => ({ ...s, user: null, car: null, hostListing: null, booking: null });

/**
 * The server's booking plus what only this browser has: the photo data URLs (until the server returns its own
 * photo URLs) and whether the driver is on the pickup step.
 */
export function mergeBooking(server: Booking, local: Booking | null): Booking {
  if (!local || local.id !== server.id) return server;
  return {
    ...server,
    arrivalPhoto: server.arrivalPhoto ?? local.arrivalPhoto ?? null,
    pickupPhoto: server.pickupPhoto ?? local.pickupPhoto ?? null,
    pickupStarted: server.status === 'ACTIVE' ? local.pickupStarted : false,
  };
}

/** First copy of each id wins, so the booked and own listings (with their exact address) beat the public copy. */
const uniqueById = (lists: (Listing | null)[]): Listing[] => {
  const seen = new Set<string>();
  return lists.filter((l): l is Listing => l !== null && !seen.has(l.id) && (seen.add(l.id), true));
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppStateProvider({ children, backend = null }: { children: ReactNode; backend?: DwellBackend | null }) {
  const [state, setState] = useState<Persisted>(() => (backend ? prefsOnly(load(BACKEND_STORAGE_KEY)) : load()));
  const [remote, setRemote] = useState<{ listings: Listing[]; bookingListing: Listing | null }>({ listings: [], bookingListing: null });
  // With a saved session, wait for the account before rendering, so guarded pages don't bounce to sign-up.
  const [ready, setReady] = useState(() => !backend?.signedIn);

  useEffect(() => {
    try {
      if (backend) saveState(localStorage, prefsOnly(state), BACKEND_STORAGE_KEY);
      else saveState(localStorage, state);
    } catch {
      // Storage full or unavailable: the app keeps working in memory.
    }
  }, [state, backend]);

  // The latest state, readable from callbacks without making them change on every update.
  const stateRef = useRef(state);
  stateRef.current = state;

  const update = useCallback(
    (patch: Partial<Persisted>) => {
      setState((s) => ({ ...s, ...patch }));
      // Backend: the car is saved on the profile, because bookings are priced for it on the server.
      if (backend && 'car' in patch && stateRef.current.user) void backend.api.saveCar(patch.car ?? null);
    },
    [backend],
  );

  const syncAccount = useCallback(async (): Promise<SyncResult> => {
    if (!backend) return { ok: true };
    const me = await backend.api.getMe();
    if (!me.ok) {
      if (me.status === 401) {
        await backend.signOut();
        setState((s) => prefsOnly(s));
      }
      return { ok: false, message: me.message };
    }
    const [details, list] = await Promise.all([
      me.data.booking ? backend.api.getBooking(me.data.booking.id) : Promise.resolve(null),
      backend.api.listListings(),
    ]);
    const serverBooking = details?.ok ? details.data.booking : me.data.booking;
    setState((s) => ({
      ...s,
      user: me.data.user,
      car: me.data.car,
      hostListing: me.data.listing,
      booking: serverBooking ? mergeBooking(serverBooking, s.booking) : null,
    }));
    setRemote({ listings: list.ok ? list.data.listings : [], bookingListing: details?.ok ? details.data.listing : null });
    return list.ok ? { ok: true } : { ok: false, message: list.message };
  }, [backend]);

  useEffect(() => {
    if (!backend?.signedIn) return;
    void syncAccount().finally(() => setReady(true));
  }, [backend, syncAccount]);

  const applyBooking = useCallback((b: Booking) => setState((s) => ({ ...s, booking: mergeBooking(b, s.booking) })), []);

  const signOut = useCallback(
    (opts: { force?: boolean } = {}): SignOutResult => {
      if (backend) {
        void backend.signOut();
        setState(DEFAULTS);
        setRemote({ listings: [], bookingListing: null });
        return { ok: true };
      }
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
    },
    [backend],
  );

  const signIn = useCallback((data: AccountData) => setState({ ...DEFAULTS, ...data }), []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      update,
      signOut,
      signIn,
      listings: backend
        ? uniqueById([remote.bookingListing, state.hostListing, ...remote.listings])
        : state.hostListing
          ? [state.hostListing]
          : [],
      activeCar: state.car ?? DEFAULT_CAR,
      backend,
      syncAccount,
      applyBooking,
    }),
    [state, remote, update, signOut, signIn, backend, syncAccount, applyBooking],
  );

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface" role="status" aria-live="polite">
        <p className="text-[16px] text-muted">Loading your account…</p>
      </div>
    );
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider');
  return ctx;
}
