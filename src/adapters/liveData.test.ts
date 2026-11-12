import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWalks, parseMatrix, resetWalkCache } from './mapboxWalking';
import { fetchSunlight, getSunlight, resetSunlightCache } from './openMeteo';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const dest = { lat: 42.3655, lng: -71.1038 };
const listings = [
  { id: 'a', lat: 42.366, lng: -71.104 },
  { id: 'b', lat: 42.37, lng: -71.11 },
];

beforeEach(() => {
  resetWalkCache();
  resetSunlightCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Mapbox walking matrix', () => {
  it('routes from the destination to each listing in one request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { code: 'Ok', durations: [[0, 125, null]], distances: [[0, 160, null]] }));
    const r = await getWalks(dest, listings, { token: 'pk.test', fetchImpl });
    expect(r.ok && Object.fromEntries(r.walks)).toEqual({ a: { minutes: 2, meters: 160 } }); // b is unroutable: estimate stays
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain('/directions-matrix/v1/mapbox/walking/-71.103800,42.365500;-71.104000,42.366000;-71.110000,42.370000');
    expect(url).toContain('sources=0');
  });

  it('reuses known walks and reports why it could not route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { code: 'Ok', durations: [[0, 60, 600]], distances: [[0, 80, 700]] }));
    await getWalks(dest, listings, { token: 'pk.test', fetchImpl });
    await getWalks(dest, listings, { token: 'pk.test', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    resetWalkCache();
    expect(await getWalks(dest, listings, { token: '' })).toEqual({ ok: false, reason: 'NO_TOKEN' });
    expect(await getWalks(dest, listings, { token: 'pk.test', fetchImpl: vi.fn().mockResolvedValue(json(401, {})) })).toEqual({ ok: false, reason: 'HTTP' });
    expect(parseMatrix({ code: 'NoRoute' }, ['a'])).toBeNull();
  });
});

describe('Open-Meteo adapter', () => {
  const body = { hourly: { time: ['2026-10-28T12:00'], shortwave_radiation: [600] } };

  it('parses a good response and shares one request per area', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, body));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([getSunlight(42.3655, -71.1038), getSunlight(42.3651, -71.1042)]);
    expect(a.ok && a.series.get('2026-10-28T12:00')).toBe(600);
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws: HTTP errors, bad data and timeouts come back as reasons', async () => {
    expect(await fetchSunlight(42, -71, { fetchImpl: vi.fn().mockResolvedValue(json(500, {})) })).toEqual({ ok: false, reason: 'HTTP' });
    expect(await fetchSunlight(42, -71, { fetchImpl: vi.fn().mockResolvedValue(json(200, { nope: 1 })) })).toEqual({ ok: false, reason: 'BAD_RESPONSE' });
    vi.useFakeTimers();
    const hang = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const pending = fetchSunlight(42, -71, { fetchImpl: hang as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ ok: false, reason: 'TIMEOUT' });
  });
});
