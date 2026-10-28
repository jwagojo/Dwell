import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { EV_MODELS } from '../../src/data/evFallbackSeed';
import { apiEvent, call, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddb.reset());

describe('GET /cars', () => {
  it('serves the seeded fallback cars before EVSpecs is loaded', async () => {
    ddb.on(ScanCommand).resolves({ Items: [] });
    const res = await call(handler, apiEvent());
    expect(res.body.cars).toHaveLength(EV_MODELS.length);
  });

  it('lets an EVSpecs row override a fallback row', async () => {
    ddb.on(ScanCommand).resolves({ Items: [{ evId: 'nissan-leaf', make: 'Nissan', model: 'Leaf (2025)', max_ac_kw: 7.0, plug_type: 'J1772' }] });
    const res = await call(handler, apiEvent());
    expect(res.body.cars.find((c: { id: string }) => c.id === 'nissan-leaf')).toEqual({ id: 'nissan-leaf', name: 'Nissan Leaf (2025)', maxAcKw: 7, plug: 'J1772' });
    expect((await call(handler, apiEvent({ sub: null }))).status).toBe(401);
  });
});
