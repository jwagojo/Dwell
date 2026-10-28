import fs from 'node:fs';
import path from 'node:path';
import { parseBackendConfig } from '../src/lib/backendConfig';
import { readOutputs, REPO_ROOT, stageFromArgs } from './outputs';

/**
 * Write public/config.json (git-ignored) so the app talks to a deployed stage. The file holds no secrets: the API
 * URL and the public Cognito ids. Delete it to go back to the localStorage prototype.
 *
 *   npm run backend:config -- --stage dev-wesley   from infra/cdk-outputs.json (local dev)
 *   npm run backend:config -- --from-env           from environment variables (the Amplify Hosting build):
 *     DWELL_API_URL, DWELL_REGION, DWELL_USER_POOL_ID, DWELL_USER_POOL_CLIENT_ID
 */
function fromEnv() {
  const names = ['DWELL_API_URL', 'DWELL_REGION', 'DWELL_USER_POOL_ID', 'DWELL_USER_POOL_CLIENT_ID'] as const;
  const missing = names.filter((n) => !process.env[n]?.trim());
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')}. Set them on the Amplify app (Hosting > Environment variables).`);
  return {
    source: 'environment variables',
    raw: {
      apiUrl: process.env.DWELL_API_URL!.trim(),
      region: process.env.DWELL_REGION!.trim(),
      userPoolId: process.env.DWELL_USER_POOL_ID!.trim(),
      userPoolClientId: process.env.DWELL_USER_POOL_CLIENT_ID!.trim(),
    },
  };
}

function fromOutputs() {
  const out = readOutputs(stageFromArgs());
  return { source: `stage ${out.stage}`, raw: { apiUrl: out.apiUrl, region: out.region, userPoolId: out.userPoolId, userPoolClientId: out.userPoolClientId } };
}

const { source, raw } = process.argv.includes('--from-env') ? fromEnv() : fromOutputs();
const config = parseBackendConfig(raw);
// Fail the build instead of shipping a site that silently falls back to the prototype.
if (!config) throw new Error(`The backend settings from ${source} are not valid (check the API URL, region and Cognito ids).`);
const file = path.join(REPO_ROOT, 'public', 'config.json');
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${path.relative(REPO_ROOT, file)} from ${source}.`);
