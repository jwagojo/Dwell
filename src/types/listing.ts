import type { Adapters, Plug } from '../engines/plug';

export type Level = 'L1' | 'L2';
export type SpotType = 'Driveway' | 'Garage' | 'Carport' | 'Private lot';

export interface AvailabilityWindow {
  id: string;
  /** 0 = Monday ... 6 = Sunday */
  days: number[];
  /** Hour of day 0..23 */
  start: number;
  /** Hour of day 0..23. When end <= start the window runs overnight into the next day. */
  end: number;
}

/** Exact address. Shown to the host and to a driver with a booking, never in public listing summaries. */
export interface PrivateAddress {
  line: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
}

export interface Listing {
  id: string;
  title: string;
  /** Street NAME only (no house number). This is what public cards show. */
  street: string;
  neighborhood: string;
  /** Pin the host confirmed on the map (or, for seeded samples, an approximate point). Used for markers, search distance and the pickup geofence. */
  lat: number;
  lng: number;
  privateAddress?: PrivateAddress;
  spotType: SpotType;
  chargerKw: number;
  level: Level;
  plug: Plug;
  adapters: Adapters;
  solarKw: number;
  spots: number;
  hostName: string;
  /** $/kWh used for the electricity part of the price. An estimate unless the host entered their own bill rate. */
  rate: number;
  /** Where `rate` came from: EIA statewide average, the $0.30 fallback estimate, or the host's own rate */
  rateSource?: 'EIA' | 'FALLBACK' | 'HOST';
  /** "YYYY-MM" month of the EIA data when rateSource is EIA */
  rateDataMonth?: string | null;
  /** Host earnings, $/hr */
  earningsHr: number;
  windows: AvailabilityWindow[];
  instructions: string;
  /** Photo sources: data URLs in the prototype, short-lived S3 URLs from the API. Empty for seeded listings, which show labeled placeholders. */
  photos: string[];
  /** Backend only, host's own listing: the S3 key behind each entry of `photos`, so an edit can keep them. */
  photoKeys?: string[];
  isNew?: boolean;
}

export interface Car {
  id: string;
  name: string;
  /** Max AC charging speed in kW. null means unknown: priced at the charger's full power. */
  maxAcKw: number | null;
  plug: Plug;
}
