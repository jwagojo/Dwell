import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiEvent, booking, call, DAY_START, listing, profile, seedTables, STRANGER, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const AT_CAR = { lat: 42.3636, lng: -71.1046 };
const HALF_PAST_NOON = DAY_START + 12.5 * 3_600_000;

beforeEach(() => {
  ddb.reset();
  s3.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HALF_PAST_NOON);
  s3.on(HeadObjectCommand).resolves({});
  seedTables(ddb, { profiles: [profile()], listings: [listing()], bookings: [booking({ status: 'ACTIVE', arrival_photo_key: 'media/bookings/booking-1/arrival.jpg' })] });
});
afterEach(() => vi.useRealTimers());

describe('POST /bookings/{id}/pickup', () => {
  it('settles at the car with the server clock and the frozen price', async () => {
    const res = await call(handler, apiEvent({ id: 'booking-1', body: { position: AT_CAR } }));
    expect(res.status).toBe(200);
    // 30 minutes late at $3.48/hr: late fee 0.5 x 3.48 x 1.5 = $2.61; total (6.96 + 2.61) x 1.10 = $10.53.
    expect(res.body.booking.status).toBe('COMPLETED');
    expect(res.body.booking.result).toMatchObject({ lateMinutes: 30, lateFee: 2.61, total: 10.53, flagged: false, milesAdded: 46.2 });
    const update = ddb.commandCalls(UpdateCommand)[0].args[0].input;
    expect(update.ConditionExpression).toBe('#s = :active');
    expect(update.ExpressionAttributeValues).toMatchObject({ ':geo': 'OK', ':photo': 'media/bookings/booking-1/pickup.jpg' });
  });

  it('blocks a pickup outside the 50 m geofence and shows the rounded-up distance', async () => {
    // 50.4 m north: outside by less than a meter, shown as 51 so the number never contradicts the result.
    const res = await call(handler, apiEvent({ id: 'booking-1', body: { position: { lat: AT_CAR.lat + 50.4 / 111_195, lng: AT_CAR.lng } } }));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'TOO_FAR', metersShown: 51 });
    expect(ddb.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('completes flagged for host review when location is unavailable', async () => {
    const res = await call(handler, apiEvent({ id: 'booking-1', body: { position: null } }));
    expect(res.body.booking.result.flagged).toBe(true);
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues).toMatchObject({ ':geo': 'FLAGGED_FOR_HOST_REVIEW' });
  });

  it('needs the pickup photo in S3 first', async () => {
    s3.on(HeadObjectCommand).rejects(Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }));
    const res = await call(handler, apiEvent({ id: 'booking-1', body: { position: AT_CAR } }));
    expect(res.body.error.code).toBe('PICKUP_PHOTO_MISSING');
  });

  it('hides other drivers’ bookings and refuses a session that has not started', async () => {
    expect((await call(handler, apiEvent({ sub: STRANGER, id: 'booking-1', body: { position: AT_CAR } }))).status).toBe(404);
    seedTables(ddb, { listings: [listing()], bookings: [booking()] });
    expect((await call(handler, apiEvent({ id: 'booking-1', body: { position: AT_CAR } }))).body.error.code).toBe('NOT_ACTIVE');
  });

  it('rejects a malformed position', async () => {
    expect((await call(handler, apiEvent({ id: 'booking-1', body: { position: { lat: 'x' } } }))).status).toBe(400);
  });
});
