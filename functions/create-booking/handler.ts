import { randomUUID } from 'node:crypto';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { MAX_BOOKING_HOURS } from '../../src/engines/constants';
import { evaluateListing } from '../../src/features/search/evaluateListing';
import { bookingBlock } from '../../src/features/session/bookingGuard';
import { profileCar } from '../shared/cars';
import { ddb } from '../shared/clients';
import { tables } from '../shared/env';
import { api, badRequest, conflict, isId, json, notFound, readJson, userId } from '../shared/http';
import type { BookingItem } from '../shared/items';
import { toApiBooking, toEngineBooking, toEngineListing } from '../shared/mappers';
import { intInRange, parseDestination } from '../shared/parse';
import { getBooking, getListing, requireProfile } from '../shared/store';
import { HOUR_MS, serviceDay } from '../shared/time';

/**
 * POST /bookings: reserve a listing for today (Req 6.1 to 6.4). Body: `{ listingId, startHour, hours, destination }`.
 *
 * The server is authoritative. It reruns the same checks the listing page shows (own listing, one live booking per
 * account, past start hour, plug fit, availability) and prices the booking with evaluateListing on the stored
 * listing and the car saved on the profile. Nothing price-related is read from the request. Payment is simulated.
 */
export const handler = api(async (event) => {
  const sub = userId(event);
  const body = readJson(event);
  if (!isId(body.listingId)) throw badRequest('listingId is required.', { field: 'listingId' });
  const listingId = body.listingId;
  const startHour = intInRange(body, 'startHour', 0, 23);
  const hours = intInRange(body, 'hours', 1, MAX_BOOKING_HOURS);
  const destination = parseDestination(body.destination);

  const now = Date.now();
  const profile = await requireProfile(sub);
  const car = profileCar(profile);
  if (!car) throw conflict('CAR_REQUIRED', 'Choose your car first so the price fits it.');
  const [listing, current] = await Promise.all([
    getListing(listingId),
    profile.currentBookingId ? getBooking(profile.currentBookingId) : null,
  ]);
  if (!listing || !listing.active) throw notFound('That listing');

  const block = bookingBlock(listingId, current ? toEngineBooking(current) : null, profile.listingId ?? null, now);
  if (block?.kind === 'OWN_LISTING' || listing.hostId === sub) throw conflict('OWN_LISTING', 'You can’t book your own listing.');
  if (block?.kind === 'ACTIVE_BOOKING') throw conflict('ACTIVE_BOOKING', 'You already have a booking in progress.', { bookingId: block.booking.id });

  // Bookings are for today in Massachusetts. The current hour still counts as now (bookingGuard startHasPassed).
  const day = serviceDay(now);
  if (startHour < day.hour) throw conflict('START_PASSED', 'That start time has already passed today. Pick a later one.');

  const evaluation = evaluateListing(toEngineListing(listing), car, destination, { startHour, hours, dayIndex: day.dayIndex });
  if (!evaluation) throw new Error(`Listing ${listingId} could not be priced`);
  if (!evaluation.plugOk) throw conflict('PLUG_MISMATCH', 'This charger’s plug doesn’t fit your car, and the host has no adapter for it.');
  if (!evaluation.open) throw conflict('NOT_OPEN', 'This charger isn’t open for that whole window.');

  const bookingId = randomUUID();
  const start = day.dayStart + startHour * HOUR_MS;
  const item: BookingItem = {
    bookingId,
    listingId,
    customerId: sub,
    hostId: listing.hostId,
    booked_start: new Date(start).toISOString(),
    booked_end: new Date(start + hours * HOUR_MS).toISOString(),
    day_start: day.dayStart,
    start_hour: startHour,
    booked_hours: hours,
    destination: destination ?? undefined,
    car_name_snapshot: car.name,
    car_max_AC_kW_snapshot: car.maxAcKw ?? undefined,
    P_eff_snapshot: evaluation.pEff,
    price_per_hr_snapshot: evaluation.pricePerHr,
    total_snapshot: evaluation.total,
    status: 'RESERVED',
    created_at: new Date(now).toISOString(),
  };

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: tables.bookings, Item: item, ConditionExpression: 'attribute_not_exists(bookingId)' } },
        {
          // Swap the account's current booking only if it is still the one judged not live above. A second request
          // racing this one fails here instead of creating a second live booking (Req 6.3).
          Update: {
            TableName: tables.profiles,
            Key: { userId: sub },
            UpdateExpression: 'SET currentBookingId = :new',
            ConditionExpression: current ? 'currentBookingId = :prev' : 'attribute_exists(userId) AND attribute_not_exists(currentBookingId)',
            ExpressionAttributeValues: current ? { ':new': bookingId, ':prev': current.bookingId } : { ':new': bookingId },
          },
        },
        {
          ConditionCheck: {
            TableName: tables.listings,
            Key: { listingId },
            ConditionExpression: 'active = :t',
            ExpressionAttributeValues: { ':t': true },
          },
        },
      ],
    }),
  );
  return json(201, { booking: await toApiBooking(item) });
});
