import { describe, expect, it } from 'vitest';
import { ACCOUNTS_KEY, authenticate, registerAccount, stashAccount, type AccountData } from './accounts';

const memory = (opts: { failWrites?: boolean } = {}) => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (opts.failWrites) throw new DOMException('quota', 'QuotaExceededError');
      m.set(k, v);
    },
    raw: m,
  };
};

const data = (email = 'dana@example.com'): AccountData => ({
  user: { name: 'Dana', email, phone: '6175550123' },
  car: null,
  hostListing: null,
  booking: null,
});

describe('stashAccount', () => {
  it('says why when nobody is signed in', () => {
    expect(stashAccount(memory(), { ...data(), user: null })).toEqual({ ok: false, reason: 'NO_USER' });
  });

  it('reports an account with no password on record instead of quietly dropping it', () => {
    expect(stashAccount(memory(), data())).toEqual({ ok: false, reason: 'NOT_REGISTERED' });
  });

  it('keeps the latest data for a registered account, matched by email in any case', async () => {
    const store = memory();
    await registerAccount(store, 'correct-horse-1', data());
    const car = { id: 'nissan-leaf', name: 'Nissan Leaf', maxAcKw: 6.6, plug: 'J1772' as const };
    const r = stashAccount(store, { ...data('  Dana@Example.COM '), car });
    expect(r).toEqual({ ok: true });
    const signedIn = await authenticate(store, 'dana@example.com', 'correct-horse-1');
    expect(signedIn.ok && signedIn.data.car?.name).toBe('Nissan Leaf');
  });

  it('reports a failed write (for example, full storage)', async () => {
    const good = memory();
    await registerAccount(good, 'correct-horse-1', data());
    const full = memory({ failWrites: true });
    full.raw.set(ACCOUNTS_KEY, good.raw.get(ACCOUNTS_KEY)!);
    expect(stashAccount(full, data())).toEqual({ ok: false, reason: 'STORAGE' });
  });
});

describe('registerAccount and authenticate', () => {
  it('never stores the password as typed, and rejects a wrong one', async () => {
    const store = memory();
    expect(await registerAccount(store, 'correct-horse-1', data())).toEqual({ ok: true });
    expect(store.raw.get(ACCOUNTS_KEY)).not.toContain('correct-horse-1');
    expect((await authenticate(store, 'dana@example.com', 'wrong-pass-1')).ok).toBe(false);
    expect((await authenticate(store, 'dana@example.com', 'correct-horse-1')).ok).toBe(true);
  });

  it('refuses a second account with the same email', async () => {
    const store = memory();
    await registerAccount(store, 'correct-horse-1', data());
    expect(await registerAccount(store, 'another-pass-1', data('DANA@example.com'))).toEqual({ ok: false, reason: 'EXISTS' });
  });
});
