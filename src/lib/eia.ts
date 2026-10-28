import { isPlausibleCents, isValidDataMonth, type EiaRate } from '../engines/rate';

/**
 * Pure helpers for the EIA Open Data API v2 request and response. No network, no environment access, so both the
 * browser adapter (adapters/eiaRates.ts) and the get-electricity-rate Lambda use them.
 */

export const EIA_ENDPOINT = 'https://api.eia.gov/v2/electricity/retail-sales/data/';
/** Rows requested, newest first. A few spare rows let us skip a latest month that has no usable price yet. */
export const EIA_ROW_LIMIT = 12;

export function buildEiaUrl(apiKey: string, length: number = EIA_ROW_LIMIT): string {
  const params = new URLSearchParams();
  params.set('api_key', apiKey);
  params.set('frequency', 'monthly');
  params.set('data[0]', 'price');
  params.set('facets[stateid][]', 'MA');
  params.set('facets[sectorid][]', 'RES');
  params.set('sort[0][column]', 'period');
  params.set('sort[0][direction]', 'desc');
  params.set('length', String(length));
  return `${EIA_ENDPOINT}?${params.toString()}`;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** EIA v2 returns numbers as strings ("30.48"); accept real numbers too. */
const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** EIA labels the unit "cents per kilowatt-hour". The conversion by 100 is only valid for cents, so check it. */
const isCentsPerKwh = (units: unknown): boolean => typeof units === 'string' && /\bcents?\s+per\s+kilowatt-?\s?hour\b/i.test(units);

/**
 * Validate an EIA response and return the latest valid record.
 * Valid means: a Massachusetts residential row, a YYYY-MM period, a numeric price in cents per kWh, and a price that
 * converts to a plausible rate. Rows are not trusted to arrive sorted: the newest valid period wins.
 */
export function parseEiaResponse(json: unknown): { ok: true; rate: EiaRate } | { ok: false; reason: 'BAD_RESPONSE' | 'NO_VALID_RECORD' } {
  const rows = isObj(json) && isObj(json.response) && Array.isArray(json.response.data) ? json.response.data : null;
  if (!rows) return { ok: false, reason: 'BAD_RESPONSE' };
  let best: EiaRate | null = null;
  for (const row of rows) {
    if (!isObj(row)) continue;
    if (row.stateid !== 'MA' || row.sectorid !== 'RES') continue;
    if (!isValidDataMonth(row.period)) continue;
    if (!isCentsPerKwh(row['price-units'])) continue;
    const cents = toNumber(row.price);
    if (cents === null || !isPlausibleCents(cents)) continue;
    if (!best || row.period > best.period) best = { centsPerKwh: cents, period: row.period };
  }
  return best ? { ok: true, rate: best } : { ok: false, reason: 'NO_VALID_RECORD' };
}
