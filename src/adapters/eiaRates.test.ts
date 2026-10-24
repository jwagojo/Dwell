import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveRate } from '../engines/rate';
import {
  RATE_CACHE_TTL_MS,
  RATE_FAILURE_TTL_MS,
  RATE_STORAGE_KEY,
  buildEiaUrl,
  fetchMassachusettsResidentialRate,
  getMassachusettsResidentialRate,
  parseEiaResponse,
  resetEiaRateCache,
} from './eiaRates';

// Shaped like a live EIA v2 response (verified against the real API): numbers are strings, units are spelled out.
const row = (period: string, price: string | null, extra: Record<string, unknown> = {}) => ({
  period,
  stateid: 'MA',
  stateDescription: 'Massachusetts',
  sectorid: 'RES',
  sectorName: 'residential',
  price,
  'price-units': 'cents per kilowatt-hour',
  ...extra,
});
const body = (...data: unknown[]) => ({
  response: { total: String(data.length), dateFormat: 'YYYY-MM', frequency: 'monthly', data, description: 'x' },
  request: { command: '/v2/electricity/retail-sales/data/', params: { frequency: 'monthly' } },
  apiVersion: '2.1.12',
});
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
const KEY = 'SECRET-KEY-DO-NOT-LEAK';

describe('buildEiaUrl', () => {
  const url = new URL(buildEiaUrl(KEY));
  it('calls the retail-sales route', () => {
    expect(url.origin + url.pathname).toBe('https://api.eia.gov/v2/electricity/retail-sales/data/');
  });
  it('asks for the monthly Massachusetts residential price, newest first', () => {
    expect(url.searchParams.get('frequency')).toBe('monthly');
    expect(url.searchParams.get('data[0]')).toBe('price');
    expect(url.searchParams.get('facets[stateid][]')).toBe('MA');
    expect(url.searchParams.get('facets[sectorid][]')).toBe('RES');
    expect(url.searchParams.get('sort[0][column]')).toBe('period');
    expect(url.searchParams.get('sort[0][direction]')).toBe('desc');
    expect(url.searchParams.get('length')).toBe('12');
    expect(url.searchParams.get('api_key')).toBe(KEY);
  });
});

describe('parseEiaResponse', () => {
  it('returns the latest valid record with its data month, still in cents', () => {
    const r = parseEiaResponse(body(row('2026-08', '30.48'), row('2026-07', '30.49'), row('2026-06', '29.61')));
    expect(r).toEqual({ ok: true, rate: { centsPerKwh: 30.48, period: '2026-08' } });
  });

  it('converts cents to dollars per kWh end to end', () => {
    const r = parseEiaResponse(body(row('2026-08', '30.48')));
    if (!r.ok) throw new Error('expected ok');
    expect(resolveRate(r.rate).local_rate).toBe(0.3048);
    expect(resolveRate(r.rate).dataMonth).toBe('2026-08');
  });

  it('skips a newest month that has no usable price and uses the next one', () => {
    const r = parseEiaResponse(body(row('2026-09', null), row('2026-08', ''), row('2026-07', '30.49')));
    expect(r).toEqual({ ok: true, rate: { centsPerKwh: 30.49, period: '2026-07' } });
  });

  it('does not trust the order: the newest valid month wins', () => {
    const r = parseEiaResponse(body(row('2026-05', '28.82'), row('2026-08', '30.48'), row('2026-06', '29.61')));
    expect(r).toMatchObject({ ok: true, rate: { period: '2026-08' } });
  });

  it('accepts a numeric price as well as a string', () => {
    expect(parseEiaResponse(body({ ...row('2026-08', null), price: 30.48 }))).toMatchObject({ ok: true, rate: { centsPerKwh: 30.48 } });
  });

  it.each([
    ['another state', row('2026-08', '30.48', { stateid: 'NH' })],
    ['another sector', row('2026-08', '30.48', { sectorid: 'COM' })],
    ['a malformed month', row('August', '30.48')],
    ['dollar units (the conversion would be wrong)', row('2026-08', '0.3048', { 'price-units': 'dollars per kilowatt-hour' })],
    ['missing units', row('2026-08', '30.48', { 'price-units': undefined })],
    ['a non-numeric price', row('2026-08', 'n/a')],
    ['an implausible price', row('2026-08', '3048')],
    ['a zero price', row('2026-08', '0')],
  ])('rejects %s', (_name, bad) => {
    expect(parseEiaResponse(body(bad))).toEqual({ ok: false, reason: 'NO_VALID_RECORD' });
  });

  it('reports an empty data array as no valid record', () => {
    expect(parseEiaResponse(body())).toEqual({ ok: false, reason: 'NO_VALID_RECORD' });
  });

  it.each([[null], ['text'], [{}], [{ response: {} }], [{ response: { data: 'x' } }], [{ error: 'API_KEY_INVALID' }]])(
    'reports a malformed body as BAD_RESPONSE (%j)',
    (bad) => {
      expect(parseEiaResponse(bad)).toEqual({ ok: false, reason: 'BAD_RESPONSE' });
    },
  );
});

