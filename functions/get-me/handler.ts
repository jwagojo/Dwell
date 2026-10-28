import { profileCar } from '../shared/cars';
import { api, json, userId } from '../shared/http';
import { toApiBooking, toApiListing } from '../shared/mappers';
import { getBooking, getListing, requireProfile } from '../shared/store';

/**
 * GET /me: everything the app restores after sign-in. The account's profile, chosen car, its own active listing
 * (with the exact address) and its latest booking of any status. The app decides liveness with bookingGuard, as the
 * prototype does with its one saved booking.
 */
export const handler = api(async (event) => {
  const sub = userId(event);
  const profile = await requireProfile(sub);
  const [listing, booking] = await Promise.all([
    profile.listingId ? getListing(profile.listingId) : null,
    profile.currentBookingId ? getBooking(profile.currentBookingId) : null,
  ]);
  const ownListing = listing && listing.active && listing.hostId === sub ? listing : null;
  const ownBooking = booking && booking.customerId === sub ? booking : null;
  return json(200, {
    user: { name: profile.displayName, email: profile.email, phone: profile.phone },
    car: profileCar(profile),
    listing: ownListing ? await toApiListing(ownListing, { includePrivate: true }) : null,
    booking: ownBooking ? await toApiBooking(ownBooking) : null,
  });
});
