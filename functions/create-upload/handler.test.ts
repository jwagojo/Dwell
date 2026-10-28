import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiEvent, booking, call, hostProfile, HOST, NOW, profile, seedTables, STRANGER, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddb.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  seedTables(ddb, { profiles: [profile(), hostProfile()], bookings: [booking()] });
});
afterEach(() => vi.useRealTimers());

describe('POST /uploads', () => {
  it('issues a JPEG-only, size-limited presigned POST for the exact arrival key', async () => {
    const res = await call(handler, apiEvent({ body: { kind: 'arrival', bookingId: 'booking-1', contentType: 'image/jpeg' } }));
    expect(res.status).toBe(200);
    expect(res.body.upload.key).toBe('media/bookings/booking-1/arrival.jpg');
    expect(res.body.upload.fields).toMatchObject({ key: 'media/bookings/booking-1/arrival.jpg', 'Content-Type': 'image/jpeg' });
    const policy = JSON.parse(Buffer.from(res.body.upload.fields.Policy, 'base64').toString('utf8'));
    expect(policy.conditions).toContainEqual(['content-length-range', 1, 5 * 1024 * 1024]);
  });

  it('puts listing photos under the account’s listing, reserving an id on first use', async () => {
    const host = await call(handler, apiEvent({ sub: HOST, body: { kind: 'listing', contentType: 'image/jpeg' } }));
    expect(host.body.upload.key).toMatch(/^media\/listings\/listing-1\/[0-9a-f-]+\.jpg$/);
    const fresh = await call(handler, apiEvent({ body: { kind: 'listing', contentType: 'image/jpeg' } }));
    expect(fresh.body.upload.key).toMatch(/^media\/listings\/[0-9a-f-]{36}\/[0-9a-f-]+\.jpg$/);
    expect(ddb.commandCalls(UpdateCommand)[1].args[0].input.UpdateExpression).toBe('SET listingId = if_not_exists(listingId, :new)');
  });

  it('refuses other drivers, the wrong session state, and non-JPEG files', async () => {
    expect((await call(handler, apiEvent({ sub: STRANGER, body: { kind: 'arrival', bookingId: 'booking-1', contentType: 'image/jpeg' } }))).status).toBe(404);
    expect((await call(handler, apiEvent({ body: { kind: 'pickup', bookingId: 'booking-1', contentType: 'image/jpeg' } }))).body.error.code).toBe('NOT_ACTIVE');
    expect((await call(handler, apiEvent({ body: { kind: 'arrival', bookingId: 'booking-1', contentType: 'image/png' } }))).status).toBe(400);
    expect((await call(handler, apiEvent({ body: { kind: 'avatar', contentType: 'image/jpeg' } }))).status).toBe(400);
  });
});
