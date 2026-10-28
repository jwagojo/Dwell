import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { confirmSignUp, signInWithPassword, signUp } from '../src/adapters/cognito';
import { createApiClient } from '../src/adapters/dwellApi';
import { readOutputs, stageFromArgs } from './outputs';

/**
 * End-to-end check of a deployed stage with a real Cognito account (tasks.md 11.5):
 *   npm run smoke -- --stage dev-wesley --email you+smoke1@example.com
 * It signs up the email (Cognito sends a code to it), asks for the code, signs in, and calls the API with and
 * without a token. Use an address you can read; plus-addressing gives a fresh one each run. The password is random
 * and never printed. Delete the test user afterwards if you like:
 *   aws cognito-idp admin-delete-user --user-pool-id <UserPoolId> --username <email>
 */

const argv = process.argv.slice(2);
const emailArg = argv[argv.indexOf('--email') + 1];

async function main() {
  const out = readOutputs(stageFromArgs());
  const cfg = { region: out.region, userPoolClientId: out.userPoolClientId };
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = argv.includes('--email') && emailArg ? emailArg : (await rl.question('Email to sign up (you will need its code): ')).trim();
  // Meets the pool policy: upper, lower, digit, symbol.
  const password = `Smoke-${randomBytes(9).toString('base64url')}-7a`;
  const results: { check: string; ok: boolean; detail: string }[] = [];
  const record = (check: string, ok: boolean, detail: string) => {
    results.push({ check, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${check}: ${detail}`);
  };

  const su = await signUp(cfg, { email, password, name: 'Smoke Test', phoneE164: '+16175550100' });
  record('Cognito sign-up', su.ok, su.ok ? 'code sent' : su.message);
  if (!su.ok) return rl.close();
  if (!su.value.confirmed) {
    const code = (await rl.question(`Code emailed to ${email}: `)).trim();
    const c = await confirmSignUp(cfg, email, code);
    record('Confirm email (creates the profile)', c.ok, c.ok ? 'confirmed' : c.message);
    if (!c.ok) return rl.close();
  }
  rl.close();

  const si = await signInWithPassword(cfg, email, password);
  record('Cognito sign-in', si.ok, si.ok ? 'got tokens' : si.message);
  if (!si.ok) return;
  const token = si.value.accessToken;
  const api = createApiClient(out.apiUrl, { accessToken: async () => token, renew: async () => null });

  const me = await api.getMe();
  record('GET /me', me.ok && me.data.user.email === email.toLowerCase(), me.ok ? `profile for ${me.data.user.name}, phone ${me.data.user.phone}` : `${me.status} ${me.code}`);
  const cars = await api.listCars();
  record('GET /cars', cars.ok && cars.data.cars.length >= 8, cars.ok ? `${cars.data.cars.length} cars` : `${cars.status} ${cars.code}`);
  const rate = await api.getRate();
  record('GET /rate', rate.ok, rate.ok ? `$${rate.data.rate.local_rate}/kWh from ${rate.data.rate.source}${rate.data.fallbackReason ? ` (${rate.data.fallbackReason})` : ''}` : `${rate.status} ${rate.code}`);
  const listings = await api.listListings();
  record('GET /listings', listings.ok, listings.ok ? `${listings.data.listings.length} active listings${listings.data.listings.length === 0 ? ' (run npm run seed)' : ''}` : `${listings.status} ${listings.code}`);
  const upload = await api.createUpload({ kind: 'listing' });
  record('POST /uploads', upload.ok && upload.data.upload.key.startsWith('media/listings/'), upload.ok ? upload.data.upload.key : `${upload.status} ${upload.code}`);

  const anonymous = await fetch(new URL('cars', out.apiUrl));
  record('No token is refused', anonymous.status === 401, `HTTP ${anonymous.status}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(failed === 0 ? `\nAll ${results.length} checks passed for stage ${out.stage}.` : `\n${failed} of ${results.length} checks failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
