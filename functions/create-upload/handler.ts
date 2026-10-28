import { randomUUID } from 'node:crypto';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { PHOTO_MAX_BYTES } from '../../src/engines/constants';
import { isReservationExpired } from '../../src/features/session/bookingGuard';
import { s3, ddb } from '../shared/clients';
import { tables } from '../shared/env';
import { api, badRequest, conflict, isId, json, readJson, userId } from '../shared/http';
import type { ProfileItem } from '../shared/items';
import { toEngineBooking } from '../shared/mappers';
import { bookingPhotoKey, listingPhotoPrefix, photoBucket, PHOTO_CONTENT_TYPE, UPLOAD_EXPIRES_S } from '../shared/photos';
import { requireDriverBooking } from '../shared/store';

/** The account's listing id, reserved on first use so photos can be uploaded before the listing is published. */
async function reserveListingId(sub: string): Promise<string> {
  const res = await ddb.send(
    new UpdateCommand({
      TableName: tables.profiles,
      Key: { userId: sub },
      UpdateExpression: 'SET listingId = if_not_exists(listingId, :new)',
      ConditionExpression: 'attribute_exists(userId)',
      ExpressionAttributeValues: { ':new': randomUUID() },
      ReturnValues: 'ALL_NEW',
    }),
  );
  return (res.Attributes as ProfileItem).listingId!;
}

/**
 * POST /uploads: a presigned POST for one photo (Req 1.4, 5.1, 5.5). Body: `{ kind, bookingId?, contentType }`.
 * - `listing`: a new key under the caller's listing.
 * - `arrival`: the driver of a RESERVED, unexpired booking.
 * - `pickup`: the driver of an ACTIVE booking.
 * The policy pins the exact key, JPEG only, at most PHOTO_MAX_BYTES, valid for 5 minutes. The browser never gets
 * bucket permissions.
 */
export const handler = api(async (event) => {
  const sub = userId(event);
  const body = readJson(event);
  if (body.contentType !== PHOTO_CONTENT_TYPE) throw badRequest('Photos must be JPEG images.', { field: 'contentType' });

  let key: string;
  if (body.kind === 'listing') {
    key = `${listingPhotoPrefix(await reserveListingId(sub))}${randomUUID()}.jpg`;
  } else if (body.kind === 'arrival' || body.kind === 'pickup') {
    if (!isId(body.bookingId)) throw badRequest('bookingId is required for session photos.', { field: 'bookingId' });
    const booking = await requireDriverBooking(sub, body.bookingId);
    if (body.kind === 'arrival') {
      if (booking.status !== 'RESERVED') throw conflict('NOT_RESERVED', 'This session has already started.');
      if (isReservationExpired(toEngineBooking(booking), Date.now())) throw conflict('EXPIRED', 'This reservation ended before check-in.');
    } else if (booking.status !== 'ACTIVE') {
      throw conflict('NOT_ACTIVE', 'Pickup photos are for a session in progress.');
    }
    key = bookingPhotoKey(booking.bookingId, body.kind);
  } else {
    throw badRequest('kind must be "listing", "arrival" or "pickup".', { field: 'kind' });
  }

  const { url, fields } = await createPresignedPost(s3, {
    Bucket: photoBucket(),
    Key: key,
    Conditions: [
      ['content-length-range', 1, PHOTO_MAX_BYTES],
      ['eq', '$Content-Type', PHOTO_CONTENT_TYPE],
    ],
    Fields: { 'Content-Type': PHOTO_CONTENT_TYPE },
    Expires: UPLOAD_EXPIRES_S,
  });
  return json(200, { upload: { key, url, fields, maxBytes: PHOTO_MAX_BYTES, expiresInSeconds: UPLOAD_EXPIRES_S } });
});
