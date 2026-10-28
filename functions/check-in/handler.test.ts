import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiEvent, booking, call, DAY_START, HOST, NOW, seedTables, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const notFound = Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });

beforeEach(() => {
  ddb.reset();
  s3.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  s3.on(HeadObjectCommand).resolves({});
  seedTables(ddb, { bookings: [booking()] });
});
afterEach(() => vi.useRealTimers());

describe('POST /bookings/{id}/check-in', () => {
  it('starts the session once the arrival photo is in S3', async () => {
    const res = await call(handler, apiEvent({ id: 'booking-1' }));
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('ACTIVE');
    expect(res.body.booking.arrivalPhoto).toContain('dwell-test-photos');
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.ConditionExpression).toBe('#s = :reserved');
  });

  it('stays reserved without the photo', async () => {
    s3.on(HeadObjectCommand).rejects(notFound);
    const res = await call(handler, apiEvent({ id: 'booking-1' }));
    expect(res.body.error.code).toBe('ARRIVAL_PHOTO_MISSING');
    expect(ddb.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('only lets the driver check in, and not after the reservation expired', async () => {
    expect((await call(handler, apiEvent({ sub: HOST, id: 'booking-1' }))).status).toBe(404);
    vi.setSystemTime(DAY_START + 12 * 3_600_000);
    expect((await call(handler, apiEvent({ id: 'booking-1' }))).body.error.code).toBe('EXPIRED');
  });
});
