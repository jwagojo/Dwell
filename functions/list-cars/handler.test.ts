import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { EV_MODELS } from '../../src/data/evFallbackSeed';
import { resetCarsCache } from '../shared/cars';
import { apiEvent, call, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const LEAF = { evId: 'nissan:leaf:2024:base', make: 'Nissan', model: 'LEAF', year: 2024, trim: 'Base', max_ac_kw: 6.6, plug_type: 'J1772' };

beforeEach(() => {
  ddb.reset();
  resetCarsCache();
});

describe('GET /cars', () => {
  it('serves the seeded fallback cars before EVSpecs is loaded', async () => {
    ddb.on(ScanCommand).resolves({ Items: [] });
    const res = await call(handler, apiEvent());
    expect(res.body.cars).toHaveLength(EV_MODELS.length);
  });

  it('lists dataset cars with year and version, and drops the fallback car they cover', async () => {
    ddb.on(ScanCommand).resolves({ Items: [LEAF] });
    const { cars } = (await call(handler, apiEvent())).body;
    expect(cars.find((c: { id: string }) => c.id === LEAF.evId)).toEqual({
      id: LEAF.evId, name: '2024 Nissan LEAF Base', maxAcKw: 6.6, plug: 'J1772', make: 'Nissan', model: 'LEAF', year: 2024, version: 'Base',
    });
    expect(cars.some((c: { id: string }) => c.id === 'nissan-leaf')).toBe(false);
    expect(cars.some((c: { id: string }) => c.id === 'toyota-prius-prime')).toBe(true);
    expect(cars).toHaveLength(EV_MODELS.length);
  });

  it('keeps the list for an hour instead of scanning on every request', async () => {
    ddb.on(ScanCommand).resolves({ Items: [LEAF] });
    await call(handler, apiEvent());
    await call(handler, apiEvent());
    expect(ddb.commandCalls(ScanCommand)).toHaveLength(1);
    expect((await call(handler, apiEvent({ sub: null }))).status).toBe(401);
  });
});
