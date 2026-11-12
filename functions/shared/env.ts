/** Environment variables set by the CDK stacks (infra/lib). Read lazily so a missing one fails the request, not the import. */
export type EnvName = 'PROFILES_TABLE' | 'LISTINGS_TABLE' | 'BOOKINGS_TABLE' | 'EVSPECS_TABLE' | 'PHOTO_BUCKET' | 'EIA_KEY_PARAM' | 'MBTA_KEY_PARAM';

export function env(name: EnvName): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const tables = {
  get profiles() {
    return env('PROFILES_TABLE');
  },
  get listings() {
    return env('LISTINGS_TABLE');
  },
  get bookings() {
    return env('BOOKINGS_TABLE');
  },
  get evSpecs() {
    return env('EVSPECS_TABLE');
  },
};

/** Name of the sparse index on Listings that holds only active listings (infra/lib/data-stack.ts). */
export const ACTIVE_LISTINGS_INDEX = 'active';
export const ACTIVE_PARTITION = 'ACTIVE';
