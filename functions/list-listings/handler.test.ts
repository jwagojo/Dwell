import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiEvent, call, listing, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddb.reset());

describe('GET /listings', () => {
  it('reads every page of the active index and returns public fields only', async () => {
    ddb
      .on(QueryCommand)
      .resolvesOnce({ Items: [listing()], LastEvaluatedKey: { listingId: 'listing-1' } })
      .resolvesOnce({ Items: [listing({ listingId: 'listing-2' })] });
    const res = await call(handler, apiEvent());
    expect(res.status).toBe(200);
    expect(res.body.listings.map((l: { id: string }) => l.id)).toEqual(['listing-1', 'listing-2']);
    expect(res.body.listings[0].privateAddress).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('12 Pearl St');
    expect(ddb.commandCalls(QueryCommand)[0].args[0].input).toMatchObject({ IndexName: 'active', ExpressionAttributeValues: { ':a': 'ACTIVE' } });
  });

  it('needs a signed-in caller', async () => {
    expect((await call(handler, apiEvent({ sub: null }))).status).toBe(401);
  });
});
