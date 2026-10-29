import fs from 'node:fs';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { EV_MODELS } from '../src/data/evFallbackSeed';
import { SEEDED_LISTINGS } from './seed-data/listings';
import { validateListingInput } from '../src/features/host/validateListing';
import type { Listing } from '../src/types/listing';
import type { EVSpecItem, ListingItem } from '../functions/shared/items';
import { listingItemFromInput } from '../functions/shared/mappers';
import { EV_DATA_VERSION, loadEvData, toEvSpecItems } from './ev-data';
import { hasFlag, readOutputs, REPO_ROOT, stageFromArgs } from './outputs';

/**
 * Seed a deployed stage with the sample data (tasks.md 12.2, 17.1):
 *   npm run seed -- --stage dev-wesley            write
 *   npm run seed -- --stage dev-wesley --dry-run  validate only, no AWS calls
 *
 * - EVSpecs: the US cars from Open EV Data (scripts/ev-data.ts, pinned release, downloaded once). The 8 seeded
 *   fallback cars are not written: the API serves them from code (src/data/evFallbackSeed.ts).
 * - Listings: the 34 sample listings (scripts/seed-data/listings.ts) under one placeholder host that has no account, so
 *   nobody can edit them. Every row goes through the same validation the API uses (photos aside).
 * - Photos: only the owned photos in scripts/seed-data/photos/ are uploaded. The hotlinked Zillow and Redfin images are not
 *   copied into the bucket; those listings show the labeled placeholder.
 * Rows are written by fixed id, so running it again updates them instead of adding copies.
 */

export const SEED_HOST_ID = 'seed-host';
/** Approximate ZIPs for the four Boston samples, which have no exact address. */
const SAMPLE_ZIPS: Record<string, string> = { 'Jamaica Plain': '02130', Roslindale: '02131', 'West Roxbury': '02132', Dorchester: '02125' };
const SEED_TIME = '2026-10-26T00:00:00.000Z';

/** Write rows 25 at a time (the BatchWrite limit), retrying anything DynamoDB hands back unprocessed. */
async function batchPut(ddb: DynamoDBDocumentClient, table: string, rows: EVSpecItem[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 25) {
    let pending = rows.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } }));
    for (let attempt = 0; pending.length > 0; attempt++) {
      if (attempt > 5) throw new Error(`DynamoDB kept ${pending.length} car rows unprocessed. Run the seed again.`);
      if (attempt > 0) await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [table]: pending } }));
      pending = (res.UnprocessedItems?.[table] ?? []) as typeof pending;
    }
  }
}

/** Owned photos (served from public/) that the seed uploads; everything else is a third-party URL and is skipped. */
const ownedPhotos = (l: Listing) => l.photos.filter((p) => p.startsWith('/listings/'));
export const seedPhotoKey = (listingId: string, publicPath: string) => `media/listings/${listingId}/${path.basename(publicPath)}`;

export function listingItems(): { items: ListingItem[]; problems: string[] } {
  const items: ListingItem[] = [];
  const problems: string[] = [];
  for (const l of SEEDED_LISTINGS) {
    const pa = l.privateAddress;
    const photoKeys = ownedPhotos(l).map((p) => seedPhotoKey(l.id, p));
    const v = validateListingInput({
      title: l.title,
      street: l.street,
      neighborhood: l.neighborhood,
      address: pa ? { line: pa.line, unit: pa.unit ?? null, city: pa.city, zip: pa.zip } : { line: `${l.street} (approximate)`, unit: null, city: 'Boston', zip: SAMPLE_ZIPS[l.neighborhood] ?? '' },
      lat: l.lat,
      lng: l.lng,
      spotType: l.spotType,
      spots: l.spots,
      rightToList: true,
      level: l.level,
      chargerKw: l.chargerKw,
      plug: l.plug,
      adapters: l.adapters,
      outdoorOutlet: l.level === 'L1',
      solarKw: l.solarKw,
      rate: l.rate,
      rateSource: l.rateSource ?? (l.rate === 0.3 ? 'FALLBACK' : 'HOST'),
      rateDataMonth: l.rateDataMonth ?? null,
      earningsHr: l.earningsHr,
      windows: l.windows,
      instructions: l.instructions,
      // Seeded listings may have no photo (placeholder); validate the rest with a stand-in.
      photoKeys: photoKeys.length > 0 ? photoKeys : ['seed-placeholder'],
      termsAccepted: true,
    });
    if (!v.ok) {
      problems.push(`${l.id}: ${Object.entries(v.errors).map(([f, m]) => `${f} (${m})`).join(', ')}`);
      continue;
    }
    items.push(listingItemFromInput({ ...v.value, photoKeys }, { listingId: l.id, hostId: SEED_HOST_ID, hostName: l.hostName }, SEED_TIME, SEED_TIME));
  }
  return { items, problems };
}

async function main() {
  const stage = stageFromArgs();
  const dryRun = hasFlag('--dry-run');
  const { items: cars, skipped } = toEvSpecItems(await loadEvData());
  if (skipped.length > 0) console.log(`Open EV Data ${EV_DATA_VERSION}: skipped ${skipped.length} US vehicles (${[...new Set(skipped.map((s) => s.reason))].join('; ')}).`);
  const { items, problems } = listingItems();
  if (problems.length > 0) {
    console.error(`These listings fail validation and were not seeded:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  }
  const photos = SEEDED_LISTINGS.flatMap((l) => ownedPhotos(l).map((p) => ({ key: seedPhotoKey(l.id, p), file: path.join(REPO_ROOT, 'scripts', 'seed-data', 'photos', p.replace(/^\/listings\//, '')) })));
  if (dryRun) {
    console.log(`Dry run for stage ${stage}: ${cars.length} cars, ${items.length} listings and ${photos.length} photos are valid. Nothing was written.`);
    return;
  }

  const out = readOutputs(stage);
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: out.region }), { marshallOptions: { removeUndefinedValues: true } });
  const s3 = new S3Client({ region: out.region });

  for (const p of photos) {
    const type = p.file.endsWith('.png') ? 'image/png' : 'image/jpeg';
    await s3.send(new PutObjectCommand({ Bucket: out.photoBucket, Key: p.key, Body: fs.readFileSync(p.file), ContentType: type }));
  }
  // The first seed wrote the 8 fallback cars as rows; remove them so the API serves them only where the dataset has no match.
  for (const c of EV_MODELS) await ddb.send(new DeleteCommand({ TableName: out.tables.evSpecs, Key: { evId: c.id } }));
  await batchPut(ddb, out.tables.evSpecs, cars);
  for (const item of items) await ddb.send(new PutCommand({ TableName: out.tables.listings, Item: item }));
  console.log(`Seeded stage ${stage}: ${cars.length} cars, ${items.length} listings, ${photos.length} photos.`);
}

// Run only as a script, not when a test imports the helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((err: Error) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
