import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiEvent, call, useTestEnv } from '../shared/testing';
import { handler, resetRateCache } from './handler';

useTestEnv();
const ssm = mockClient(SSMClient);
const EIA_OK = { response: { data: [{ period: '2026-08', stateid: 'MA', sectorid: 'RES', price: '30.48', 'price-units': 'cents per kilowatt-hour' }] } };

beforeEach(() => {
  ssm.reset();
  resetRateCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('GET /rate', () => {
  it('returns the EIA statewide average with the key from SSM, then serves it from cache', async () => {
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: 'test-key' } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(EIA_OK)));
    vi.stubGlobal('fetch', fetchMock);
    const res = await call(handler, apiEvent());
    expect(res.body).toEqual({ rate: { local_rate: 0.3048, source: 'EIA', dataMonth: '2026-08', overridable: true }, fallbackReason: null });
    expect(String(fetchMock.mock.calls[0][0])).toContain('api_key=test-key');
    expect(ssm.commandCalls(GetParameterCommand)[0].args[0].input).toMatchObject({ Name: '/dwell/test/eia-api-key', WithDecryption: true });
    await call(handler, apiEvent());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the labeled $0.30 estimate without a key or when EIA fails', async () => {
    ssm.on(GetParameterCommand).rejects(Object.assign(new Error('missing'), { name: 'ParameterNotFound' }));
    const noKey = await call(handler, apiEvent());
    expect(noKey.body).toEqual({ rate: { local_rate: 0.3, source: 'DEFAULT_0_30', dataMonth: null, overridable: true }, fallbackReason: 'NO_KEY' });

    resetRateCache();
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: 'test-key' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    expect((await call(handler, apiEvent())).body.fallbackReason).toBe('HTTP');
  });
});
