import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/clients';
import { tables } from '../shared/env';
import { api, noContent, userId } from '../shared/http';
import { requireProfile } from '../shared/store';

/**
 * DELETE /me/listing: take the account's listing out of search (Req 1.13). The item stays, inactive, so bookings
 * already made on it can still be checked in, picked up and settled. Listing again reuses the same id.
 */
export const handler = api(async (event) => {
  const sub = userId(event);
  const profile = await requireProfile(sub);
  if (!profile.listingId) return noContent();
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tables.listings,
        Key: { listingId: profile.listingId },
        UpdateExpression: 'SET active = :f, updated_at = :now REMOVE activePartition',
        ConditionExpression: 'hostId = :sub',
        ExpressionAttributeValues: { ':f': false, ':now': new Date().toISOString(), ':sub': sub },
      }),
    );
  } catch (err) {
    // The id was reserved by a photo upload but never published: there is nothing to remove.
    if ((err as Error).name !== 'ConditionalCheckFailedException') throw err;
  }
  return noContent();
});
