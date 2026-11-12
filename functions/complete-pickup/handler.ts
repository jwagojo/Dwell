import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { checkPickupDistance } from '../../src/features/session/pickup';
import { settleBooking } from '../../src/features/session/settleBooking';
import { haversineDistanceMeters } from '../../src/lib/geo';
import { ddb } from '../shared/clients';
import { tables } from '../shared/env';
import { api, conflict, json, notFound, pathId, readJson, userId } from '../shared/http';
import type { BookingItem } from '../shared/items';
import { toApiBooking, toEngineBooking, toEngineListing } from '../shared/mappers';
import { parsePosition } from '../shared/parse';
import { bookingPhotoKey, photoExists } from '../shared/photos';
import { getListing, requireDriverBooking } from '../shared/store';
import { bookedIrradiance } from '../shared/sunlight';

/**
 * POST /bookings/{id}/pickup: end the session at the Pickup tap (Req 3.4, 3.5, 5.3 to 5.7).
 * Body: `{ position: { lat, lng } }`, or `{ position: null }` when location is denied or unavailable.
 *
 * - The pickup photo must already be in S3.
 * - With a position, the exact distance to the listing pin must be within the 50 m geofence (features/session/pickup).
 * - Without one, the pickup completes flagged for host review (Req 5.7).
 * - The bill uses the server clock and the values frozen at booking time (features/session/settleBooking).
 *
 * - Solar share, CO2 and the Green Score use Open-Meteo for the booked hours, and are left off when it is unavailable.
 * The position comes from the phone and can be spoofed; the photo and the host-review flag are the backstop.
 */
export const handler = api(async (event) => {
  const sub = userId(event);
  const booking = await requireDriverBooking(sub, pathId(event, 'id'));
  const body = readJson(event);
  const position = body.position === null || body.position === undefined ? null : parsePosition(body.position, 'position');
  if (booking.status !== 'ACTIVE') {
    throw conflict(booking.status === 'COMPLETED' ? 'ALREADY_COMPLETED' : 'NOT_ACTIVE', booking.status === 'COMPLETED' ? 'This session is already finished.' : 'Start the session first.');
  }
  const key = bookingPhotoKey(booking.bookingId, 'pickup');
  if (!(await photoExists(key))) throw conflict('PICKUP_PHOTO_MISSING', 'Add the pickup photo first.');
  const listing = await getListing(booking.listingId);
  if (!listing) throw notFound('That listing');

  if (position) {
    const check = checkPickupDistance(haversineDistanceMeters(listing, position));
    if (!check.ok) throw conflict('TOO_FAR', `You’re ${check.metersShown} m from the car. Walk back to it to pick up.`, { metersShown: check.metersShown });
  }
  const flagged = position === null;
  const now = Date.now();
  // Real sunlight for the booked hours; null (unavailable) leaves the solar figures off the receipt.
  const irradiance = await bookedIrradiance(listing, booking);
  const result = settleBooking(toEngineBooking(booking), toEngineListing(listing), now, flagged, irradiance);
  if (!result) throw new Error(`Booking ${booking.bookingId} could not be settled`);

  const values: Record<string, unknown> = {
    ':done': 'COMPLETED',
    ':active': 'ACTIVE',
    ':end': new Date(now).toISOString(),
    ':late': result.lateMinutes,
    ':lateFee': result.lateFee,
    ':subtotal': result.subtotal,
    ':fee': result.serviceFee,
    ':total': result.total,
    ':miles': result.milesAdded,
    ':geo': flagged ? 'FLAGGED_FOR_HOST_REVIEW' : 'OK',
    ':photo': key,
  };
  const sets = [
    '#s = :done',
    'actual_end_time = :end',
    'late_minutes = :late',
    'late_fee = :lateFee',
    'subtotal = :subtotal',
    'service_fee = :fee',
    'customer_total = :total',
    'estimated_miles_added = :miles',
    'geofence_status = :geo',
    'pickup_photo_key = :photo',
  ];
  // Solar share, CO2 and the Green Score are estimates, stored only when they could be computed.
  const optional: [string, number | null][] = [
    ['solar_share', result.solarShare],
    ['co2_saved_kg', result.co2Kg],
    ['green_score', result.greenScore],
  ];
  for (const [field, value] of optional) {
    if (value === null) continue;
    sets.push(`${field} = :${field}`);
    values[`:${field}`] = value;
  }

  const res = await ddb.send(
    new UpdateCommand({
      TableName: tables.bookings,
      Key: { bookingId: booking.bookingId },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ConditionExpression: '#s = :active',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }),
  );
  return json(200, { booking: await toApiBooking(res.Attributes as BookingItem) });
});
