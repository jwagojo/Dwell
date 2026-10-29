import { EXTERNAL_API_TIMEOUT_MS } from '../../src/engines/constants';
import { buildOpenMeteoUrl, localDate, parseOpenMeteo, windowIrradiance } from '../../src/lib/openMeteo';
import type { BookingItem, ListingItem } from './items';

/**
 * The booked hours' irradiance at the listing, from Open-Meteo (tasks.md 18.5). null when it cannot be fetched or
 * any hour is missing: the receipt then has no solar share, CO2 or Green Score instead of a guess (Req 4.2).
 * Never throws.
 */
export async function bookedIrradiance(listing: Pick<ListingItem, 'lat' | 'lng'>, booking: Pick<BookingItem, 'day_start' | 'start_hour' | 'booked_hours'>): Promise<number[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_API_TIMEOUT_MS);
  try {
    const res = await fetch(buildOpenMeteoUrl(listing.lat, listing.lng), { signal: controller.signal });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const series = parseOpenMeteo(await res.json());
    if (!series) throw new Error('Open-Meteo returned no usable data');
    return windowIrradiance(series, localDate(booking.day_start), booking.start_hour, booking.booked_hours);
  } catch (err) {
    console.warn(JSON.stringify({ level: 'WARN', message: 'Sunlight unavailable at settlement', name: (err as Error).name, detail: (err as Error).message }));
    return null;
  } finally {
    clearTimeout(timer);
  }
}
