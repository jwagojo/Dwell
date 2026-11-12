import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiEvent, call, useTestEnv } from '../shared/testing';
import { handler, resetTransitCache } from './handler';

useTestEnv();
const ssm = mockClient(SSMClient);
const at = (lat: unknown, lng: unknown) => ({ ...apiEvent(), queryStringParameters: { lat: String(lat), lng: String(lng) } });
const stops = { data: [{ id: '70070', attributes: { name: 'Central', location_type: 0 } }] };
const routes = { data: [{ id: 'Red', attributes: { type: 1, long_name: 'Red Line' } }, { id: '1', attributes: { type: 3, short_name: '1' } }] };

beforeEach(() => {
  ssm.reset();
  resetTransitCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('GET /transit', () => {
  it('returns the routes near a point, with the MBTA key from SSM, then serves it from cache', async () => {
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: 'mbta-key' } });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(stops))).mockResolvedValueOnce(new Response(JSON.stringify(routes)));
    vi.stubGlobal('fetch', fetchMock);
    const res = await call(handler, at(42.3654, -71.1031));
    expect(res.body).toEqual({ transit: { routes: ['Red Line', '1'], nearestStop: 'Central' }, fallbackReason: null });
    expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe('mbta-key');
    await call(handler, at(42.36541, -71.10312));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('works without a key and degrades to null on MBTA errors', async () => {
    ssm.on(GetParameterCommand).rejects(Object.assign(new Error('missing'), { name: 'ParameterNotFound' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('busy', { status: 429 })));
    expect((await call(handler, at(42.3654, -71.1031))).body).toEqual({ transit: null, fallbackReason: 'HTTP' });
  });

  it('rejects points outside Massachusetts and callers without a token', async () => {
    expect((await call(handler, at(40.7, -74))).status).toBe(400);
    expect((await call(handler, at('x', 'y'))).status).toBe(400);
    expect((await call(handler, { ...apiEvent({ sub: null }), queryStringParameters: { lat: '42.36', lng: '-71.1' } })).status).toBe(401);
  });
});
