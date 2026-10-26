/**
 * Typed adapter for the browser Geolocation API. It never throws: callers get a result object with a plain-language
 * message. The position is used on this device only and is never sent anywhere.
 */

/** Budget for a fix, per the project's adapter timeouts (geolocation: 30 s). */
export const GEOLOCATION_TIMEOUT_MS = 30_000;

export type LocateFailure = 'UNSUPPORTED' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT';

export type LocateResult =
  | { ok: true; lat: number; lng: number; accuracyM: number }
  | { ok: false; reason: LocateFailure; message: string };

const MESSAGES: Record<LocateFailure, string> = {
  UNSUPPORTED: 'This browser can’t share your location. Search for a station or address instead.',
  DENIED: 'Location is blocked for this site. Allow it in your browser’s site settings, or search for a station or address instead.',
  UNAVAILABLE: 'We couldn’t work out where you are. Search for a station or address instead.',
  TIMEOUT: 'Finding your location took too long. Try again, or search for a station or address instead.',
};

const fail = (reason: LocateFailure): LocateResult => ({ ok: false, reason, message: MESSAGES[reason] });

/** Ask the browser for the current position once. A rough fix is enough for finding nearby chargers. */
export function locateUser(timeoutMs: number = GEOLOCATION_TIMEOUT_MS): Promise<LocateResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(fail('UNSUPPORTED'));

    let settled = false;
    const finish = (r: LocateResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(guard);
      resolve(r);
    };
    // The browser's own timeout only starts after permission is given. This one also covers an ignored prompt.
    const guard = window.setTimeout(() => finish(fail('TIMEOUT')), timeoutMs + 2_000);

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => finish({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
        (err) => finish(fail(err.code === err.PERMISSION_DENIED ? 'DENIED' : err.code === err.TIMEOUT ? 'TIMEOUT' : 'UNAVAILABLE')),
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
      );
    } catch {
      finish(fail('UNAVAILABLE'));
    }
  });
}
