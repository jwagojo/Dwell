import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { EV_MODELS, OTHER_CAR_ID } from '../../src/data/evFallbackSeed';
import type { Car } from '../../src/types/listing';
import { ddb } from './clients';
import { tables } from './env';
import type { EVSpecItem, ProfileItem } from './items';

/**
 * Car reference data: the EVSpecs table (Open EV Data, seeded by scripts/seed.ts) plus the seeded fallback table
 * (src/data/evFallbackSeed.ts). A fallback car is listed only when the table has no car of the same make and model
 * (for example the Prius Prime, which Open EV Data does not cover), so the list never shows two versions of one car.
 * With an empty table the list is the 8 fallback cars, so the API works before seeding.
 */

export const evSpecToCar = (i: EVSpecItem): Car => {
  const version = [i.trim, i.variant].filter(Boolean).join(' ') || undefined;
  return {
    id: i.evId,
    name: [i.year, i.make, i.model, version].filter(Boolean).join(' '),
    maxAcKw: i.max_ac_kw,
    plug: i.plug_type,
    make: i.make,
    model: i.model,
    year: i.year,
    version,
  };
};

/** "Chevy Bolt EV" and "Chevrolet Bolt EV" are the same car. */
const makeModelKey = (name: string) => name.toLowerCase().replace(/^chevy\b/, 'chevrolet').replace(/\s+/g, ' ').trim();

/** Merge table cars with the fallback cars they don't cover, sorted by make, model, then newest year first. */
export function mergeCars(tableCars: Car[], fallback: Car[] = EV_MODELS): Car[] {
  const covered = new Set(tableCars.map((c) => makeModelKey(`${c.make} ${c.model}`)));
  const extra = fallback.filter((c) => !covered.has(makeModelKey(c.name)));
  const label = (c: Car) => (c.make ? `${c.make} ${c.model}` : c.name).toLowerCase();
  return [...tableCars, ...extra].sort(
    (a, b) => label(a).localeCompare(label(b)) || (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name),
  );
}

/** The list changes only when someone reseeds, so one container keeps it for an hour. */
export const CARS_CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { cars: Car[]; at: number } | null = null;

/** Test hook */
export function resetCarsCache(): void {
  cache = null;
}

export async function listCars(now = Date.now()): Promise<Car[]> {
  if (cache && now - cache.at < CARS_CACHE_TTL_MS) return cache.cars;
  const rows: EVSpecItem[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: tables.evSpecs, ExclusiveStartKey }));
    rows.push(...((page.Items ?? []) as EVSpecItem[]));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  const cars = mergeCars(rows.map(evSpecToCar));
  cache = { cars, at: now };
  return cars;
}

export async function findCar(id: string): Promise<Car | null> {
  const res = await ddb.send(new GetCommand({ TableName: tables.evSpecs, Key: { evId: id } }));
  if (res.Item) return evSpecToCar(res.Item as EVSpecItem);
  return EV_MODELS.find((c) => c.id === id) ?? null;
}

/** Id the app uses for a car typed in by hand. */
export const MANUAL_CAR_ID = OTHER_CAR_ID;

/** The car saved on a profile, in the app's Car shape. null when the driver has not chosen one yet. */
export function profileCar(p: ProfileItem): Car | null {
  if (!p.ev_name || !p.plug_type) return null;
  return { id: p.ev_id ?? MANUAL_CAR_ID, name: p.ev_name, maxAcKw: p.car_max_AC_kW ?? null, plug: p.plug_type };
}
