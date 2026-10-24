import type { LineKey } from './transit';

export interface Station {
  id: string;
  name: string;
  group: 'Cambridge' | 'Boston';
  lat: number;
  lng: number;
  /** Line whose color marks the destination on the map */
  primary: LineKey;
  /** Routes serving the station. SAMPLE DATA until the MBTA V3 adapter lands (tasks.md 18.5). */
  routes: string[];
  /** Extra words accepted by the landing search box */
  aliases?: string[];
}

export const STATIONS: Station[] = [
  { id: 'central', name: 'Central Square', group: 'Cambridge', lat: 42.3654, lng: -71.1031, primary: 'red', aliases: ['central'], routes: ['Red Line', '1', '47', '64', '70', '83', '91', 'CT1'] },
  { id: 'harvard', name: 'Harvard Square', group: 'Cambridge', lat: 42.3734, lng: -71.119, primary: 'red', aliases: ['harvard'], routes: ['Red Line', '1', '66', '69', '71', '72', '73', '74', '75', '77', '78', '86', '96'] },
  { id: 'kendall', name: 'Kendall/MIT', group: 'Cambridge', lat: 42.3624, lng: -71.0862, primary: 'red', aliases: ['kendall', 'mit', 'kendall mit'], routes: ['Red Line', '64', '68', '85', 'CT2'] },
  { id: 'porter', name: 'Porter Square', group: 'Cambridge', lat: 42.3884, lng: -71.1191, primary: 'red', aliases: ['porter'], routes: ['Red Line', 'Commuter Rail', '77', '83', '87', '88', '96'] },
  { id: 'alewife', name: 'Alewife', group: 'Cambridge', lat: 42.3954, lng: -71.1425, primary: 'red', routes: ['Red Line', '62', '67', '76', '79', '84', '350', '351'] },
  { id: 'park', name: 'Park Street', group: 'Boston', lat: 42.3564, lng: -71.0624, primary: 'red', aliases: ['park st'], routes: ['Red Line', 'Green Line'] },
  { id: 'south', name: 'South Station', group: 'Boston', lat: 42.3523, lng: -71.0552, primary: 'red', routes: ['Red Line', 'Commuter Rail', '4', '7', '11'] },
  { id: 'north', name: 'North Station', group: 'Boston', lat: 42.3664, lng: -71.062, primary: 'orange', routes: ['Orange Line', 'Green Line', 'Commuter Rail'] },
  { id: 'backbay', name: 'Back Bay', group: 'Boston', lat: 42.3473, lng: -71.0752, primary: 'orange', routes: ['Orange Line', 'Commuter Rail', '9', '10', '39', '55'] },
  { id: 'foresthills', name: 'Forest Hills', group: 'Boston', lat: 42.3005, lng: -71.1137, primary: 'orange', aliases: ['forest hills station'], routes: ['Orange Line', 'Commuter Rail', '30', '34', '35', '36', '37', '40', '50', '51'] },
  { id: 'jfk', name: 'JFK/UMass', group: 'Boston', lat: 42.321, lng: -71.0524, primary: 'red', aliases: ['jfk', 'umass', 'jfk umass'], routes: ['Red Line', 'Commuter Rail', '16'] },
];

export const DEFAULT_STATION_ID = 'central';
export const stationById = (id: string): Station => STATIONS.find((s) => s.id === id) ?? STATIONS[0];

/** Popular chips on the landing page */
export const POPULAR_STATION_IDS = ['central', 'harvard', 'kendall', 'porter', 'alewife'];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Match free text to a station by name, id or alias. Returns undefined when nothing matches. */
export function findStation(text: string): Station | undefined {
  const q = norm(text);
  if (!q) return undefined;
  return (
    STATIONS.find((s) => norm(s.name) === q || s.id === q || s.aliases?.some((a) => norm(a) === q)) ??
    STATIONS.find((s) => norm(s.name).startsWith(q) && q.length >= 3)
  );
}
