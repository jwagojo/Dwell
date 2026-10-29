import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Plug } from '../src/engines/plug';
import type { EVSpecItem } from '../functions/shared/items';
import { REPO_ROOT } from './outputs';

/**
 * Open EV Data (https://github.com/open-ev-data/open-ev-data-dataset), CDLA-Permissive-2.0. Pinned to one release
 * and checked by SHA-256, so a seed always writes the same cars. The file is downloaded once into a git-ignored
 * cache (scripts/seed-data/.cache/) and not committed. To upgrade: change the version and hash, then reseed.
 */
export const EV_DATA_VERSION = 'v1.24.0';
export const EV_DATA_SHA256 = '38c4f579c8fb4edf27921faa79d9eb27069f522d088578e95637fa9dfe4ef786';
export const EV_DATA_URL = `https://github.com/open-ev-data/open-ev-data-dataset/releases/download/${EV_DATA_VERSION}/open-ev-data-${EV_DATA_VERSION}.json`;
export const EV_DATA_CACHE = path.join(REPO_ROOT, 'scripts', 'seed-data', '.cache', `open-ev-data-${EV_DATA_VERSION}.json`);

/** The parts of an Open EV Data vehicle the seed reads. */
export interface EvDataVehicle {
  unique_code: string;
  make: { name: string };
  model: { name: string };
  year: number;
  trim?: { name: string };
  variant?: { name: string };
  markets?: string[];
  charge_ports?: { connector: string }[];
  charging?: { ac?: { max_power_kw?: number } };
}

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

/** Read the pinned release from the cache, downloading it the first time. Throws if the file is not the pinned one. */
export async function loadEvData(): Promise<EvDataVehicle[]> {
  let buf: Buffer;
  if (fs.existsSync(EV_DATA_CACHE)) {
    buf = fs.readFileSync(EV_DATA_CACHE);
  } else {
    const res = await fetch(EV_DATA_URL);
    if (!res.ok) throw new Error(`Could not download Open EV Data ${EV_DATA_VERSION} (HTTP ${res.status}).`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  if (sha256(buf) !== EV_DATA_SHA256) {
    throw new Error(`Open EV Data ${EV_DATA_VERSION} does not match its pinned SHA-256. Delete ${path.relative(REPO_ROOT, EV_DATA_CACHE)} and run again.`);
  }
  if (!fs.existsSync(EV_DATA_CACHE)) {
    fs.mkdirSync(path.dirname(EV_DATA_CACHE), { recursive: true });
    fs.writeFileSync(EV_DATA_CACHE, buf);
  }
  const json = JSON.parse(buf.toString('utf8')) as { vehicles?: EvDataVehicle[] };
  if (!Array.isArray(json.vehicles)) throw new Error('Open EV Data has no vehicles array.');
  return json.vehicles;
}

/**
 * The plug a US driver uses on a home Level 2 charger. NACS cars use NACS. Everything else charges from J1772 in the
 * US: CCS1 and Type 1 cars directly, CHAdeMO cars through their Type 1 AC inlet, and US-market rows tagged with the
 * European CCS2 or Type 2 (a dataset quirk, for example the IONIQ 5) are J1772 cars in the US too.
 */
export function usPlug(ports: { connector: string }[] | undefined): Plug | null {
  const kinds = (ports ?? []).map((p) => p.connector.toLowerCase());
  if (kinds.length === 0) return null;
  if (kinds.includes('nacs')) return 'NACS';
  return kinds.some((k) => ['ccs1', 'type1', 'chademo', 'ccs2', 'type2'].includes(k)) ? 'J1772' : null;
}

/** Same range the API accepts for a car typed in by hand (save-me) and the pricing domain (Property 1). */
const AC_KW_MIN = 3.0;
const AC_KW_MAX = 22.0;

export function toEvSpecItems(vehicles: EvDataVehicle[]): { items: EVSpecItem[]; skipped: { code: string; reason: string }[] } {
  const items: EVSpecItem[] = [];
  const skipped: { code: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const v of vehicles) {
    if (!(v.markets ?? []).includes('US')) continue;
    const code = v.unique_code;
    const kw = v.charging?.ac?.max_power_kw;
    const plug = usPlug(v.charge_ports);
    if (!code || seen.has(code)) skipped.push({ code, reason: 'missing or duplicate id' });
    else if (typeof kw !== 'number' || !Number.isFinite(kw)) skipped.push({ code, reason: 'no AC charging speed' });
    else if (kw < AC_KW_MIN || kw > AC_KW_MAX) skipped.push({ code, reason: `AC speed outside ${AC_KW_MIN} to ${AC_KW_MAX} kW` });
    else if (!plug) skipped.push({ code, reason: 'no plug usable in the US' });
    else {
      seen.add(code);
      items.push({
        evId: code,
        make: v.make.name.trim(),
        model: v.model.name.trim(),
        year: v.year,
        trim: v.trim?.name?.trim() || undefined,
        variant: v.variant?.name?.trim() || undefined,
        max_ac_kw: kw,
        plug_type: plug,
        source: 'OPEN_EV_DATA',
      });
    }
  }
  return { items, skipped };
}
