import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './clients';
import { tables } from './env';
import { HttpError, notFound } from './http';
import type { BookingItem, ListingItem, ProfileItem } from './items';

/** Reads by primary key. Access checks stay in the handlers so each route states who may see what. */

async function get<T>(TableName: string, Key: Record<string, string>): Promise<T | null> {
  const res = await ddb.send(new GetCommand({ TableName, Key, ConsistentRead: true }));
  return (res.Item as T | undefined) ?? null;
}

export const getProfile = (userId: string) => get<ProfileItem>(tables.profiles, { userId });
export const getListing = (listingId: string) => get<ListingItem>(tables.listings, { listingId });
export const getBooking = (bookingId: string) => get<BookingItem>(tables.bookings, { bookingId });

/** The caller's profile. It is written by the post-confirmation trigger, so a missing one is a setup problem. */
export async function requireProfile(userId: string): Promise<ProfileItem> {
  const p = await getProfile(userId);
  if (!p) throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Your profile is missing. Sign out and back in, or contact support.');
  return p;
}

/** A booking the caller is the driver of. Someone else's booking is reported as not found, never as forbidden. */
export async function requireDriverBooking(userId: string, bookingId: string): Promise<BookingItem> {
  const b = await getBooking(bookingId);
  if (!b || b.customerId !== userId) throw notFound('That booking');
  return b;
}
