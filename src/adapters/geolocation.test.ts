import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locateExact, locateUser } from './geolocation';

type Success = (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type Failure = (e: { code: number; PERMISSION_DENIED: 1; POSITION_UNAVAILABLE: 2; TIMEOUT: 3 }) => void;
const err = (code: number) => ({ code, PERMISSION_DENIED: 1 as const, POSITION_UNAVAILABLE: 2 as const, TIMEOUT: 3 as const });

let getCurrentPosition: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getCurrentPosition = vi.fn();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('geolocation adapter', () => {
  it('returns the exact position and asks for a fresh, high-accuracy fix in exact mode', async () => {
    getCurrentPosition.mockImplementation((ok: Success) => ok({ coords: { latitude: 42.3636123, longitude: -71.1046456, accuracy: 8 } }));
    expect(await locateExact()).toEqual({ ok: true, lat: 42.3636123, lng: -71.1046456, accuracyM: 8 });
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 });
  });

  it('uses a rough, recent fix by default (Near me)', async () => {
    getCurrentPosition.mockImplementation((ok: Success) => ok({ coords: { latitude: 42, longitude: -71, accuracy: 500 } }));
    await locateUser();
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: false, maximumAge: 60_000 });
  });

  it.each([
    [1, 'DENIED'],
    [2, 'UNAVAILABLE'],
    [3, 'TIMEOUT'],
  ])('maps browser error %i to %s', async (code, reason) => {
    getCurrentPosition.mockImplementation((_ok: Success, fail: Failure) => fail(err(code)));
    expect(await locateExact()).toMatchObject({ ok: false, reason });
  });

  it('reports UNSUPPORTED without a geolocation API', async () => {
    vi.stubGlobal('navigator', {});
    expect(await locateExact()).toMatchObject({ ok: false, reason: 'UNSUPPORTED' });
  });

  it('times out when the permission prompt is ignored', async () => {
    vi.useFakeTimers();
    getCurrentPosition.mockImplementation(() => {});
    const pending = locateExact(1_000);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await pending).toMatchObject({ ok: false, reason: 'TIMEOUT' });
  });
});
