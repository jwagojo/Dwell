import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiEvent, call, HOST, hostProfile, listing, listingBody, seedTables, STRANGER, profile, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);

beforeEach(() => {
  ddb.reset();
  s3.reset();
  s3.on(HeadObjectCommand).resolves({});
  ddb.on(TransactWriteCommand).resolves({});
  seedTables(ddb, { profiles: [hostProfile(), profile({ userId: STRANGER })], listings: [listing()] });
});

describe('PUT /me/listing', () => {
  it('revalidates and publishes the listing with the profile link in one transaction', async () => {
    const res = await call(handler, apiEvent({ sub: HOST, body: listingBody() }));
    expect(res.status).toBe(200);
    expect(res.body.listing).toMatchObject({ id: 'listing-1', street: 'Pearl St', hostName: 'Hana', rateSource: 'EIA', rateDataMonth: '2026-08' });
    expect(res.body.listing.privateAddress).toMatchObject({ line: '12 Pearl St', zip: '02139' });
    const [put, update] = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    expect(put.Put?.Item).toMatchObject({ hostId: HOST, active: true, activePartition: 'ACTIVE', right_to_list: true, spot_type: 'DRIVEWAY', created_at: '2026-10-01T00:00:00.000Z' });
    expect(update.Update?.ConditionExpression).toContain('listingId = :id');
  });

  it('returns per-field errors for invalid input', async () => {
    const res = await call(handler, apiEvent({ sub: HOST, body: listingBody({ chargerKw: 2, earningsHr: 9, termsAccepted: false }) }));
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['earnings', 'kw', 'terms']);
  });

  it('rejects photos issued to another listing or never uploaded', async () => {
    const foreign = await call(handler, apiEvent({ sub: HOST, body: listingBody({ photoKeys: ['media/listings/other-listing/p.jpg'] }) }));
    expect(foreign.body.error.fields.photos).toBeDefined();
    s3.on(HeadObjectCommand).rejects(Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }));
    const missing = await call(handler, apiEvent({ sub: HOST, body: listingBody() }));
    expect(missing.body.error.fields.photos).toContain('finish uploading');
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('gives a first-time host a new listing id', async () => {
    const res = await call(handler, apiEvent({ sub: STRANGER, body: listingBody({ photoKeys: [] }) }));
    expect(res.status).toBe(400); // photos are required, and none can exist before the id is reserved
    expect((await call(handler, apiEvent({ sub: null, body: listingBody() }))).status).toBe(401);
  });
});
