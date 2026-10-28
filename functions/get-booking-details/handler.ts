import { api, json, notFound, pathId, userId } from '../shared/http';
import { toApiBooking, toApiListing } from '../shared/mappers';
import { getBooking, getListing } from '../shared/store';

/**
 * GET /bookings/{id}: the booking and its listing with the exact address, instructions and photo URLs. Only the
 * driver and the listing's host may read it (Req 5.7); anyone else gets a 404.
 */
export const handler = api(async (event) => {
  const sub = userId(event);
  const booking = await getBooking(pathId(event, 'id'));
  if (!booking || (booking.customerId !== sub && booking.hostId !== sub)) throw notFound('That booking');
  const listing = await getListing(booking.listingId);
  if (!listing) throw notFound('That listing');
  const [apiBooking, apiListing] = await Promise.all([toApiBooking(booking), toApiListing(listing, { includePrivate: true })]);
  return json(200, { booking: apiBooking, listing: apiListing, role: booking.customerId === sub ? 'DRIVER' : 'HOST' });
});
