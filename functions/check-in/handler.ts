import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { isReservationExpired } from '../../src/features/session/bookingGuard';
import { ddb } from '../shared/clients';
import { tables } from '../shared/env';
import { api, conflict, json, pathId, userId } from '../shared/http';
import type { BookingItem } from '../shared/items';
import { toApiBooking, toEngineBooking } from '../shared/mappers';
import { bookingPhotoKey, photoExists } from '../shared/photos';
import { requireDriverBooking } from '../shared/store';

/**
 * POST /bookings/{id}/check-in: "I'm plugged in. Start session" (Req 5.1, 5.2). The arrival photo must already be
 * in S3; without it the booking stays RESERVED so the app can offer a retry. A reservation past its booked end has
 * expired and can no longer start (Req 6.4).
 */
export const handler = api(async (event) => {
  const sub = userId(event);
  const booking = await requireDriverBooking(sub, pathId(event, 'id'));
  if (booking.status !== 'RESERVED') throw conflict('NOT_RESERVED', 'This session has already started.');
  const now = Date.now();
  if (isReservationExpired(toEngineBooking(booking), now)) throw conflict('EXPIRED', 'This reservation ended before check-in. Nothing was charged.');
  const key = bookingPhotoKey(booking.bookingId, 'arrival');
  if (!(await photoExists(key))) throw conflict('ARRIVAL_PHOTO_MISSING', 'Add the arrival photo first.');

  const res = await ddb.send(
    new UpdateCommand({
      TableName: tables.bookings,
      Key: { bookingId: booking.bookingId },
      UpdateExpression: 'SET #s = :active, arrival_photo_key = :k, checked_in_at = :t',
      ConditionExpression: '#s = :reserved',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':active': 'ACTIVE', ':reserved': 'RESERVED', ':k': key, ':t': new Date(now).toISOString() },
      ReturnValues: 'ALL_NEW',
    }),
  );
  return json(200, { booking: await toApiBooking(res.Attributes as BookingItem) });
});
