import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiEvent, booking, call, HOST, hostProfile, listing, profile, seedTables, STRANGER, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddb.reset());

describe('GET /me', () => {
  it('restores the profile, car, own listing and latest booking', async () => {
    seedTables(ddb, { profiles: [profile({ currentBookingId: 'booking-1' }), hostProfile()], listings: [listing()], bookings: [booking()] });
    const driver = await call(handler, apiEvent());
    expect(driver.body).toMatchObject({ user: { name: 'Dana Driver', phone: '6175550100' }, car: { id: 'nissan-leaf', maxAcKw: 6.6 }, listing: null });
    expect(driver.body.booking.id).toBe('booking-1');
    const host = await call(handler, apiEvent({ sub: HOST }));
    expect(host.body.listing.privateAddress.line).toBe('12 Pearl St');
    expect(host.body.car).toBeNull();
  });

  it('hides a removed listing and reports a missing profile', async () => {
    seedTables(ddb, { profiles: [hostProfile()], listings: [listing({ active: false })] });
    expect((await call(handler, apiEvent({ sub: HOST }))).body.listing).toBeNull();
    expect((await call(handler, apiEvent({ sub: STRANGER }))).body.error.code).toBe('PROFILE_NOT_FOUND');
  });
});
