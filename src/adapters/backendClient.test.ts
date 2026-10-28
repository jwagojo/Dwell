import { describe, expect, it, vi } from 'vitest';
import { parseBackendConfig } from '../lib/backendConfig';
import { DwellBackend, SESSION_KEY } from '../state/backend';
import { refreshTokens, signInWithPassword, signUp } from './cognito';
import { createApiClient } from './dwellApi';

const CFG = { apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/', region: 'us-east-1', userPoolId: 'us-east-1_AbC123', userPoolClientId: '1a2b3c4d5e6f7g8h9i0j' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe('parseBackendConfig', () => {
  it('accepts the deploy outputs and normalizes the API URL', () => {
    expect(parseBackendConfig({ ...CFG, apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com' })?.apiUrl).toBe(CFG.apiUrl);
  });
  it.each([
    ['http on a public host', { ...CFG, apiUrl: 'http://example.com/' }],
    ['a pool from another region', { ...CFG, userPoolId: 'eu-west-1_AbC123' }],
    ['a missing client id', { ...CFG, userPoolClientId: undefined }],
    ['an HTML page', '<!doctype html>'],
  ])('rejects %s', (_n, v) => expect(parseBackendConfig(v)).toBeNull());
});

describe('Cognito adapter', () => {
  it('signs up with the E.164 phone and lower-cased email, using only the public client id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { UserConfirmed: false, UserSub: 'x' }));
    const r = await signUp(CFG, { email: ' Dana@Example.com ', password: 'Abcdef1!', name: 'Dana', phoneE164: '+16175550100' }, { fetchImpl });
    expect(r).toEqual({ ok: true, value: { confirmed: false } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://cognito-idp.us-east-1.amazonaws.com/');
    expect(init.headers['x-amz-target']).toBe('AWSCognitoIdentityProviderService.SignUp');
    expect(JSON.parse(init.body)).toMatchObject({ ClientId: CFG.userPoolClientId, Username: 'dana@example.com', UserAttributes: expect.arrayContaining([{ Name: 'phone_number', Value: '+16175550100' }]) });
  });

  it('maps Cognito errors to stable codes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(400, { __type: 'UserNotConfirmedException', message: 'User is not confirmed.' }));
    expect(await signInWithPassword(CFG, 'a@b.co', 'x', { fetchImpl })).toMatchObject({ ok: false, code: 'NOT_CONFIRMED' });
    fetchImpl.mockResolvedValue(json(400, { __type: 'com.amazonaws#UsernameExistsException' }));
    expect(await signUp(CFG, { email: 'a@b.co', password: 'x', name: 'A', phoneE164: '+16175550100' }, { fetchImpl })).toMatchObject({ code: 'EXISTS' });
    fetchImpl.mockRejectedValue(new TypeError('offline'));
    expect(await signInWithPassword(CFG, 'a@b.co', 'x', { fetchImpl })).toMatchObject({ code: 'NETWORK' });
  });

  it('keeps the old refresh token when Cognito does not rotate it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { AuthenticationResult: { AccessToken: 'a2', ExpiresIn: 3600 } }));
    const r = await refreshTokens(CFG, 'r1', { fetchImpl, now: () => 1000 });
    expect(r).toEqual({ ok: true, value: { accessToken: 'a2', refreshToken: 'r1', expiresAt: 3_601_000 } });
    expect(fetchImpl.mock.calls[0][1].headers['x-amz-target']).toBe('AWSCognitoIdentityProviderService.GetTokensFromRefreshToken');
  });
});

describe('API client', () => {
  it('sends the bearer token and returns the API error code and details', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(409, { error: { code: 'TOO_FAR', message: 'Too far', metersShown: 51 } }));
    const api = createApiClient(CFG.apiUrl, { accessToken: async () => 't1', renew: async () => null }, { fetchImpl });
    const r = await api.pickup('b-1', { lat: 42, lng: -71 });
    expect(r).toMatchObject({ ok: false, status: 409, code: 'TOO_FAR', details: { metersShown: 51 } });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${CFG.apiUrl}bookings/b-1/pickup`);
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer t1');
  });

  it('retries once with a renewed token after a 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(401, { message: 'Unauthorized' })).mockResolvedValueOnce(json(200, { cars: [] }));
    const renew = vi.fn().mockResolvedValue('t2');
    const api = createApiClient(CFG.apiUrl, { accessToken: async () => 't1', renew }, { fetchImpl });
    expect(await api.listCars()).toMatchObject({ ok: true, data: { cars: [] } });
    expect(fetchImpl.mock.calls[1][1].headers.authorization).toBe('Bearer t2');
  });

  it('does not call the API when signed out', async () => {
    const fetchImpl = vi.fn();
    const api = createApiClient(CFG.apiUrl, { accessToken: async () => null, renew: async () => null }, { fetchImpl });
    expect(await api.getMe()).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('DwellBackend session', () => {
  it('keeps the session in storage, refreshes before expiry, and saves the rotated token', async () => {
    let now = 0;
    const storage = memoryStorage();
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = (init?.headers as Record<string, string>)?.['x-amz-target'] ?? '';
      if (target.endsWith('InitiateAuth')) return json(200, { AuthenticationResult: { AccessToken: 'a1', RefreshToken: 'r1', ExpiresIn: 3600 } });
      if (target.endsWith('GetTokensFromRefreshToken')) return json(200, { AuthenticationResult: { AccessToken: 'a2', RefreshToken: 'r2', ExpiresIn: 3600 } });
      if (target.endsWith('RevokeToken')) return json(200, {});
      return json(200, { cars: [], auth: (init?.headers as Record<string, string>).authorization, url: String(url) });
    });
    const backend = new DwellBackend(CFG, storage, { fetchImpl: fetchImpl as typeof fetch, now: () => now });
    expect((await backend.signIn('Dana@Example.com', 'pw')).ok).toBe(true);
    expect(JSON.parse(storage.getItem(SESSION_KEY)!)).toMatchObject({ email: 'dana@example.com', refreshToken: 'r1' });

    now = 3_600_000 - 30_000; // 30 s before expiry
    const r = await backend.api.listCars();
    expect(r.ok && (r.data as unknown as { auth: string }).auth).toBe('Bearer a2');
    expect(JSON.parse(storage.getItem(SESSION_KEY)!).refreshToken).toBe('r2');

    // A new page load restores it; sign-out clears it and revokes the latest refresh token.
    const reloaded = new DwellBackend(CFG, storage, { fetchImpl: fetchImpl as typeof fetch, now: () => now });
    expect(reloaded.signedIn).toBe(true);
    await reloaded.signOut();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
    expect(JSON.parse(String(fetchImpl.mock.calls.at(-1)![1]!.body))).toMatchObject({ Token: 'r2' });
  });

  it('ends the session when Cognito refuses the refresh token', async () => {
    const storage = memoryStorage();
    storage.setItem(SESSION_KEY, JSON.stringify({ email: 'a@b.co', accessToken: 'a', refreshToken: 'r', expiresAt: 0 }));
    const fetchImpl = vi.fn().mockResolvedValue(json(400, { __type: 'NotAuthorizedException' }));
    const backend = new DwellBackend(CFG, storage, { fetchImpl, now: () => 1 });
    expect(await backend.api.getMe()).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(backend.signedIn).toBe(false);
  });
});
