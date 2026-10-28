import {
  confirmSignUp,
  refreshTokens,
  resendConfirmationCode,
  revokeToken,
  signInWithPassword,
  signUp,
  type CognitoDeps,
  type CognitoResult,
  type SignUpInput,
  type Tokens,
} from '../adapters/cognito';
import { createApiClient, type DwellApi } from '../adapters/dwellApi';
import type { BackendConfig } from '../lib/backendConfig';

/**
 * The signed-in session in backend mode: Cognito tokens plus the API client that uses them.
 *
 * Token storage (open decision in tech.md, chosen for the demo): memory plus sessionStorage. A reload keeps the
 * session, a new tab or a closed browser signs out. sessionStorage is readable by any script on the page, so the
 * refresh token is short-lived (7 days), rotates on every refresh, and is revoked on sign-out.
 */

export interface StoredSession extends Tokens {
  email: string;
}

export const SESSION_KEY = 'dwell.session.v1';
/** Refresh a little before the access token expires. */
const REFRESH_MARGIN_MS = 60_000;

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function readSession(storage: KeyValueStore | null): StoredSession | null {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<StoredSession>) : null;
    if (!v || typeof v.email !== 'string' || typeof v.accessToken !== 'string' || typeof v.refreshToken !== 'string' || typeof v.expiresAt !== 'number') return null;
    return v as StoredSession;
  } catch {
    return null;
  }
}

export class DwellBackend {
  readonly api: DwellApi;
  private session: StoredSession | null;
  private renewing: Promise<string | null> | null = null;
  private readonly now: () => number;

  constructor(
    readonly config: BackendConfig,
    private readonly storage: KeyValueStore | null,
    private readonly deps: CognitoDeps = {},
  ) {
    this.now = deps.now ?? Date.now;
    this.session = readSession(storage);
    this.api = createApiClient(config.apiUrl, { accessToken: () => this.accessToken(), renew: () => this.renew() }, { fetchImpl: deps.fetchImpl });
  }

  get signedIn(): boolean {
    return this.session !== null;
  }

  get email(): string | null {
    return this.session?.email ?? null;
  }

  signUp(input: SignUpInput): Promise<CognitoResult<{ confirmed: boolean }>> {
    return signUp(this.config, input, this.deps);
  }

  confirm(email: string, code: string): Promise<CognitoResult<null>> {
    return confirmSignUp(this.config, email, code, this.deps);
  }

  resendCode(email: string): Promise<CognitoResult<null>> {
    return resendConfirmationCode(this.config, email, this.deps);
  }

  async signIn(email: string, password: string): Promise<CognitoResult<null>> {
    const r = await signInWithPassword(this.config, email, password, this.deps);
    if (!r.ok) return r;
    this.save({ ...r.value, email: email.trim().toLowerCase() });
    return { ok: true, value: null };
  }

  /** Forget the session here first, then revoke the refresh token at Cognito (best effort). */
  async signOut(): Promise<void> {
    const s = this.session;
    this.save(null);
    if (s) await revokeToken(this.config, s.refreshToken, this.deps);
  }

  private save(s: StoredSession | null): void {
    this.session = s;
    try {
      if (s) this.storage?.setItem(SESSION_KEY, JSON.stringify(s));
      else this.storage?.removeItem(SESSION_KEY);
    } catch {
      // Storage blocked: the session still works in memory for this page.
    }
  }

  private async accessToken(): Promise<string | null> {
    const s = this.session;
    if (!s) return null;
    if (s.expiresAt - this.now() > REFRESH_MARGIN_MS) return s.accessToken;
    return this.renew();
  }

  /** One refresh at a time, shared by concurrent callers (rotation makes the old refresh token single-use). */
  private renew(): Promise<string | null> {
    if (this.renewing) return this.renewing;
    const s = this.session;
    if (!s) return Promise.resolve(null);
    this.renewing = refreshTokens(this.config, s.refreshToken, this.deps)
      .then((r) => {
        if (!r.ok) {
          // A network blip keeps the session for the next try; a refused token ends it.
          if (r.code !== 'NETWORK' && r.code !== 'TIMEOUT') this.save(null);
          return null;
        }
        this.save({ ...r.value, email: s.email });
        return r.value.accessToken;
      })
      .finally(() => {
        this.renewing = null;
      });
    return this.renewing;
  }
}
