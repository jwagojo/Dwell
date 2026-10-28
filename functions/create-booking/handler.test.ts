import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiEvent, booking, call, DAY_START, DRIVER, hostProfile, listing, NOW, profile, seedTables, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const body = { listingId: 'listing-1', startHour: 11, hours: 2, destination: { kind: 'station', id: 'central', label: 'Central', lat: 42.3655, lng: -71.1038 } };

beforeEach(() => {
  ddb.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  ddb.on(TransactWriteCommand).resolves({});
});
afterEach(() => vi.useRealTimers());

describe('POST /bookings', () => {
  it('prices the booking on the server from the stored listing and the saved car', async () => {
    seedTables(ddb, { profiles: [profile()], listings: [listing()] });
    const res = await call(handler, apiEvent({ body: { ...body, pricePerHr: 0.01, total: 0.01 } }));
    expect(res.status).toBe(201);
    // Leaf 6.6 kW on a 9.6 kW charger: 6.6 x $0.30 + $1.50 = $3.48/hr; 2 h + 10% fee = $7.66. Client numbers are ignored.
    expect(res.body.booking).toMatchObject({ pEff: 6.6, pricePerHr: 3.48, total: 7.66, status: 'RESERVED', startHour: 11, hours: 2, dayStart: DAY_START });
    const tx = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    expect(tx[0].Put?.Item).toMatchObject({ customerId: DRIVER, hostId: 'host-sub-1', booked_start: '2026-10-28T15:00:00.000Z', booked_end: '2026-10-28T17:00:00.000Z' });
    expect(tx[1].Update?.ConditionExpression).toContain('attribute_not_exists(currentBookingId)');
    expect(tx[2].ConditionCheck?.ConditionExpression).toBe('active = :t');
  });

  it('rejects a caller without a verified token', async () => {
    const res = await call(handler, apiEvent({ sub: null, body }));
    expect(res.status).toBe(401);
  });

  it('blocks booking your own listing', async () => {
    seedTables(ddb, { profiles: [hostProfile({ ev_name: 'Nissan Leaf', plug_type: 'J1772', car_max_AC_kW: 6.6 })], listings: [listing()] });
    const res = await call(handler, apiEvent({ sub: 'host-sub-1', body }));
    expect(res.body.error.code).toBe('OWN_LISTING');
  });

  it('blocks a second live booking, and replaces a finished one with a conditional swap', async () => {
    seedTables(ddb, { profiles: [profile({ currentBookingId: 'booking-1' })], listings: [listing()], bookings: [booking({ status: 'ACTIVE' })] });
    expect((await call(handler, apiEvent({ body }))).body.error.code).toBe('ACTIVE_BOOKING');

    seedTables(ddb, { profiles: [profile({ currentBookingId: 'booking-1' })], listings: [listing()], bookings: [booking({ status: 'COMPLETED' })] });
    expect((await call(handler, apiEvent({ body }))).status).toBe(201);
    const update = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems![1].Update!;
    expect(update.ConditionExpression).toBe('currentBookingId = :prev');
    expect(update.ExpressionAttributeValues).toMatchObject({ ':prev': 'booking-1' });
  });

  it('turns a lost race into a 409', async () => {
    seedTables(ddb, { profiles: [profile()], listings: [listing()] });
    ddb.on(TransactWriteCommand).rejects(Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }] }));
    expect((await call(handler, apiEvent({ body }))).body.error.code).toBe('CONFLICT');
  });

  it.each([
    ['a start hour that has passed in Boston', { ...body, startHour: 9 }, [listing()], 'START_PASSED'],
    ['a plug that does not fit without an adapter', body, [listing({ plug_type: 'NACS' })], 'PLUG_MISMATCH'],
    ['a window outside availability', { ...body, startHour: 21, hours: 3 }, [listing()], 'NOT_OPEN'],
  ])('blocks %s', async (_name, b, listings, code) => {
    seedTables(ddb, { profiles: [profile()], listings });
    const res = await call(handler, apiEvent({ body: b }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(code);
  });

  it('needs a chosen car, an active listing and valid hours', async () => {
    seedTables(ddb, { profiles: [profile({ ev_name: undefined, plug_type: undefined })], listings: [listing()] });
    expect((await call(handler, apiEvent({ body }))).body.error.code).toBe('CAR_REQUIRED');
    seedTables(ddb, { profiles: [profile()], listings: [listing({ active: false })] });
    expect((await call(handler, apiEvent({ body }))).status).toBe(404);
    expect((await call(handler, apiEvent({ body: { ...body, hours: 13 } }))).status).toBe(400);
  });
});
