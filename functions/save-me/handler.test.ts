import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiEvent, call, profile, seedTables, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const lastUpdate = () => ddb.commandCalls(UpdateCommand).at(-1)!.args[0].input;

beforeEach(() => {
  ddb.reset();
  seedTables(ddb, { profiles: [profile()] });
});

describe('PUT /me', () => {
  it('saves a listed car with its kW from the server, not the client', async () => {
    const res = await call(handler, apiEvent({ body: { car: { id: 'tesla-my', maxAcKw: 3 } } }));
    expect(res.body.car).toEqual({ id: 'tesla-my', name: 'Tesla Model Y', maxAcKw: 11.5, plug: 'NACS' });
    expect(lastUpdate().ExpressionAttributeValues).toMatchObject({ ':kw': 11.5, ':plug': 'NACS' });
    expect(lastUpdate().Key).toEqual({ userId: 'driver-sub-1' });
  });

  it('saves a car entered by hand, unknown speed included', async () => {
    const res = await call(handler, apiEvent({ body: { car: { id: 'other', name: 'Kia EV6', maxAcKw: null, plug: 'J1772' } } }));
    expect(res.body.car).toEqual({ id: 'other', name: 'Kia EV6', maxAcKw: null, plug: 'J1772' });
    expect(lastUpdate().UpdateExpression).toBe('SET #name = :name, #plug = :plug REMOVE #id, #kw');
  });

  it('rejects unknown cars and out-of-range speeds', async () => {
    expect((await call(handler, apiEvent({ body: { car: { id: 'delorean' } } }))).status).toBe(400);
    expect((await call(handler, apiEvent({ body: { car: { id: 'other', name: 'Kia EV6', maxAcKw: 1, plug: 'J1772' } } }))).status).toBe(400);
    expect((await call(handler, apiEvent({ body: {} }))).status).toBe(400);
  });
});
