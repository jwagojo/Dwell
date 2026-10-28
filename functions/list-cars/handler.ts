import { listCars } from '../shared/cars';
import { api, json, userId } from '../shared/http';

/** GET /cars: the car list for Search and the listing page (EVSpecs table plus the seeded fallback table). */
export const handler = api(async (event) => {
  userId(event);
  return json(200, { cars: await listCars() });
});
