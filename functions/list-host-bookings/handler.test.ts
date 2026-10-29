import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiEvent, booking, call, HOST, hostProfile, listing, profile, seedTables, STRANGER, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddb.reset();
  seedTables(ddb, { profiles: [hostProfile(), profile(), profile({ userId: STRANGER, listingId: undefined })], listings: [listing()] });
  ddb.on(QueryCommand).resolves({ Items: [booking({ status: 'COMPLETED', geofence_status: 'FLAGGED_FOR_HOST_REVIEW', pickup_photo_key: 'media/bookings/booking-1/pickup.jpg' })] });
});

describe('GET /me/listing/bookings', () => {
  it('lists bookings on the host’s own listing, newest first, with the driver’s first name only', async () => {
    const res = await call(handler, apiEvent({ sub: HOST }));
    expect(res.status).toBe(200);
    expect(res.body.bookings).toHaveLength(1);
    expect(res.body.bookings[0].driverName).toBe('Dana');
    expect(res.body.bookings[0].booking).toMatchObject({ id: 'booking-1', status: 'COMPLETED' });
    expect(res.body.bookings[0].booking.pickupPhoto).toContain('X-Amz-Signature');
    expect(JSON.stringify(res.body)).not.toContain('driver@example.com');
    expect(ddb.commandCalls(QueryCommand)[0].args[0].input).toMatchObject({ IndexName: 'byListing', ExpressionAttributeValues: { ':id': 'listing-1' }, ScanIndexForward: false });
  });

  it('returns nothing for an account without a listing, and refuses a missing token', async () => {
    expect((await call(handler, apiEvent({ sub: STRANGER }))).body.bookings).toEqual([]);
    expect(ddb.commandCalls(QueryCommand)).toHaveLength(0);
    expect((await call(handler, apiEvent({ sub: null }))).status).toBe(401);
  });

  it('drops anything that is not the caller’s', async () => {
    ddb.on(QueryCommand).resolves({ Items: [booking({ hostId: STRANGER })] });
    expect((await call(handler, apiEvent({ sub: HOST }))).body.bookings).toEqual([]);
  });
});