describe('fetchMassachusettsResidentialRate', () => {
  it('returns the rate on success', async () => {
    const r = await fetchMassachusettsResidentialRate({ apiKey: KEY, fetchImpl: (async () => json(body(row('2026-08', '30.48')))) as typeof fetch });
    expect(r).toEqual({ ok: true, rate: { centsPerKwh: 30.48, period: '2026-08' } });
  });

  it('does nothing without a key', async () => {
    const fetchImpl = vi.fn();
    const r = await fetchMassachusettsResidentialRate({ apiKey: '', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: 'NO_KEY' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, /rejected the API key/],
    [403, /rejected the API key/],
    [429, /rate limiting/],
    [500, /error \(500\)/],
  ])('explains HTTP %i', async (status, message) => {
    const r = await fetchMassachusettsResidentialRate({ apiKey: KEY, fetchImpl: (async () => json({}, status)) as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: 'HTTP', status });
    expect(!r.ok && r.message).toMatch(message);
  });

  it('reports a network failure', async () => {
    const r = await fetchMassachusettsResidentialRate({ apiKey: KEY, fetchImpl: (async () => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: 'NETWORK' });
  });

  it('reports a body that is not JSON', async () => {
    const r = await fetchMassachusettsResidentialRate({ apiKey: KEY, fetchImpl: (async () => new Response('<html>oops</html>')) as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: 'BAD_RESPONSE' });
  });

  it('gives up at the timeout and aborts the request', async () => {
    let aborted = false;
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      })) as unknown as typeof fetch;
    const r = await fetchMassachusettsResidentialRate({ apiKey: KEY, fetchImpl, timeoutMs: 30 });
    expect(r).toMatchObject({ ok: false, reason: 'TIMEOUT' });
    expect(aborted).toBe(true);
  });

  it('uses a 5 second timeout by default', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;
      const pending = fetchMassachusettsResidentialRate({ apiKey: KEY, fetchImpl });
      await vi.advanceTimersByTimeAsync(4_999);
      let settled = false;
      void pending.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(await pending).toMatchObject({ ok: false, reason: 'TIMEOUT' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a caller cancellation as ABORTED, not as a failure', async () => {
    const controller = new AbortController();
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;
    const pending = fetchMassachusettsResidentialRate({ apiKey: KEY, fetchImpl, signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, reason: 'ABORTED' });
  });

  it('never puts the API key (or the URL) in a result', async () => {
    const results = await Promise.all([
      fetchMassachusettsResidentialRate({ apiKey: KEY, fetchImpl: (async () => json({}, 403)) as typeof fetch }),
      fetchMassachusettsResidentialRate({ apiKey: KEY, fetchImpl: (async () => Promise.reject(new TypeError(`failed ${buildEiaUrl(KEY)}`))) as typeof fetch }),
      fetchMassachusettsResidentialRate({ apiKey: KEY, fetchImpl: (async () => json({ nope: 1 })) as typeof fetch }),
    ]);
    for (const r of results) expect(JSON.stringify(r)).not.toContain(KEY);
  });
});

