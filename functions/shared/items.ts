import type { Adapters, Plug } from '../../src/engines/plug';
import type { Destination } from '../../src/types/destination';

/**
 * DynamoDB item shapes (design.md "Data Models"). Field names follow the requirements (snake_case); the API returns
 * the app's own camelCase types from src/types (see mappers.ts). Optional fields are absent rather than null, so
 * conditions can use attribute_not_exists.
 */

/** One per account, keyed by the Cognito sub. No role: the same account drives and hosts (Req 1.12). */
export interface ProfileItem {
  userId: string;
  email: string;
  displayName: string;
  /** 10 digits */
  phone: string;
  /** EVSpec id of the car last chosen in Search or on a listing (Req 1.8). Absent for a manually entered car. */
  ev_id?: string;
  ev_name?: string;
  /** Absent with ev_name present = car of unknown speed, priced at the charger's kW (Req 1.10) */
  car_max_AC_kW?: number;
  plug_type?: Plug;
  /** The account's one listing (Req 1.12). Reserved on the first photo upload, kept after removal. */
  listingId?: string;
  /** The account's latest booking, any status. Liveness is computed (bookingGuard). Swapped by conditional write. */
  currentBookingId?: string;
  created_at: string;
}

export type SpotTypeCode = 'DRIVEWAY' | 'GARAGE' | 'CARPORT' | 'PRIVATE_LOT';

export interface AvailabilityItem {
  id: string;
  /** 0 = Monday ... 6 = Sunday */
  days: number[];
  /** Whole hours 0..23. end <= start runs overnight. */
  start: number;
  end: number;
}

export interface ListingItem {
  listingId: string;
  /** Cognito sub of the owner */
  hostId: string;
  /** Host first name, shown on cards */
  host_name: string;
  title: string;
  /** Street NAME only, shown publicly */
  street: string;
  neighborhood: string;
  /** Exact address: the host and a driver with a booking only */
  address_line: string;
  unit?: string;
  city: string;
  zip: string;
  /** Host-confirmed pin */
  lat: number;
  lng: number;
  spot_type: SpotTypeCode;
  num_spots: number;
  right_to_list: true;
  charger_kW: number;
  charger_level: 'L1' | 'L2';
  plug_type: Plug;
  adapters_available: Adapters;
  outdoor_outlet: boolean;
  solar_kW: number;
  host_earnings_hr: number;
  local_rate: number;
  rate_source: 'EIA' | 'FALLBACK' | 'HOST';
  rate_data_month?: string;
  availability: AvailabilityItem[];
  parking_instructions: string;
  /** S3 keys under media/listings/{listingId}/ */
  photo_keys: string[];
  active: boolean;
  /** "ACTIVE" while active, absent otherwise: feeds the sparse `active` index */
  activePartition?: 'ACTIVE';
  created_at: string;
  updated_at: string;
}

export interface EVSpecItem {
  /** Open EV Data unique_code, for example "tesla:model_y:2024:long_range" */
  evId: string;
  make: string;
  model: string;
  year?: number;
  trim?: string;
  /** Body style or similar, for example "Sportback" */
  variant?: string;
  max_ac_kw: number;
  plug_type: Plug;
  source?: 'OPEN_EV_DATA';
}

export type BookingStatus = 'RESERVED' | 'ACTIVE' | 'COMPLETED';

export interface BookingItem {
  bookingId: string;
  listingId: string;
  /** Cognito sub of the driver */
  customerId: string;
  /** Copied from the listing so the host can read it (Req 5.7) */
  hostId: string;
  /** ISO 8601 */
  booked_start: string;
  booked_end: string;
  /** Midnight in Boston of the booking day, epoch ms, plus the start hour and whole hours (the app's Booking shape) */
  day_start: number;
  start_hour: number;
  booked_hours: number;
  /** Frozen for the transit-miles term; absent when booked without one */
  destination?: Destination;
  // Immutable snapshots taken at booking time keep settlement deterministic (Req 3).
  car_name_snapshot: string;
  /** Absent = unknown car, priced at charger_kW */
  car_max_AC_kW_snapshot?: number;
  P_eff_snapshot: number;
  price_per_hr_snapshot: number;
  /** Booked total including the service fee */
  total_snapshot: number;
  status: BookingStatus;
  created_at: string;
  checked_in_at?: string;
  arrival_photo_key?: string;
  pickup_photo_key?: string;
  actual_end_time?: string;
  late_minutes?: number;
  late_fee?: number;
  subtotal?: number;
  service_fee?: number;
  customer_total?: number;
  estimated_miles_added?: number;
  co2_saved_kg?: number;
  solar_share?: number;
  green_score?: number;
  geofence_status?: 'OK' | 'FLAGGED_FOR_HOST_REVIEW';
}
