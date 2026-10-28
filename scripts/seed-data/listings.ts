import type { AvailabilityWindow, Listing } from '../../src/types/listing';
import mockListings from './mockListings.json';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const daily = (start: number, end: number): AvailabilityWindow[] => [{ id: `d-${start}-${end}`, days: ALL_DAYS, start, end }];

const DRIVEWAY_NOTE =
  'Pull into the driveway and park nose-in next to the garage. The charger cable hangs on the garage wall. Please leave the gate latched.';
const GARAGE_NOTE =
  'The garage door is open during your booking. Park in the left bay. The charger is on the back wall; wind the cable back up when you leave.';

/**
 * Cambridge, Somerville, Allston, Brookline and Dorchester mock listings, loaded from `mockListings.json` (see its `_meta` block).
 * Addresses and photos are real; every charger detail is invented. The JSON shape is checked by listings.test.ts.
 * SEED DATA ONLY: the app never imports this. scripts/seed.ts writes it to DynamoDB, and the app reads it from the API.
 */
export const MOCK_LISTINGS = mockListings.listings as unknown as Listing[];

/**
 * Boston-neighborhood samples (West Roxbury, Roslindale, Jamaica Plain, Dorchester) from the README seed plan.
 * Hosts, addresses and rates are made up.
 */
const BOSTON_SAMPLES: Listing[] = [
  { id: 'walk-hill-st', title: 'Driveway on Walk Hill St', street: 'Walk Hill St', neighborhood: 'Jamaica Plain', lat: 42.3055, lng: -71.1105, spotType: 'Driveway', chargerKw: 9.6, level: 'L2', plug: 'J1772', adapters: 'BOTH', solarKw: 6, spots: 1, hostName: 'Rosa', rate: 0.31, earningsHr: 1.75, windows: daily(6, 22), instructions: DRIVEWAY_NOTE, photos: [] },
  { id: 'cummins-hwy', title: 'Driveway near Roslindale Village', street: 'Cummins Hwy', neighborhood: 'Roslindale', lat: 42.2905, lng: -71.1195, spotType: 'Driveway', chargerKw: 7.7, level: 'L2', plug: 'J1772', adapters: 'NONE', solarKw: 4, spots: 1, hostName: 'Ben', rate: 0.31, earningsHr: 1.5, windows: daily(6, 22), instructions: DRIVEWAY_NOTE, photos: [] },
  { id: 'centre-st', title: 'Garage on Centre St', street: 'Centre St', neighborhood: 'West Roxbury', lat: 42.2955, lng: -71.1485, spotType: 'Garage', chargerKw: 11.5, level: 'L2', plug: 'NACS', adapters: 'NACS_TO_J1772', solarKw: 7.5, spots: 1, hostName: 'Hana', rate: 0.31, earningsHr: 2, windows: daily(6, 22), instructions: GARAGE_NOTE, photos: [] },
  { id: 'dot-ave', title: 'Driveway off Dot Ave', street: 'Dorchester Ave', neighborhood: 'Dorchester', lat: 42.3175, lng: -71.0585, spotType: 'Driveway', chargerKw: 7.2, level: 'L2', plug: 'J1772', adapters: 'NONE', solarKw: 3, spots: 1, hostName: 'Marcus', rate: 0.31, earningsHr: 1.75, windows: daily(6, 22), instructions: DRIVEWAY_NOTE, photos: [] },
];

export const SEEDED_LISTINGS: Listing[] = [...MOCK_LISTINGS, ...BOSTON_SAMPLES];
