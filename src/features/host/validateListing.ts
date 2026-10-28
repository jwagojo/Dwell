import {
  CHARGER_KW_MAX,
  CHARGER_KW_MIN,
  EARNINGS_CAP_MULTIPLE,
  L1_KW_MAX,
  L2_KW_MIN,
  MAX_LISTING_PHOTOS,
  MAX_LOCAL_RATE,
  MAX_SPOTS,
  MIN_INSTRUCTIONS_CHARS,
  MIN_LOCAL_RATE,
  SOLAR_KW_MAX,
  SUGGESTED_EARNINGS_HR,
} from '../../engines/constants';
import type { Adapters, Plug } from '../../engines/plug';
import { isValidDataMonth } from '../../engines/rate';
import { isInMassachusettsArea, isMassachusettsZip, stripHouseNumber } from '../../lib/massachusetts';
import type { AvailabilityWindow, Level, SpotType } from '../../types/listing';

/**
 * Pure validation of a host listing (tasks.md 16.1). The save-my-listing Lambda runs it on every save, so the server
 * never trusts the wizard. Messages match the wizard's wording. Input is `unknown` because it arrives as JSON.
 */

export interface ListingInput {
  title: string;
  /** Street NAME only. Derived from the address line when empty. */
  street: string;
  /** Falls back to the city when empty. */
  neighborhood: string;
  address: { line: string; unit: string | null; city: string; zip: string };
  /** The pin the host confirmed */
  lat: number;
  lng: number;
  spotType: SpotType;
  spots: number;
  rightToList: true;
  level: Level;
  chargerKw: number;
  plug: Plug;
  adapters: Adapters;
  /** L1 only: the host confirmed a dedicated outdoor-rated outlet */
  outdoorOutlet: boolean;
  /** 0 when the home has no solar */
  solarKw: number;
  rate: number;
  rateSource: 'EIA' | 'FALLBACK' | 'HOST';
  rateDataMonth: string | null;
  earningsHr: number;
  windows: AvailabilityWindow[];
  instructions: string;
  /** Uploaded photo keys. The caller checks that they belong to this listing. */
  photoKeys: string[];
  termsAccepted: true;
}

export type ListingField =
  | 'address' | 'line' | 'city' | 'zip' | 'pin' | 'spotType' | 'spots' | 'rightToList'
  | 'level' | 'kw' | 'plug' | 'adapters' | 'outdoorOutlet' | 'solarKw'
  | 'rate' | 'rateSource' | 'earnings'
  | 'title' | 'photos' | 'instructions' | 'windows' | 'terms';

/** Wizard step for each field (0 = Your spot ... 5 = Review), so a UI can jump to the first problem. */
export const FIELD_STEP: Record<ListingField, number> = {
  address: 0, line: 0, city: 0, zip: 0, pin: 0, spotType: 0, spots: 0, rightToList: 0,
  level: 1, kw: 1, plug: 1, adapters: 1, outdoorOutlet: 1, solarKw: 1,
  rate: 2, rateSource: 2, earnings: 2,
  title: 3, photos: 3, instructions: 3,
  windows: 4,
  terms: 5,
};

export type ListingErrors = Partial<Record<ListingField, string>>;
export type ListingValidation = { ok: true; value: ListingInput } | { ok: false; errors: ListingErrors };

/** Upper bounds that only protect storage. The wizard's own limits are lower or absent. */
const MAX_LEN = { title: 100, street: 120, neighborhood: 80, line: 200, unit: 40, city: 80, instructions: 2000, id: 64 } as const;
const MAX_WINDOWS = 14;

const SPOT_TYPES: readonly SpotType[] = ['Driveway', 'Garage', 'Carport', 'Private lot'];
const PLUGS: readonly Plug[] = ['J1772', 'NACS'];
const ADAPTERS: readonly Adapters[] = ['NONE', 'J1772_TO_NACS', 'NACS_TO_J1772', 'BOTH'];
const RATE_SOURCES = ['EIA', 'FALLBACK', 'HOST'] as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN);
const isHour = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 23;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

function validateWindows(v: unknown): { windows: AvailabilityWindow[]; error?: string } {
  if (!Array.isArray(v) || v.length < 1) return { windows: [], error: 'Add at least one availability window.' };
  if (v.length > MAX_WINDOWS) return { windows: [], error: `Use at most ${MAX_WINDOWS} availability windows.` };
  const windows: AvailabilityWindow[] = [];
  for (const [i, w] of v.entries()) {
    if (!isObj(w) || !Array.isArray(w.days) || !isHour(w.start) || !isHour(w.end)) return { windows: [], error: 'Each window needs days and whole-hour start and end times.' };
    const days = [...new Set(w.days)];
    if (days.length === 0) return { windows: [], error: 'Pick at least one day for each window.' };
    if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return { windows: [], error: 'Each window needs days and whole-hour start and end times.' };
    if (w.start === w.end) return { windows: [], error: 'Each window needs different start and end times.' };
    const id = str(w.id).slice(0, MAX_LEN.id) || `w${i + 1}`;
    windows.push({ id, days: (days as number[]).sort((a, b) => a - b), start: w.start, end: w.end });
  }
  return { windows };
}

