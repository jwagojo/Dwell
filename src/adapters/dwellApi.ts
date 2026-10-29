import type { RateResolution } from '../engines/rate';
import type { ListingInput } from '../features/host/validateListing';
import type { User } from '../state/persisted';
import type { Booking } from '../types/booking';
import type { Destination } from '../types/destination';
import type { Car, Listing } from '../types/listing';

/**
 * Typed client for the Dwell HTTP API (design.md "Backend", functions/). Every call sends the Cognito access token,
 * retries once with a refreshed token on 401, and has a 10 s budget. Never throws: failures come back with the
 * API's stable error `code` so pages can show the right message.
 */

export const API_TIMEOUT_MS = 10_000;

/** What the wizard sends. The server validates it (features/host/validateListing.ts), so the flags are plain booleans here. */
export type ListingDraft = Omit<ListingInput, 'rightToList' | 'termsAccepted'> & { rightToList: boolean; termsAccepted: boolean };

export type ApiFailure = {
  ok: false;
  status: number;
  /** The API's error code (OWN_LISTING, TOO_FAR, INVALID_LISTING, ...) or TIMEOUT / NETWORK / UNAUTHORIZED */
  code: string;
  message: string;
  /** Extra fields from the error body, for example `fields` or `metersShown` */
  details: Record<string, unknown>;
};
export type ApiResult<T> = { ok: true; status: number; data: T } | ApiFailure;

export interface TokenSource {
  /** A valid access token, refreshed if it is about to expire. null when signed out. */
  accessToken(): Promise<string | null>;
  /** Force a refresh after a 401. null when the session cannot be renewed. */
  renew(): Promise<string | null>;
}

export interface ApiDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const fail = (status: number, code: string, message: string, details: Record<string, unknown> = {}): ApiFailure => ({ ok: false, status, code, message, details });

export function createApiClient(apiUrl: string, tokens: TokenSource, deps: ApiDeps = {}) {
  async function once<T>(method: string, path: string, token: string, body?: unknown): Promise<ApiResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? API_TIMEOUT_MS);
    try {
      const res = await (deps.fetchImpl ?? fetch)(new URL(path.replace(/^\//, ''), apiUrl).href, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      const json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      if (res.ok) return { ok: true, status: res.status, data: json as T };
      const err = (json?.error ?? {}) as Record<string, unknown>;
      const { code, message, ...details } = err;
      // API Gateway's own 401 has no error code ({"message":"Unauthorized"}).
      return fail(res.status, typeof code === 'string' ? code : res.status === 401 ? 'UNAUTHORIZED' : 'HTTP', typeof message === 'string' ? message : 'Something went wrong. Try again.', details);
    } catch {
      return controller.signal.aborted ? fail(0, 'TIMEOUT', 'The server took too long. Try again.') : fail(0, 'NETWORK', 'Couldn’t reach Dwell. Check your connection.');
    } finally {
      clearTimeout(timer);
    }
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const token = await tokens.accessToken();
    if (!token) return fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
    const first = await once<T>(method, path, token, body);
    if (first.ok || first.status !== 401) return first;
    const renewed = await tokens.renew();
    return renewed ? once<T>(method, path, renewed, body) : first;
  }

  const id = (v: string) => encodeURIComponent(v);
  return {
    request,
    getMe: () => request<{ user: User; car: Car | null; listing: Listing | null; booking: Booking | null }>('GET', '/me'),
    saveCar: (car: Car | null) => request<{ car: Car | null }>('PUT', '/me', { car }),
    listListings: () => request<{ listings: Listing[] }>('GET', '/listings'),
    getListing: (listingId: string) => request<{ listing: Listing }>('GET', `/listings/${id(listingId)}`),
    saveListing: (input: ListingDraft) => request<{ listing: Listing }>('PUT', '/me/listing', input),
    removeListing: () => request<null>('DELETE', '/me/listing'),
    getRate: () => request<{ rate: RateResolution; fallbackReason: string | null }>('GET', '/rate'),
    listCars: () => request<{ cars: Car[] }>('GET', '/cars'),
    getTransit: (p: { lat: number; lng: number }) =>
      request<{ transit: { routes: string[]; nearestStop: string | null } | null; fallbackReason: string | null }>('GET', `/transit?lat=${p.lat.toFixed(5)}&lng=${p.lng.toFixed(5)}`),
    createBooking: (b: { listingId: string; startHour: number; hours: number; destination: Destination | null }) => request<{ booking: Booking }>('POST', '/bookings', b),
    listHostBookings: () => request<{ bookings: HostBooking[] }>('GET', '/me/listing/bookings'),
    getBooking: (bookingId: string) => request<{ booking: Booking; listing: Listing; role: 'DRIVER' | 'HOST' }>('GET', `/bookings/${id(bookingId)}`),
    checkIn: (bookingId: string) => request<{ booking: Booking }>('POST', `/bookings/${id(bookingId)}/check-in`),
    pickup: (bookingId: string, position: { lat: number; lng: number } | null) => request<{ booking: Booking }>('POST', `/bookings/${id(bookingId)}/pickup`, { position }),
    createUpload: (u: { kind: 'listing' | 'arrival' | 'pickup'; bookingId?: string }) =>
      request<{ upload: { key: string; url: string; fields: Record<string, string>; maxBytes: number } }>('POST', '/uploads', { ...u, contentType: 'image/jpeg' }),
  };
}

export type DwellApi = ReturnType<typeof createApiClient>;

/** A booking on the host's listing, as the host sees it: the driver's first name only. */
export interface HostBooking {
  booking: Booking;
  driverName: string;
}
