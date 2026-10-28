import { randomUUID } from 'node:crypto';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { validateListingInput } from '../../src/features/host/validateListing';
import { ddb } from '../shared/clients';
import { tables } from '../shared/env';
import { api, conflict, HttpError, json, readJson, userId } from '../shared/http';
import { listingItemFromInput, toApiListing } from '../shared/mappers';
import { isListingPhotoKey, photoExists } from '../shared/photos';
import { getListing, requireProfile } from '../shared/store';

const invalid = (fields: Record<string, string>) => new HttpError(400, 'INVALID_LISTING', 'Some listing details need fixing.', { fields });

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? '';

/**
 * PUT /me/listing: create or replace the account's one listing (Req 1.2 to 1.7, 1.12, 1.13) and publish it.
 * The server reruns the full host validation (features/host/validateListing.ts), checks that every photo was
 * issued to this listing and actually uploaded, and stores the listing and the profile link in one transaction.
 */
export const handler = api(async (event) => {
  const sub = userId(event);
  const v = validateListingInput(readJson(event));
  if (!v.ok) throw invalid(v.errors as Record<string, string>);

  const profile = await requireProfile(sub);
  const listingId = profile.listingId ?? randomUUID();
  const keys = v.value.photoKeys;
  if (!keys.every((k) => isListingPhotoKey(k, listingId))) throw invalid({ photos: 'Upload your photos again, then publish.' });
  const uploaded = await Promise.all(keys.map(photoExists));
  if (uploaded.includes(false)) throw invalid({ photos: 'A photo didn’t finish uploading. Add it again.' });

  const existing = await getListing(listingId);
  if (existing && existing.hostId !== sub) throw conflict('NOT_YOUR_LISTING', 'That listing belongs to another account.');
  const now = new Date().toISOString();
  const item = listingItemFromInput(v.value, { listingId, hostId: sub, hostName: firstName(profile.displayName) }, existing?.created_at ?? now, now);

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tables.listings,
            Item: item,
            ConditionExpression: 'attribute_not_exists(listingId) OR hostId = :sub',
            ExpressionAttributeValues: { ':sub': sub },
          },
        },
        {
          // One listing per account: the profile may point at no listing or at this one, never at another.
          Update: {
            TableName: tables.profiles,
            Key: { userId: sub },
            UpdateExpression: 'SET listingId = :id',
            ConditionExpression: 'attribute_exists(userId) AND (attribute_not_exists(listingId) OR listingId = :id)',
            ExpressionAttributeValues: { ':id': listingId },
          },
        },
      ],
    }),
  );
  return json(200, { listing: await toApiListing(item, { includePrivate: true }) });
});
