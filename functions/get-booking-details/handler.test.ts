import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiEvent, booking, call, HOST, listing, seedTables, STRANGER, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddb.reset();
  seedTables(ddb, { listings: [listing()], bookings: [booking()] });
});

describe('GET /bookings/{id}', () => {
  it('gives the driver the exact address and photo URLs', async () => {
    const res = await call(handler, apiEvent({ id: 'booking-1' }));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('DRIVER');
    expect(res.body.listing.privateAddress.line).toBe('12 Pearl St');
    expect(res.body.listing.photos[0]).toMatch(/^https:\/\/dwell-test-photos\.s3\..*X-Amz-Signature=/);
  });

  it('lets the listing’s host read it and hides it from everyone else', async () => {
    expect((await call(handler, apiEvent({ sub: HOST, id: 'booking-1' }))).body.role).toBe('HOST');
    expect((await call(handler, apiEvent({ sub: STRANGER, id: 'booking-1' }))).status).toBe(404);
    expect((await call(handler, apiEvent({ id: '../etc' }))).status).toBe(404);
  });
});
