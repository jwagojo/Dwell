import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './outputs';

/**
 * One-time generator for sample listings across Middlesex County (run: npx tsx scripts/generate-middlesex.ts).
 * Writes scripts/seed-data/middlesexListings.json, which is committed; the seed reads the file, not this script.
 *
 * Each listing sits on a real street in a real town, found with OpenStreetMap Nominatim (data © OpenStreetMap
 * contributors, ODbL), at 1 request per second per its usage policy. There is NO house number: these are fictional
 * homes, so no real house is shown. Charger, host and price details are invented from a fixed-seed generator.
 */

const OUT = path.join(REPO_ROOT, 'scripts', 'seed-data', 'middlesexListings.json');
const UA = { 'user-agent': 'Dwell-seed-generator/1.0 (student project, one-time sample data)' };

/** Middlesex County towns, with how many listings each gets. Cambridge and Somerville already have 19 samples. */
const TOWNS: [string, number][] = [
  ['Lowell', 3], ['Newton', 3], ['Framingham', 3], ['Waltham', 3], ['Medford', 2], ['Malden', 2], ['Everett', 2],
  ['Arlington', 2], ['Watertown', 2], ['Woburn', 2], ['Lexington', 2], ['Natick', 2], ['Marlborough', 2], ['Belmont', 2],
  ['Billerica', 2], ['Chelmsford', 2], ['Acton', 1], ['Ashby', 1], ['Ashland', 1], ['Ayer', 1], ['Bedford', 1],
  ['Boxborough', 1], ['Burlington', 1], ['Carlisle', 1], ['Concord', 1], ['Dracut', 1], ['Dunstable', 1], ['Groton', 1],
  ['Holliston', 1], ['Hopkinton', 1], ['Hudson', 1], ['Lincoln', 1], ['Littleton', 1], ['Maynard', 1], ['Melrose', 1],
  ['North Reading', 1], ['Pepperell', 1], ['Reading', 1], ['Sherborn', 1], ['Shirley', 1], ['Stoneham', 1], ['Stow', 1],
  ['Sudbury', 1], ['Tewksbury', 1], ['Townsend', 1], ['Tyngsborough', 1], ['Wakefield', 1], ['Wayland', 1],
  ['Westford', 1], ['Wilmington', 1], ['Winchester', 1],
];

