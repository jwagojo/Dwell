/**
 * Where "host a charger" leads. One account does both jobs, so this depends only on what the account has.
 * - Not signed in: create the account first. `next=host` sends them on to the listing steps afterwards.
 * - Signed in, nothing listed yet: the listing steps.
 * - Signed in with a listing: the host dashboard.
 */
export const SIGNUP_PATH = '/signup';
export const SIGNIN_PATH = '/signin';
export const SIGNUP_FOR_HOSTING_PATH = '/signup?next=host';
export const NEW_LISTING_PATH = '/host/new';
export const HOST_HOME_PATH = '/host';

export function hostEntryPath(signedIn: boolean, hasListing: boolean): string {
  if (!signedIn) return SIGNUP_FOR_HOSTING_PATH;
  return hasListing ? HOST_HOME_PATH : NEW_LISTING_PATH;
}
