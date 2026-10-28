import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiEvent, call, HOST, listing, seedTables, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddb.reset());

describe('GET /listings/{id}', () => {
  it('shows the exact address to the host only', async () => {
    seedTables(ddb, { listings: [listing()] });
    expect((await call(handler, apiEvent({ id: 'listing-1' }))).body.listing.privateAddress).toBeUndefined();
    const own = (await call(handler, apiEvent({ sub: HOST, id: 'listing-1' }))).body.listing;
    expect(own.privateAddress.line).toBe('12 Pearl St');
    expect(own.photoKeys).toEqual(['media/listings/listing-1/photo-1.jpg']);
  });

  it('hides a removed listing from everyone but its host', async () => {
    seedTables(ddb, { listings: [listing({ active: false })] });
    expect((await call(handler, apiEvent({ id: 'listing-1' }))).status).toBe(404);
    expect((await call(handler, apiEvent({ sub: HOST, id: 'listing-1' }))).status).toBe(200);
  });
});
