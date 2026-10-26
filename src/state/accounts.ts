import type { Booking } from '../types/booking';
import type { Car, Listing } from '../types/listing';
import type { Persisted, User } from './persisted';

/**
 * PROTOTYPE ACCOUNTS. This lets someone sign out and sign back in on the same browser. It is NOT real security:
 * everything lives in this browser's localStorage, where anyone with access to the browser can read it. The
 * password is stored only as a salted PBKDF2 hash, never as typed. Amazon Cognito replaces all of this
 * (tasks.md 13.1). Nothing here ever throws; callers get a typed result.
 */

/** What belongs to one account and is kept while that person is signed out. */
export interface AccountData {
  user: User;
  car: Car | null;
  hostListing: Listing | null;
  booking: Booking | null;
}

interface StoredAccount {
  /** Lower-cased and trimmed. This is the sign-in name. */
  email: string;
  salt: string;
  hash: string;
  iterations: number;
  data: AccountData;
}

export const ACCOUNTS_KEY = 'dwell.prototype.accounts.v1';
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/* ---------- storage ---------- */

function loadAccounts(storage: KeyValueStore): StoredAccount[] {
  try {
    const raw = storage.getItem(ACCOUNTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is StoredAccount =>
        typeof a === 'object' && a !== null && typeof a.email === 'string' && typeof a.salt === 'string' && typeof a.hash === 'string' && typeof a.iterations === 'number' && typeof a.data === 'object' && a.data !== null,
    );
  } catch {
    return [];
  }
}

function saveAccounts(storage: KeyValueStore, accounts: StoredAccount[]): boolean {
  try {
    storage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    return true;
  } catch {
    return false; // storage full or blocked
  }
}

/* ---------- hashing ---------- */

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** PBKDF2-SHA-256 of the password with the given salt. Needs a secure context (https or localhost). */
async function hashPassword(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, HASH_BITS);
  return toBase64(new Uint8Array(bits));
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const hasCrypto = () => typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';

/* ---------- operations ---------- */

export type RegisterResult = { ok: true } | { ok: false; reason: 'EXISTS' | 'NO_CRYPTO' | 'STORAGE' };

/** Create an account. The email must not already be registered on this browser. */
export async function registerAccount(storage: KeyValueStore, password: string, data: AccountData): Promise<RegisterResult> {
  if (!hasCrypto()) return { ok: false, reason: 'NO_CRYPTO' };
  const email = normalizeEmail(data.user.email);
  const accounts = loadAccounts(storage);
  if (accounts.some((a) => a.email === email)) return { ok: false, reason: 'EXISTS' };
  try {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const hash = await hashPassword(password, salt, PBKDF2_ITERATIONS);
    const next: StoredAccount = { email, salt: toBase64(salt), hash, iterations: PBKDF2_ITERATIONS, data };
    return saveAccounts(storage, [...accounts, next]) ? { ok: true } : { ok: false, reason: 'STORAGE' };
  } catch {
    return { ok: false, reason: 'NO_CRYPTO' };
  }
}

export type AuthResult = { ok: true; data: AccountData } | { ok: false; reason: 'INVALID' | 'NO_CRYPTO' };

/**
 * Check an email and password. A wrong password and an unknown email give the same answer, so the page
 * never reveals which emails are registered.
 */
export async function authenticate(storage: KeyValueStore, emailInput: string, password: string): Promise<AuthResult> {
  if (!hasCrypto()) return { ok: false, reason: 'NO_CRYPTO' };
  const email = normalizeEmail(emailInput);
  const account = loadAccounts(storage).find((a) => a.email === email);
  try {
    // Hash even for an unknown email so both cases take about the same time.
    const salt = account ? fromBase64(account.salt) : crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const hash = await hashPassword(password, salt, account?.iterations ?? PBKDF2_ITERATIONS);
    return account && sameHash(hash, account.hash) ? { ok: true, data: account.data } : { ok: false, reason: 'INVALID' };
  } catch {
    return { ok: false, reason: 'NO_CRYPTO' };
  }
}

export type StashResult = { ok: true } | { ok: false; reason: 'NO_USER' | 'NOT_REGISTERED' | 'STORAGE' };

/**
 * Keep an account's data while its owner is signed out, so signing back in restores it.
 * Fails with a reason instead of quietly doing nothing:
 * - NO_USER: nobody is signed in.
 * - NOT_REGISTERED: the account was made before sign-in existed, so it has no password and nothing to keep it under.
 * - STORAGE: the browser refused the write, usually because storage is full (listing photos are large).
 */
export function stashAccount(storage: KeyValueStore, state: Pick<Persisted, 'user' | 'car' | 'hostListing' | 'booking'>): StashResult {
  if (!state.user) return { ok: false, reason: 'NO_USER' };
  const email = normalizeEmail(state.user.email);
  const accounts = loadAccounts(storage);
  const i = accounts.findIndex((a) => a.email === email);
  if (i === -1) return { ok: false, reason: 'NOT_REGISTERED' };
  const data: AccountData = { user: state.user, car: state.car, hostListing: state.hostListing, booking: state.booking };
  accounts[i] = { ...accounts[i], data };
  return saveAccounts(storage, accounts) ? { ok: true } : { ok: false, reason: 'STORAGE' };
}
