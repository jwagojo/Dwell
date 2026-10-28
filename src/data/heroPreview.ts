import type { Listing } from '../types/listing';

/**
 * ILLUSTRATION for the landing page's priced ledger and map preview, shown to signed-out visitors. These four are
 * copies of seeded listings near Central (scripts/seed-data, vl-17, vl-13, vl-12, vl-16), reduced to what the
 * preview needs: no exact address, no photos. They are never searchable or bookable; real listings come from the API.
 */
const NOTE = 'Shown for illustration on the landing page.';
const DAILY = (start: number, end: number) => [{ id: 'w1', days: [0, 1, 2, 3, 4, 5, 6], start, end }];

export const HERO_FEATURED_ID = 'vl-12';

export const HERO_PREVIEW_LISTINGS: Listing[] = [
  { id: 'vl-17', title: 'Driveway on Fallon Pl', street: 'Fallon Pl', neighborhood: 'Mid-Cambridge', lat: 42.36832, lng: -71.1146, spotType: 'Driveway', chargerKw: 9.6, level: 'L2', plug: 'J1772', adapters: 'NONE', solarKw: 5, spots: 1, hostName: 'Rosa', rate: 0.3, earningsHr: 1.8, windows: DAILY(8, 20), instructions: NOTE, photos: [] },
  { id: 'vl-13', title: 'Garage on Windsor St', street: 'Windsor St', neighborhood: 'Cambridge', lat: 42.36798, lng: -71.095, spotType: 'Garage', chargerKw: 11.5, level: 'L2', plug: 'J1772', adapters: 'J1772_TO_NACS', solarKw: 6.4, spots: 1, hostName: 'Sam', rate: 0.3, earningsHr: 1.95, windows: DAILY(6, 22), instructions: NOTE, photos: [] },
  { id: HERO_FEATURED_ID, title: 'Driveway on Andrew St', street: 'Andrew St', neighborhood: 'Cambridgeport', lat: 42.36195, lng: -71.11159, spotType: 'Driveway', chargerKw: 9.6, level: 'L2', plug: 'J1772', adapters: 'NONE', solarKw: 5.9, spots: 1, hostName: 'Maya', rate: 0.3, earningsHr: 1.8, windows: DAILY(6, 22), instructions: NOTE, photos: [] },
  { id: 'vl-16', title: 'Evening garage on Tufts St', street: 'Tufts St', neighborhood: 'Cambridgeport', lat: 42.35717, lng: -71.11127, spotType: 'Garage', chargerKw: 7.7, level: 'L2', plug: 'J1772', adapters: 'NONE', solarKw: 3.3, spots: 1, hostName: 'Luis', rate: 0.3, earningsHr: 1.75, windows: DAILY(16, 22), instructions: NOTE, photos: [] },
];
