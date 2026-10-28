import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CAR_KW_MAX, CAR_KW_MIN } from '../../src/engines/constants';
import type { Plug } from '../../src/engines/plug';
import type { Car } from '../../src/types/listing';
import { findCar, MANUAL_CAR_ID } from '../shared/cars';
import { ddb } from '../shared/clients';
import { tables } from '../shared/env';
import { api, badRequest, json, readJson, userId } from '../shared/http';
import { isObj } from '../shared/parse';

const PLUGS: readonly Plug[] = ['J1772', 'NACS'];

/**
 * The car to save. A listed car is looked up on the server, so its kW cannot be lowered by the client. A car typed
 * in by hand is the driver's own claim (Req 1.9); `maxAcKw: null` means unknown and is priced at the charger's full
 * power (Req 1.10). The driver is never asked about adapters.
 */
async function resolveCar(v: unknown): Promise<Car | null> {
  if (v === null) return null;
  if (!isObj(v) || typeof v.id !== 'string') throw badRequest('car needs an id, or null to clear it.', { field: 'car' });
  if (v.id !== MANUAL_CAR_ID) {
    const car = await findCar(v.id);
    if (!car) throw badRequest('That car is not in the list. Choose another or enter it by hand.', { field: 'car' });
    return car;
  }
  const name = typeof v.name === 'string' ? v.name.trim().slice(0, 60) : '';
  if (name.length < 2) throw badRequest('Enter your car’s make and model.', { field: 'car.name' });
  const kw = v.maxAcKw;
  if (kw !== null && (typeof kw !== 'number' || !Number.isFinite(kw) || kw < CAR_KW_MIN || kw > CAR_KW_MAX)) {
    throw badRequest(`Enter a charging speed between ${CAR_KW_MIN} and ${CAR_KW_MAX} kW, or leave it unknown.`, { field: 'car.maxAcKw' });
  }
  if (typeof v.plug !== 'string' || !(PLUGS as readonly string[]).includes(v.plug)) throw badRequest('Choose your car’s plug.', { field: 'car.plug' });
  return { id: MANUAL_CAR_ID, name, maxAcKw: kw as number | null, plug: v.plug as Plug };
}

/** PUT /me: save the driver's car choice. Body: `{ car: { id } | { id: "other", name, maxAcKw, plug } | null }`. */
export const handler = api(async (event) => {
  const sub = userId(event);
  const body = readJson(event);
  if (!('car' in body)) throw badRequest('Send the car to save.', { field: 'car' });
  const car = await resolveCar(body.car);

  const names = { '#id': 'ev_id', '#name': 'ev_name', '#kw': 'car_max_AC_kW', '#plug': 'plug_type' };
  const base = { TableName: tables.profiles, Key: { userId: sub }, ConditionExpression: 'attribute_exists(userId)' };
  if (!car) {
    await ddb.send(new UpdateCommand({ ...base, UpdateExpression: 'REMOVE #id, #name, #kw, #plug', ExpressionAttributeNames: names }));
  } else {
    const sets = ['#name = :name', '#plug = :plug'];
    const removes: string[] = [];
    const values: Record<string, unknown> = { ':name': car.name, ':plug': car.plug };
    // Every attribute name is used on each path (DynamoDB rejects unused names).
    if (car.id === MANUAL_CAR_ID) {
      removes.push('#id');
    } else {
      sets.push('#id = :id');
      values[':id'] = car.id;
    }
    if (car.maxAcKw === null) {
      removes.push('#kw');
    } else {
      sets.push('#kw = :kw');
      values[':kw'] = car.maxAcKw;
    }
    const UpdateExpression = `SET ${sets.join(', ')}${removes.length ? ` REMOVE ${removes.join(', ')}` : ''}`;
    await ddb.send(new UpdateCommand({ ...base, UpdateExpression, ExpressionAttributeNames: names, ExpressionAttributeValues: values }));
  }
  return json(200, { car });
});