/** Mulberry32: a small fixed-seed generator, so the invented details are the same on every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261028);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number, step: number) => Math.round((lo + rand() * (hi - lo)) / step) * step;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function nominatim(pathAndQuery: string): Promise<any> {
  await sleep(1100); // usage policy: at most one request per second
  const res = await fetch(`https://nominatim.openstreetmap.org/${pathAndQuery}`, { headers: UA });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}

const ROAD_TYPES = new Set(['residential', 'unclassified', 'tertiary', 'living_street']);
/** Fire roads and service ways are not where homes are. */
const NOT_A_HOME_STREET = /fire road|service road|access road/i;
/** OpenStreetMap postcodes that are outdated or belong to the next town, checked by hand: the town's current ZIPs. */
const ZIP_FIXES: Record<string, { valid: string[]; use: string }> = {
  Lowell: { valid: ['01850', '01851', '01852', '01853', '01854'], use: '01852' },
  Everett: { valid: ['02149'], use: '02149' },
  Arlington: { valid: ['02474', '02476'], use: '02474' },
  Belmont: { valid: ['02478'], use: '02478' },
  Chelmsford: { valid: ['01824', '01863'], use: '01824' },
  Billerica: { valid: ['01821', '01862', '01866'], use: '01821' },
  Pepperell: { valid: ['01463'], use: '01463' },
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const HOSTS = ['Alex', 'Priya', 'Marcus', 'Elena', 'Jamal', 'Grace', 'Diego', 'Mei', 'Owen', 'Fatima', 'Liam', 'Nora', 'Kenji', 'Ava', 'Samir', 'Rosa', 'Theo', 'Hana', 'Luis', 'Chloe', 'Ibrahim', 'Maya', 'Ben', 'Sofia'];
const WINDOWS = [
  { label: 'daily', w: [{ id: 'w1', days: [0, 1, 2, 3, 4, 5, 6], start: 6, end: 22 }] },
  { label: 'workday', w: [{ id: 'w1', days: [0, 1, 2, 3, 4], start: 7, end: 19 }] },
  { label: 'evening', w: [{ id: 'w1', days: [0, 1, 2, 3, 4, 5, 6], start: 16, end: 23 }] },
  { label: 'overnight', w: [{ id: 'w1', days: [0, 1, 2, 3, 4, 5, 6], start: 20, end: 8 }] },
  { label: 'weekend', w: [{ id: 'w1', days: [5, 6], start: 8, end: 20 }] },
  { label: 'daily-long', w: [{ id: 'w1', days: [0, 1, 2, 3, 4, 5, 6], start: 5, end: 23 }] },
];
const NOTES: Record<string, string> = {
  Driveway: 'Pull into the driveway and park nose-in by the garage. The charger cable hangs on the side wall; please coil it when you leave.',
  Garage: 'The garage door is open during your booking. Park in the right bay; the charger is on the back wall. Wind the cable back up when you go.',
  Carport: 'Park under the carport. The charger is on the post nearest the house. Please keep the walkway to the side door clear.',
};

async function main() {
  const listings: unknown[] = [];
  const seen = new Set<string>();
  for (const [town, count] of TOWNS) {
    const found = await nominatim(`search?${new URLSearchParams({ city: town, county: 'Middlesex County', state: 'Massachusetts', country: 'USA', format: 'jsonv2', limit: '1' })}`);
    if (!found[0]) {
      console.warn(`No center for ${town}, skipped`);
      continue;
    }
    const center = { lat: Number(found[0].lat), lng: Number(found[0].lon) };
    let made = 0;
    for (let attempt = 0; made < count && attempt < count * 8; attempt++) {
      // A point 300 m to 2 km from the town center, then the nearest street to it.
      const d = 300 + rand() * 1700;
      const bearing = rand() * 2 * Math.PI;
      const lat = center.lat + (d * Math.cos(bearing)) / 111_195;
      const lng = center.lng + (d * Math.sin(bearing)) / (111_195 * Math.cos((center.lat * Math.PI) / 180));
      const r = await nominatim(`reverse?${new URLSearchParams({ lat: lat.toFixed(6), lon: lng.toFixed(6), zoom: '17', addressdetails: '1', format: 'jsonv2' })}`);
      const a = r?.address ?? {};
      const osmZip = String(a.postcode ?? '').slice(0, 5);
      const fix = ZIP_FIXES[town];
      const zip = fix && !fix.valid.includes(osmZip) ? fix.use : osmZip;
      const place = a.town ?? a.city ?? a.village ?? a.hamlet ?? '';
      if (r?.category !== 'highway' || !ROAD_TYPES.has(r?.type) || !a.road || NOT_A_HOME_STREET.test(a.road) || a.county !== 'Middlesex County' || !/^0[12]\d{3}$/.test(zip)) continue;
      if (place && place !== town) continue; // landed across a town line
      const key = `${town}|${a.road}`;
      if (seen.has(key)) continue;
      seen.add(key);
      made++;

      const level = rand() < 0.1 ? 'L1' : 'L2';
      const plug = rand() < 0.25 ? 'NACS' : 'J1772';
      const spotType = pick(['Driveway', 'Driveway', 'Driveway', 'Garage', 'Carport'] as const);
      const solar = rand() < 0.45 ? between(3, 9, 0.1) : 0;
      listings.push({
        id: `mx-${slug(town)}-${made}`,
        title: `${spotType} on ${a.road}`,
        street: a.road,
        neighborhood: town,
        lat: Number(Number(r.lat).toFixed(6)),
        lng: Number(Number(r.lon).toFixed(6)),
        privateAddress: { line: `${a.road} (sample home, no house number)`, city: town, state: 'MA', zip },
        spotType,
        chargerKw: level === 'L1' ? 1.44 : pick([7.2, 7.7, 9.6, 9.6, 11.5]),
        level,
        plug,
        adapters: rand() < 0.4 ? (plug === 'J1772' ? 'J1772_TO_NACS' : 'NACS_TO_J1772') : rand() < 0.15 ? 'BOTH' : 'NONE',
        solarKw: Number(solar.toFixed(1)),
        spots: rand() < 0.2 ? 2 : 1,
        hostName: pick(HOSTS),
        rate: 0.3,
        earningsHr: between(1.25, 2.75, 0.05),
        windows: pick(WINDOWS).w,
        instructions: NOTES[spotType],
        photos: [],
      });
      console.log(`${town}: ${a.road} ${zip}`);
    }
    if (made < count) console.warn(`${town}: only ${made} of ${count}`);
  }
  const out = {
    _meta: {
      purpose: 'Sample EV charger listings across Middlesex County, Massachusetts, for the Dwell demo. Generated by scripts/generate-middlesex.ts.',
      addresses:
        'Each listing is on a real street in a real town, found with OpenStreetMap Nominatim. There is no house number: the homes are fictional, and the pin is a point on the street, not a house.',
      details: 'Hosts, chargers, plugs, adapters, solar, prices and availability are invented with a fixed-seed generator.',
      attribution: 'Street names and coordinates: © OpenStreetMap contributors, available under the Open Database License (ODbL).',
      generated_at: new Date().toISOString(),
    },
    listings,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${listings.length} listings to ${path.relative(REPO_ROOT, OUT)}`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
