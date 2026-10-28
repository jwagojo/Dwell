import fs from 'node:fs';
import path from 'node:path';
import { parseBackendConfig } from '../src/lib/backendConfig';
import { readOutputs, REPO_ROOT, stageFromArgs } from './outputs';

/**
 * Write public/config.json (git-ignored) so `npm run dev` talks to a deployed stage.
 *   npm run backend:config -- --stage dev-wesley
 * Delete public/config.json to go back to the localStorage prototype.
 * The file holds no secrets: the API URL and the public Cognito ids.
 */
const out = readOutputs(stageFromArgs());
const config = parseBackendConfig({ apiUrl: out.apiUrl, region: out.region, userPoolId: out.userPoolId, userPoolClientId: out.userPoolClientId });
if (!config) throw new Error('The stack outputs do not form a valid backend config.');
const file = path.join(REPO_ROOT, 'public', 'config.json');
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${path.relative(REPO_ROOT, file)} for stage ${out.stage}. Restart npm run dev to pick it up.`);
