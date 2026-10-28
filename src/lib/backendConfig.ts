/**
 * Where the app finds its backend. `/config.json` is written by `npm run backend:config` from the deploy outputs
 * (and later by the web stack, tasks.md 11.4). It holds no secrets: an API URL and public Cognito ids.
 * Without a valid file the app runs in prototype mode on localStorage, exactly as before.
 */
export interface BackendConfig {
  apiUrl: string;
  region: string;
  userPoolId: string;
  userPoolClientId: string;
}

export const CONFIG_PATH = '/config.json';
export const CONFIG_TIMEOUT_MS = 5_000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate untrusted JSON. The API must be https (http only for localhost). */
export function parseBackendConfig(json: unknown): BackendConfig | null {
  if (!isObj(json)) return null;
  const { apiUrl, region, userPoolId, userPoolClientId } = json;
  if (typeof apiUrl !== 'string' || typeof region !== 'string' || typeof userPoolId !== 'string' || typeof userPoolClientId !== 'string') return null;
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
  if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) return null;
  if (!new RegExp(`^${region}_[A-Za-z0-9]+$`).test(userPoolId)) return null;
  if (!/^[a-z0-9]{10,64}$/.test(userPoolClientId)) return null;
  return { apiUrl: url.href.endsWith('/') ? url.href : `${url.href}/`, region, userPoolId, userPoolClientId };
}

/** Load the config once at startup. Never throws: anything missing or invalid means prototype mode. */
export async function loadBackendConfig(fetchImpl: typeof fetch = fetch, timeoutMs = CONFIG_TIMEOUT_MS): Promise<BackendConfig | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(CONFIG_PATH, { headers: { accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
    if (!res.ok) return null;
    return parseBackendConfig(await res.json());
  } catch {
    return null; // missing file (the dev server may answer with index.html), timeout, or bad JSON
  } finally {
    clearTimeout(timer);
  }
}
