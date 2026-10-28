import type { ListingInput } from '../../src/features/host/validateListing';
import type { Booking, BookingResult } from '../../src/types/booking';
import type { Listing, SpotType } from '../../src/types/listing';
import { ACTIVE_PARTITION } from './env';
import type { BookingItem, ListingItem, SpotTypeCode } from './items';
import { viewUrl, viewUrls } from './photos';

/**
 * Item <-> app type conversions. The API speaks the app's own types (src/types), so the frontend swaps localStorage
 * for the API without reshaping data, and the server can run the same features/ helpers the browser runs.
 */

const SPOT_CODE: Record<SpotType, SpotTypeCode> = {
  Driveway: 'DRIVEWAY',
  Garage: 'GARAGE',
  Carport: 'CARPORT',
  'Private lot': 'PRIVATE_LOT',
};
const SPOT_LABEL = Object.fromEntries(Object.entries(SPOT_CODE).map(([label, code]) => [code, label])) as Record<SpotTypeCode, SpotType>;

/** The listing as the engines and features need it. No photos, no private address. */
export function toEngineListing(i: ListingItem): Listing {
  return {
    id: i.listingId,
    title: i.title,
    street: i.street,
    neighborhood: i.neighborhood,
    lat: i.lat,
    lng: i.lng,
    spotType: SPOT_LABEL[i.spot_type],
    chargerKw: i.charger_kW,
    level: i.charger_level,
    plug: i.plug_type,
    adapters: i.adapters_available,
    solarKw: i.solar_kW,
    spots: i.num_spots,
    hostName: i.host_name,
    rate: i.local_rate,
    rateSource: i.rate_source,
    rateDataMonth: i.rate_data_month ?? null,
    earningsHr: i.host_earnings_hr,
    windows: i.availability,
    instructions: i.parking_instructions,
    photos: [],
  };
}

/**
 * The listing as the API returns it. `includePrivate` adds the exact address: only for the host, and for the driver
 * of a booking on it (get-booking-details).
 */
export async function toApiListing(i: ListingItem, opts: { includePrivate: boolean }): Promise<Listing> {
  const listing: Listing = { ...toEngineListing(i), photos: await viewUrls(i.photo_keys) };
  if (opts.includePrivate) {
    listing.privateAddress = { line: i.address_line, unit: i.unit, city: i.city, state: 'MA', zip: i.zip };
    listing.photoKeys = i.photo_keys;
  }
  return listing;
}

export function listingItemFromInput(
  v: ListingInput,
  ids: { listingId: string; hostId: string; hostName: string },
  createdAt: string,
  nowIso: string,
): ListingItem {
  return {
    listingId: ids.listingId,
    hostId: ids.hostId,
    host_name: ids.hostName,
    title: v.title,
    street: v.street,
    neighborhood: v.neighborhood,
    address_line: v.address.line,
    unit: v.address.unit ?? undefined,
    city: v.address.city,
    zip: v.address.zip,
    lat: v.lat,
    lng: v.lng,
    spot_type: SPOT_CODE[v.spotType],
    num_spots: v.spots,
    right_to_list: true,
    charger_kW: v.chargerKw,
    charger_level: v.level,
    plug_type: v.plug,
    adapters_available: v.adapters,
    outdoor_outlet: v.outdoorOutlet,
    solar_kW: v.solarKw,
    host_earnings_hr: v.earningsHr,
    local_rate: v.rate,
    rate_source: v.rateSource,
    rate_data_month: v.rateDataMonth ?? undefined,
    availability: v.windows,
    parking_instructions: v.instructions,
    photo_keys: v.photoKeys,
    active: true,
    activePartition: ACTIVE_PARTITION,
    created_at: createdAt,
    updated_at: nowIso,
  };
}

/** The booking as the features/session helpers need it (bookingGuard, settleBooking). */
export function toEngineBooking(b: BookingItem): Booking {
  return {
    id: b.bookingId,
    listingId: b.listingId,
    dayStart: b.day_start,
    startHour: b.start_hour,
    hours: b.booked_hours,
    destination: b.destination ?? null,
    carName: b.car_name_snapshot,
    carKw: b.car_max_AC_kW_snapshot ?? null,
    pEff: b.P_eff_snapshot,
    pricePerHr: b.price_per_hr_snapshot,
    total: b.total_snapshot,
    status: b.status,
  };
}

function resultOf(b: BookingItem): BookingResult | undefined {
  if (b.status !== 'COMPLETED' || !b.actual_end_time) return undefined;
  return {
    pickupAt: Date.parse(b.actual_end_time),
    lateMinutes: b.late_minutes ?? 0,
    lateFee: b.late_fee ?? 0,
    subtotal: b.subtotal ?? 0,
    serviceFee: b.service_fee ?? 0,
    total: b.customer_total ?? b.total_snapshot,
    flagged: b.geofence_status === 'FLAGGED_FOR_HOST_REVIEW',
    milesAdded: b.estimated_miles_added ?? 0,
    solarShare: b.solar_share ?? null,
    co2Kg: b.co2_saved_kg ?? null,
    greenScore: b.green_score ?? null,
  };
}

/** The booking as the API returns it: photos become short-lived URLs, a finished booking carries its receipt. */
export async function toApiBooking(b: BookingItem): Promise<Booking> {
  const [arrivalPhoto, pickupPhoto] = await Promise.all([
    b.arrival_photo_key ? viewUrl(b.arrival_photo_key) : null,
    b.pickup_photo_key ? viewUrl(b.pickup_photo_key) : null,
  ]);
  const booking: Booking = { ...toEngineBooking(b), arrivalPhoto, pickupPhoto };
  const result = resultOf(b);
  if (result) booking.result = result;
  return booking;
}
