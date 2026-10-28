import type { BackendConfig } from '../lib/backendConfig';

/**
 * Amazon Cognito user-pool adapter for the app's own sign-up and sign-in pages. It calls the public user-pool API
 * (the same JSON-over-HTTPS calls the AWS SDK makes) with plain fetch: these operations need no AWS credentials,
 * only the public app client id, so no SDK is bundled. Passwords go to Cognito over TLS and are never stored.
 * Typed results, never throws, 10 s budget per call. Works in the browser and in Node (scripts/smoke-test.ts).
 */

export const COGNITO_TIMEOUT_MS = 10_000;

export type CognitoErrorCode =
  | 'EXISTS'
  | 'INVALID_PASSWORD'
  | 'INVALID_PARAMETER'
  | 'CODE_MISMATCH'
  | 'CODE_EXPIRED'
  | 'NOT_AUTHORIZED'
  | 'NOT_CONFIRMED'
  | 'CHALLENGE'
  | 'THROTTLED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'UNKNOWN';

export type CognitoFailure = { ok: false; code: CognitoErrorCode; message: string };
export type CognitoResult<T> = { ok: true; value: T } | CognitoFailure;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires */
  expiresAt: number;
}

type CognitoConfig = Pick<BackendConfig, 'region' | 'userPoolClientId'>;

const MESSAGES: Record<CognitoErrorCode, string> = {
  EXISTS: 'An account with this email already exists. Sign in instead.',
  INVALID_PASSWORD: 'That password doesn’t meet the rules.',
  INVALID_PARAMETER: 'Some details weren’t accepted. Check them and try again.',
  CODE_MISMATCH: 'That code doesn’t match. Check the email and try again.',
  CODE_EXPIRED: 'That code has expired. Send a new one.',
  NOT_AUTHORIZED: 'That email and password don’t match an account.',
  NOT_CONFIRMED: 'Confirm your email first. Enter the code we sent you.',
  CHALLENGE: 'This account needs an extra sign-in step the app doesn’t support yet.',
  THROTTLED: 'Too many attempts. Wait a minute and try again.',
  TIMEOUT: 'Sign-in took too long. Check your connection and try again.',
  NETWORK: 'Couldn’t reach the sign-in service. Check your connection.',
  UNKNOWN: 'Something went wrong with sign-in. Try again.',
};

const CODES: Record<string, CognitoErrorCode> = {
  UsernameExistsException: 'EXISTS',
  AliasExistsException: 'EXISTS',
  InvalidPasswordException: 'INVALID_PASSWORD',
  InvalidParameterException: 'INVALID_PARAMETER',
  CodeMismatchException: 'CODE_MISMATCH',
  ExpiredCodeException: 'CODE_EXPIRED',
  NotAuthorizedException: 'NOT_AUTHORIZED',
  UserNotFoundException: 'NOT_AUTHORIZED',
  UserNotConfirmedException: 'NOT_CONFIRMED',
  LimitExceededException: 'THROTTLED',
  TooManyRequestsException: 'THROTTLED',
  TooManyFailedAttemptsException: 'THROTTLED',
};

export const failure = (code: CognitoErrorCode): CognitoFailure => ({ ok: false, code, message: MESSAGES[code] });

export interface CognitoDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

async function call<T>(cfg: CognitoConfig, operation: string, body: Record<string, unknown>, deps: CognitoDeps = {}): Promise<CognitoResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? COGNITO_TIMEOUT_MS);
  try {
    const res = await (deps.fetchImpl ?? fetch)(`https://cognito-idp.${cfg.region}.amazonaws.com/`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `AWSCognitoIdentityProviderService.${operation}` },
      body: JSON.stringify({ ClientId: cfg.userPoolClientId, ...body }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, value: json as T };
    // "__type" is "NotAuthorizedException" or "com.amazonaws...#NotAuthorizedException"
    const type = String(json.__type ?? '').split('#').pop() ?? '';
    return failure(CODES[type] ?? (res.status === 429 ? 'THROTTLED' : 'UNKNOWN'));
  } catch {
    return failure(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
}

interface AuthResultJson {
  AuthenticationResult?: { AccessToken?: string; RefreshToken?: string; ExpiresIn?: number };
  ChallengeName?: string;
}

function toTokens(json: AuthResultJson, now: number, keepRefresh?: string): CognitoResult<Tokens> {
  if (json.ChallengeName) return failure('CHALLENGE');
  const r = json.AuthenticationResult;
  const refreshToken = r?.RefreshToken ?? keepRefresh;
  if (!r?.AccessToken || !refreshToken) return failure('UNKNOWN');
  return { ok: true, value: { accessToken: r.AccessToken, refreshToken, expiresAt: now + (r.ExpiresIn ?? 3600) * 1000 } };
}

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  /** "+1" and 10 digits (lib/accountRules.ts toE164Us) */
  phoneE164: string;
}

/** Create the account. Cognito emails a confirmation code; the profile is created once it is confirmed. */
export async function signUp(cfg: CognitoConfig, input: SignUpInput, deps?: CognitoDeps): Promise<CognitoResult<{ confirmed: boolean }>> {
  const r = await call<{ UserConfirmed?: boolean }>(cfg, 'SignUp', {
    Username: input.email.trim().toLowerCase(),
    Password: input.password,
    UserAttributes: [
      { Name: 'email', Value: input.email.trim().toLowerCase() },
      { Name: 'name', Value: input.name.trim() },
      { Name: 'phone_number', Value: input.phoneE164 },
    ],
  }, deps);
  return r.ok ? { ok: true, value: { confirmed: r.value.UserConfirmed === true } } : r;
}

export async function confirmSignUp(cfg: CognitoConfig, email: string, code: string, deps?: CognitoDeps): Promise<CognitoResult<null>> {
  const r = await call(cfg, 'ConfirmSignUp', { Username: email.trim().toLowerCase(), ConfirmationCode: code.trim() }, deps);
  return r.ok ? { ok: true, value: null } : r;
}

export async function resendConfirmationCode(cfg: CognitoConfig, email: string, deps?: CognitoDeps): Promise<CognitoResult<null>> {
  const r = await call(cfg, 'ResendConfirmationCode', { Username: email.trim().toLowerCase() }, deps);
  return r.ok ? { ok: true, value: null } : r;
}

export async function signInWithPassword(cfg: CognitoConfig, email: string, password: string, deps: CognitoDeps = {}): Promise<CognitoResult<Tokens>> {
  const r = await call<AuthResultJson>(cfg, 'InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: email.trim().toLowerCase(), PASSWORD: password },
  }, deps);
  return r.ok ? toTokens(r.value, (deps.now ?? Date.now)()) : r;
}

/** New tokens from a refresh token. The pool rotates refresh tokens, so the result carries a new one. */
export async function refreshTokens(cfg: CognitoConfig, refreshToken: string, deps: CognitoDeps = {}): Promise<CognitoResult<Tokens>> {
  const r = await call<AuthResultJson>(cfg, 'GetTokensFromRefreshToken', { RefreshToken: refreshToken }, deps);
  return r.ok ? toTokens(r.value, (deps.now ?? Date.now)(), refreshToken) : r;
}

/** Sign-out: revoke the refresh token so it (and the access tokens it issued) stop working. */
export async function revokeToken(cfg: CognitoConfig, refreshToken: string, deps?: CognitoDeps): Promise<CognitoResult<null>> {
  const r = await call(cfg, 'RevokeToken', { Token: refreshToken }, deps);
  return r.ok ? { ok: true, value: null } : r;
}