export function validateListingInput(raw: unknown): ListingValidation {
  const e: ListingErrors = {};
  const r = isObj(raw) ? raw : {};
  const addr = isObj(r.address) ? r.address : {};

  // Step 0: Your spot
  const line = str(addr.line);
  const city = str(addr.city);
  const zip = str(addr.zip);
  const unit = str(addr.unit) || null;
  if (!isObj(r.address)) e.address = 'Choose your address from the suggestions.';
  if (line.length < 4 || line.length > MAX_LEN.line) e.line = 'Enter your street address.';
  if (city.length < 2 || city.length > MAX_LEN.city) e.city = 'Enter your city or town.';
  if (!isMassachusettsZip(zip)) e.zip = 'Enter a 5-digit Massachusetts ZIP code.';
  if (unit !== null && unit.length > MAX_LEN.unit) e.line = 'Shorten the unit number.';
  const lat = num(r.lat);
  const lng = num(r.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) e.pin = 'Place the pin on your driveway or charger entrance.';
  else if (!isInMassachusettsArea(lat, lng)) e.pin = 'Place the pin at your spot in Massachusetts.';
  if (!oneOf(SPOT_TYPES, r.spotType)) e.spotType = 'Choose the type of spot.';
  const spots = num(r.spots);
  if (!Number.isInteger(spots) || spots < 1 || spots > MAX_SPOTS) e.spots = `Choose 1 to ${MAX_SPOTS} spots.`;
  if (r.rightToList !== true) e.rightToList = 'Confirm you have the right to list this spot.';

  // Step 1: Charger
  const level = r.level === 'L1' || r.level === 'L2' ? r.level : null;
  if (!level) e.level = 'Choose the charger level.';
  const kw = num(r.chargerKw);
  const [lo, hi] = level === 'L1' ? [CHARGER_KW_MIN, L1_KW_MAX] : [L2_KW_MIN, CHARGER_KW_MAX];
  if (!Number.isFinite(kw) || kw < lo || kw > hi) e.kw = `Enter a power between ${lo} and ${hi} kW for ${level ?? 'L2'}.`;
  if (!oneOf(PLUGS, r.plug)) e.plug = 'Choose the charger plug.';
  if (!oneOf(ADAPTERS, r.adapters)) e.adapters = 'Say which adapter you leave at the charger, if any.';
  const outdoorOutlet = r.outdoorOutlet === true;
  if (level === 'L1' && !outdoorOutlet) e.outdoorOutlet = 'L1 needs a dedicated outdoor-rated outlet.';
  const solarKw = num(r.solarKw);
  if (!Number.isFinite(solarKw) || solarKw < 0 || solarKw > SOLAR_KW_MAX) e.solarKw = `Enter your system size between 0 and ${SOLAR_KW_MAX} kW.`;

  // Step 2: Pricing
  const rate = num(r.rate);
  if (!Number.isFinite(rate) || rate < MIN_LOCAL_RATE || rate > MAX_LOCAL_RATE) e.rate = `Enter a rate between $${MIN_LOCAL_RATE.toFixed(2)} and $${MAX_LOCAL_RATE.toFixed(2)} per kWh.`;
  if (!oneOf(RATE_SOURCES, r.rateSource)) e.rateSource = 'Unknown rate source.';
  const rateDataMonth = r.rateSource === 'EIA' && isValidDataMonth(r.rateDataMonth) ? r.rateDataMonth : null;
  if (r.rateSource === 'EIA' && rateDataMonth === null) e.rateSource = 'An EIA rate needs its data month.';
  const earningsCap = SUGGESTED_EARNINGS_HR * EARNINGS_CAP_MULTIPLE;
  const earningsHr = num(r.earningsHr);
  if (!Number.isFinite(earningsHr) || earningsHr <= 0) e.earnings = 'Enter what you’d like to earn per hour.';
  else if (earningsHr > earningsCap) e.earnings = `The most you can set here is $${earningsCap.toFixed(2)} per hour (2× the suggested $${SUGGESTED_EARNINGS_HR.toFixed(2)}).`;

  // Step 3: Photos and instructions
  const title = str(r.title);
  if (title.length < 4 || title.length > MAX_LEN.title) e.title = 'Give your listing a title.';
  const photoKeys = Array.isArray(r.photoKeys) ? r.photoKeys.filter((k): k is string => typeof k === 'string') : [];
  if (!Array.isArray(r.photoKeys) || photoKeys.length !== r.photoKeys.length || photoKeys.length < 1) e.photos = 'Add at least one photo.';
  else if (photoKeys.length > MAX_LISTING_PHOTOS || new Set(photoKeys).size !== photoKeys.length) e.photos = `Add up to ${MAX_LISTING_PHOTOS} different photos.`;
  const instructions = str(r.instructions);
  if (instructions.length < MIN_INSTRUCTIONS_CHARS) e.instructions = `Write at least ${MIN_INSTRUCTIONS_CHARS} characters so drivers can find the spot.`;
  else if (instructions.length > MAX_LEN.instructions) e.instructions = `Keep the instructions under ${MAX_LEN.instructions} characters.`;

  // Step 4: Availability
  const { windows, error: windowsError } = validateWindows(r.windows);
  if (windowsError) e.windows = windowsError;

  // Step 5: Review
  if (r.termsAccepted !== true) e.terms = 'Accept the terms to publish.';

  if (Object.keys(e).length > 0) return { ok: false, errors: e };
  const street = (str(r.street) || stripHouseNumber(line)).slice(0, MAX_LEN.street);
  const neighborhood = (str(r.neighborhood) || city).slice(0, MAX_LEN.neighborhood);
  return {
    ok: true,
    value: {
      title,
      street,
      neighborhood,
      address: { line, unit, city, zip },
      lat,
      lng,
      spotType: r.spotType as SpotType,
      spots,
      rightToList: true,
      level: level!,
      chargerKw: kw,
      plug: r.plug as Plug,
      adapters: r.adapters as Adapters,
      outdoorOutlet,
      solarKw,
      rate,
      rateSource: r.rateSource as ListingInput['rateSource'],
      rateDataMonth,
      earningsHr,
      windows,
      instructions,
      photoKeys,
      termsAccepted: true,
    },
  };
}
