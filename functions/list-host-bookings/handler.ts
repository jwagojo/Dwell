import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/clients';
import { tables } from '../shared/env';
import { api, json, userId } from '../shared/http';
import type { BookingItem } from '../shared/items';
import { toApiBooking } from '../shared/mappers';
import { getListing, getProfile, requireProfile } from '../shared/store';

/** Index on Bookings by listing, newest booked start first (infra/lib/data-stack.ts). */
export const BY_LISTING_INDEX = 'byListing';
/** The host view shows recent bookings; older ones are not needed for the demo. */
export const MAX_BOOKINGS = 50;

const firstName = (name: string | undefined) => (name ?? '').trim().split(/\s+/)[0] || 'A driver';

/**
 * GET /me/listing/bookings: bookings on the caller's own listing, for the host view (tasks.md 19.2, Req 5.7).
 * Each one has its status, window, totals, photo URLs and geofence status, plus the driver's first name only: never
 * their email or phone. A caller without a listing gets an empty list.
 */
export const handler = api(async (event) => {
  const sub = userId(event);
  const profile = await requireProfile(sub);
  if (!profile.listingId) return json(200, { bookings: [] });
  const listing = await getListing(profile.listingId);
  // The id may be reserved by a photo upload before anything was published.
  if (!listing || listing.hostId !== sub) return json(200, { bookings: [] });

  const res = await ddb.send(
    new QueryCommand({
      TableName: tables.bookings,
      IndexName: BY_LISTING_INDEX,
      KeyConditionExpression: 'listingId = :id',
      ExpressionAttributeValues: { ':id': listing.listingId },
      ScanIndexForward: false,
      Limit: MAX_BOOKINGS,
    }),
  );
  // Belt and braces: the index only holds this listing's bookings, and each carries the host id.
  const items = ((res.Items ?? []) as BookingItem[]).filter((b) => b.hostId === sub);
  const drivers = new Map(
    await Promise.all([...new Set(items.map((b) => b.customerId))].map(async (id) => [id, firstName((await getProfile(id))?.displayName)] as const)),
  );
  const bookings = await Promise.all(items.map(async (b) => ({ booking: await toApiBooking(b), driverName: drivers.get(b.customerId) ?? 'A driver' })));
  return json(200, { bookings });
});
