import type { LineKey } from '../data/transit';

/**
 * Where a driver is headed: either a predefined T station or an address picked from search.
 * Transit routes exist only for stations. They are never invented for addresses.
 */
export interface Destination {
  kind: 'station' | 'address';
  /** Station id, or the Mapbox ID of the address */
  id: string;
  label: string;
  lat: number;
  lng: number;
  routes?: string[];
  primary?: LineKey;
}