describe('central cache (one statewide value, not one fetch per ZIP)', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
  };
  const okFetch = () => vi.fn(async () => json(body(row('2026-08', '30.48'))));

  beforeEach(() => resetEiaRateCache());

  it('shares one in-flight request between simultaneous callers', async () => {
    const fetchImpl = okFetch();
    const opts = { apiKey: KEY, storage: null, fetchImpl: fetchImpl as unknown as typeof fetch };
    const [a, b, c] = await Promise.all([getMassachusettsResidentialRate(opts), getMassachusettsResidentialRate(opts), getMassachusettsResidentialRate(opts)]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, true]);
  });

  it('does not fetch again after a ZIP change (second lookup is served from memory)', async () => {
    const fetchImpl = okFetch();
    const opts = { apiKey: KEY, storage: null, fetchImpl: fetchImpl as unknown as typeof fetch };
    await getMassachusettsResidentialRate(opts); // e.g. ZIP 01854
    await getMassachusettsResidentialRate(opts); // e.g. ZIP 02139
    await getMassachusettsResidentialRate(opts); // e.g. ZIP 02132
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refetches after 24 hours', async () => {
    const fetchImpl = okFetch();
    let now = 1_000_000;
    const opts = { apiKey: KEY, storage: null, now: () => now, fetchImpl: fetchImpl as unknown as typeof fetch };
    await getMassachusettsResidentialRate(opts);
    now += RATE_CACHE_TTL_MS - 1;
    await getMassachusettsResidentialRate(opts);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 2;
    await getMassachusettsResidentialRate(opts);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('remembers a failure for a minute so typing cannot hammer EIA, then retries', async () => {
    const fetchImpl = vi.fn(async () => json({}, 500));
    let now = 5_000_000;
    const opts = { apiKey: KEY, storage: null, now: () => now, fetchImpl: fetchImpl as unknown as typeof fetch };
    expect(await getMassachusettsResidentialRate(opts)).toMatchObject({ ok: false, reason: 'HTTP' });
    expect(await getMassachusettsResidentialRate(opts)).toMatchObject({ ok: false, reason: 'HTTP' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += RATE_FAILURE_TTL_MS + 1;
    await getMassachusettsResidentialRate(opts);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not cache a missing key (fixing .env should take effect immediately)', async () => {
    const fetchImpl = okFetch();
    expect(await getMassachusettsResidentialRate({ apiKey: '', storage: null, fetchImpl: fetchImpl as unknown as typeof fetch })).toMatchObject({ reason: 'NO_KEY' });
    expect(await getMassachusettsResidentialRate({ apiKey: KEY, storage: null, fetchImpl: fetchImpl as unknown as typeof fetch })).toMatchObject({ ok: true });
  });

  it('survives a page reload through storage, and the stored copy holds no key', async () => {
    const storage = memory();
    const first = okFetch();
    await getMassachusettsResidentialRate({ apiKey: KEY, storage, fetchImpl: first as unknown as typeof fetch });
    expect(storage.raw.get(RATE_STORAGE_KEY)).not.toContain(KEY);
    expect(JSON.parse(storage.raw.get(RATE_STORAGE_KEY)!)).toMatchObject({ centsPerKwh: 30.48, period: '2026-08' });

    resetEiaRateCache(); // simulate a reload: memory is gone, storage remains
    const second = okFetch();
    const r = await getMassachusettsResidentialRate({ apiKey: KEY, storage, fetchImpl: second as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, rate: { centsPerKwh: 30.48, period: '2026-08' } });
    expect(second).not.toHaveBeenCalled();
  });

  it.each([
    ['corrupt JSON', '{nope'],
    ['an implausible price', JSON.stringify({ centsPerKwh: 9999, period: '2026-08', at: 1 })],
    ['a bad month', JSON.stringify({ centsPerKwh: 30, period: 'x', at: 1 })],
    ['an expired entry', JSON.stringify({ centsPerKwh: 30, period: '2026-08', at: 1 })],
  ])('ignores stored data that is %s', async (_name, stored) => {
    const storage = memory();
    storage.raw.set(RATE_STORAGE_KEY, stored);
    const fetchImpl = okFetch();
    const r = await getMassachusettsResidentialRate({ apiKey: KEY, storage, now: () => 10 * RATE_CACHE_TTL_MS, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
