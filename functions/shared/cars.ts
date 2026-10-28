import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { EV_MODELS, OTHER_CAR_ID } from '../../src/data/evFallbackSeed';
import type { Car } from '../../src/types/listing';
import { ddb } from './clients';
import { tables } from './env';
import type { EVSpecItem, ProfileItem } from './items';

/**
 * Car reference data: the EVSpecs table (Open EV Data, task 12.2) with the seeded fallback table
 * (src/data/evFallbackSeed.ts) behind it, so the API works before anything is loaded. A table row wins over a
 * fallback row with the same id.
 */

export const evSpecToCar = (i: EVSpecItem): Car => ({
  id: i.evId,
  name: [i.make, i.model].filter(Boolean).join(' '),
  maxAcKw: i.max_ac_kw,
  plug: i.plug_type,
});

export async function listCars(): Promise<Car[]> {
  const byId = new Map<string, Car>(EV_MODELS.map((c) => [c.id, c]));
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: tables.evSpecs, ExclusiveStartKey }));
    for (const item of (page.Items ?? []) as EVSpecItem[]) byId.set(item.evId, evSpecToCar(item));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
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
