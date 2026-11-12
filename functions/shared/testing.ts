import { GetCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import type { ApiEvent, ApiResult } from './http';
import type { BookingItem, ListingItem, ProfileItem } from './items';

/**
 * Test helpers for the handlers (used only by *.test.ts). No real AWS calls: tests mock the SDK clients with
 * aws-sdk-client-mock, and presigned URLs are computed locally with these fake credentials.
 */

export const TEST_ENV = {
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
  PROFILES_TABLE: 'Profiles',
  LISTINGS_TABLE: 'Listings',
  BOOKINGS_TABLE: 'Bookings',
  EVSPECS_TABLE: 'EVSpecs',
  PHOTO_BUCKET: 'dwell-test-photos',
  EIA_KEY_PARAM: '/dwell/test/eia-api-key',
  MBTA_KEY_PARAM: '/dwell/test/mbta-api-key',
};

export function useTestEnv(): void {
  Object.assign(process.env, TEST_ENV);
}

export const DRIVER = 'driver-sub-1';
export const HOST = 'host-sub-1';
export const STRANGER = 'stranger-sub-1';

/** Wednesday Oct 28, 2026, 10:15 in Boston (EDT, UTC-4). */
export const NOW = Date.parse('2026-10-28T14:15:00Z');
/** Boston midnight of that day */
export const DAY_START = Date.parse('2026-10-28T04:00:00Z');

export function apiEvent(opts: { sub?: string | null; body?: unknown; id?: string; routeKey?: string } = {}): ApiEvent {
  const sub = opts.sub === undefined ? DRIVER : opts.sub;
  return {
    version: '2.0',
    routeKey: opts.routeKey ?? 'TEST',
    rawPath: '/',
    rawQueryString: '',
    headers: {},
    isBase64Encoded: false,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    pathParameters: opts.id ? { id: opts.id } : undefined,
    requestContext: {
      authorizer: { jwt: { claims: sub ? { sub } : {}, scopes: [] }, principalId: '', integrationLatency: 0 },
    },
  } as unknown as ApiEvent;
}

export async function call(handler: (e: ApiEvent) => Promise<ApiResult>, event: ApiEvent) {
  const res = await handler(event);
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

export const profile = (over: Partial<ProfileItem> = {}): ProfileItem => ({
  userId: DRIVER,
  email: 'driver@example.com',
  displayName: 'Dana Driver',
  phone: '6175550100',
  ev_id: 'nissan-leaf',
  ev_name: 'Nissan Leaf',
  car_max_AC_kW: 6.6,
  plug_type: 'J1772',
  created_at: '2026-10-01T00:00:00.000Z',
  ...over,
});

export const hostProfile = (over: Partial<ProfileItem> = {}): ProfileItem =>
  profile({ userId: HOST, email: 'host@example.com', displayName: 'Hana Host', ev_id: undefined, ev_name: undefined, car_max_AC_kW: undefined, plug_type: undefined, listingId: 'listing-1', ...over });

export const listing = (over: Partial<ListingItem> = {}): ListingItem => ({
  listingId: 'listing-1',
  hostId: HOST,
  host_name: 'Hana',
  title: 'Central driveway',
  street: 'Pearl St',
  neighborhood: 'Cambridgeport',
  address_line: '12 Pearl St',
  city: 'Cambridge',
  zip: '02139',
  lat: 42.3636,
  lng: -71.1046,
  spot_type: 'DRIVEWAY',
  num_spots: 1,
  right_to_list: true,
  charger_kW: 9.6,
  charger_level: 'L2',
  plug_type: 'J1772',
  adapters_available: 'NONE',
  outdoor_outlet: false,
  solar_kW: 6,
  host_earnings_hr: 1.5,
  local_rate: 0.3,
  rate_source: 'HOST',
  availability: [{ id: 'w1', days: [0, 1, 2, 3, 4, 5, 6], start: 6, end: 22 }],
  parking_instructions: 'Pull all the way up the driveway, charger on the left.',
  photo_keys: ['media/listings/listing-1/photo-1.jpg'],
  active: true,
  activePartition: 'ACTIVE',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  ...over,
});

/** A booking for 10 AM to noon today at 3.48/hr (Leaf on the 9.6 kW charger). */
export const booking = (over: Partial<BookingItem> = {}): BookingItem => ({
  bookingId: 'booking-1',
  listingId: 'listing-1',
  customerId: DRIVER,
  hostId: HOST,
  booked_start: new Date(DAY_START + 10 * 3_600_000).toISOString(),
  booked_end: new Date(DAY_START + 12 * 3_600_000).toISOString(),
  day_start: DAY_START,
  start_hour: 10,
  booked_hours: 2,
  destination: { kind: 'station', id: 'central', label: 'Central', lat: 42.3655, lng: -71.1038 },
  car_name_snapshot: 'Nissan Leaf',
  car_max_AC_kW_snapshot: 6.6,
  P_eff_snapshot: 6.6,
  price_per_hr_snapshot: 3.48,
  total_snapshot: 7.66,
  status: 'RESERVED',
  created_at: '2026-10-28T13:00:00.000Z',
  ...over,
});

/** A PUT /me/listing body that passes validateListingInput. */
export const listingBody = (over: Record<string, unknown> = {}) => ({
  title: 'Central driveway',
  street: '',
  neighborhood: 'Cambridgeport',
  address: { line: '12 Pearl St', unit: null, city: 'Cambridge', zip: '02139' },
  lat: 42.3636,
  lng: -71.1046,
  spotType: 'Driveway',
  spots: 1,
  rightToList: true,
  level: 'L2',
  chargerKw: 9.6,
  plug: 'J1772',
  adapters: 'NONE',
  outdoorOutlet: false,
  solarKw: 6,
  rate: 0.3048,
  rateSource: 'EIA',
  rateDataMonth: '2026-08',
  earningsHr: 1.5,
  windows: [{ id: 'w1', days: [0, 1, 2, 3, 4], start: 7, end: 19 }],
  instructions: 'Pull all the way up the driveway, charger on the left.',
  photoKeys: ['media/listings/listing-1/photo-1.jpg'],
  termsAccepted: true,
  ...over,
});

type Store = Record<string, Record<string, unknown>>;
const KEY_FIELD: Record<string, string> = { Profiles: 'userId', Listings: 'listingId', Bookings: 'bookingId', EVSpecs: 'evId' };

/**
 * Serve GetCommand from an in-memory store, and answer UpdateCommand with ReturnValues ALL_NEW by applying its
 * SET clauses (enough for the handlers' simple `SET a = :x, #s = :y` updates).
 */
export function seedTables(ddbMock: AwsClientStub<DynamoDBDocumentClient>, rows: { profiles?: ProfileItem[]; listings?: ListingItem[]; bookings?: BookingItem[] }) {
  const store: Store = { Profiles: {}, Listings: {}, Bookings: {}, EVSpecs: {} };
  for (const p of rows.profiles ?? []) store.Profiles[p.userId] = p;
  for (const l of rows.listings ?? []) store.Listings[l.listingId] = l;
  for (const b of rows.bookings ?? []) store.Bookings[b.bookingId] = b;
  ddbMock.on(GetCommand).callsFake((raw: unknown) => {
    const input = raw as { TableName: string; Key: Record<string, string> };
    const key = input.Key[KEY_FIELD[input.TableName]];
    return { Item: store[input.TableName]?.[key] };
  });
  ddbMock.on(UpdateCommand).callsFake((raw: unknown) => {
    const input = raw as { TableName: string; Key: Record<string, string>; UpdateExpression: string; ExpressionAttributeNames?: Record<string, string>; ExpressionAttributeValues?: Record<string, unknown>; ReturnValues?: string };
    const key = input.Key[KEY_FIELD[input.TableName]];
    const current = { ...(store[input.TableName]?.[key] as Record<string, unknown> | undefined) };
    const setPart = /^SET (.*?)(?: REMOVE .*)?$/.exec(input.UpdateExpression)?.[1] ?? '';
    for (const clause of setPart.split(/,(?![^(]*\))/).map((c) => c.trim()).filter(Boolean)) {
      const [lhs, rhs] = clause.split('=').map((s) => s.trim());
      const field = input.ExpressionAttributeNames?.[lhs] ?? lhs;
      const value = /^if_not_exists\((\w+), (:\w+)\)$/.exec(rhs);
      current[field] = value ? (current[value[1]] ?? input.ExpressionAttributeValues?.[value[2]]) : input.ExpressionAttributeValues?.[rhs];
    }
    store[input.TableName][key] = current;
    return input.ReturnValues === 'ALL_NEW' ? { Attributes: current } : {};
  });
  return store;
}
