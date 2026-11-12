/**
 * Open-Meteo hourly solar irradiance (tasks.md 18.5, Req 4.1, 4.2): free, no key. Pure request and response helpers,
 * shared by the browser adapter (adapters/openMeteo.ts) and the complete-pickup Lambda. Hours are Boston local time.
 */

export const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
export const SERVICE_TIME_ZONE = 'America/New_York';

/** Hourly series, keyed by local time "YYYY-MM-DDTHH:00". */
export type IrradianceSeries = Map<string, number>;

/** Yesterday, today and tomorrow: covers settling a booking that ended last night and overnight windows. */
export function buildOpenMeteoUrl(lat: number, lng: number): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lng.toFixed(3),
    hourly: 'shortwave_radiation',
    timezone: SERVICE_TIME_ZONE,
    past_days: '1',
    forecast_days: '2',
  });
  return `${OPEN_METEO_ENDPOINT}?${p.toString()}`;
}

const HOUR_KEY = /^\d{4}-\d{2}-\d{2}T\d{2}:00$/;

/** Validate a response into a series. Rows with a missing or implausible value are dropped, so they read as missing. */
export function parseOpenMeteo(json: unknown): IrradianceSeries | null {
  const h = (json as { hourly?: { time?: unknown; shortwave_radiation?: unknown } } | null)?.hourly;
  if (!h || !Array.isArray(h.time) || !Array.isArray(h.shortwave_radiation) || h.time.length !== h.shortwave_radiation.length) return null;
  const series: IrradianceSeries = new Map();
  h.time.forEach((t, i) => {
    const v = (h.shortwave_radiation as unknown[])[i];
    if (typeof t === 'string' && HOUR_KEY.test(t) && typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1500) series.set(t, v);
  });
  return series.size > 0 ? series : null;
}

/** "YYYY-MM-DD" of an instant in Boston. */
export function localDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SERVICE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** The calendar day after "YYYY-MM-DD". */
function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Irradiance for each hour of a booking window starting at `startHour` on `dateYmd` for `hours` (whole hours, or
 * rounded up). Wraps past midnight into the next day. null when any hour is missing: the Climate_Engine then reports
 * "solar data unavailable" instead of a guess (Req 4.2).
 */
export function windowIrradiance(series: IrradianceSeries, dateYmd: string, startHour: number, hours: number): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < Math.ceil(hours); i++) {
    const h = startHour + i;
    const day = h >= 24 ? nextDay(dateYmd) : dateYmd;
    const v = series.get(`${day}T${String(h % 24).padStart(2, '0')}:00`);
    if (v === undefined) return null;
    out.push(v);
  }
  return out;
}
