import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiEvent, call, HOST, hostProfile, listing, profile, seedTables, useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddb.reset();
  seedTables(ddb, { profiles: [hostProfile(), profile()], listings: [listing()] });
});

describe('DELETE /me/listing', () => {
  it('takes the host’s own listing out of search, conditioned on ownership', async () => {
    expect((await call(handler, apiEvent({ sub: HOST }))).status).toBe(204);
    const input = ddb.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input).toMatchObject({ Key: { listingId: 'listing-1' }, ConditionExpression: 'hostId = :sub', ExpressionAttributeValues: { ':sub': HOST } });
    expect(input.UpdateExpression).toContain('REMOVE activePartition');
  });

  it('does nothing for an account without a listing', async () => {
    expect((await call(handler, apiEvent())).status).toBe(204);
    expect(ddb.commandCalls(UpdateCommand)).toHaveLength(0);
  });
});
