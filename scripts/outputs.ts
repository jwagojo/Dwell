import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Stack outputs for one stage, from infra/cdk-outputs.json (written by `npm run cdk:deploy`). Scripts never guess
 * table or bucket names, so they cannot write to the wrong stage.
 */

export const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const OUTPUTS_FILE = path.join(REPO_ROOT, 'infra', 'cdk-outputs.json');

export interface StageOutputs {
  stage: string;
  region: string;
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  photoBucket: string;
  tables: { profiles: string; listings: string; bookings: string; evSpecs: string };
}

/** `--stage dev-wesley`, else DWELL_STAGE, else the default in infra/cdk.json. */
export function stageFromArgs(argv = process.argv.slice(2)): string {
  const i = argv.indexOf('--stage');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  if (process.env.DWELL_STAGE) return process.env.DWELL_STAGE;
  const cdkJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'infra', 'cdk.json'), 'utf8')) as { context?: { stage?: string } };
  return cdkJson.context?.stage ?? 'dev';
}

export const hasFlag = (flag: string, argv = process.argv.slice(2)) => argv.includes(flag);

export function readOutputs(stage: string): StageOutputs {
  if (!fs.existsSync(OUTPUTS_FILE)) {
    throw new Error(`No ${path.relative(REPO_ROOT, OUTPUTS_FILE)}. Deploy first: npm run cdk:deploy -- -c stage=${stage}`);
  }
  const all = JSON.parse(fs.readFileSync(OUTPUTS_FILE, 'utf8')) as Record<string, Record<string, string>>;
  const data = all[`Dwell-${stage}-Data`];
  const api = all[`Dwell-${stage}-Api`];
  if (!data || !api) throw new Error(`cdk-outputs.json has no outputs for stage "${stage}". Deployed stages: ${Object.keys(all).join(', ') || 'none'}`);
  const need = (o: Record<string, string>, k: string) => {
    if (!o[k]) throw new Error(`Missing output ${k} for stage "${stage}". Redeploy with the current infra/.`);
    return o[k];
  };
  return {
    stage,
    region: need(data, 'Region'),
    apiUrl: need(api, 'ApiUrl'),
    userPoolId: need(data, 'UserPoolId'),
    userPoolClientId: need(data, 'UserPoolClientId'),
    photoBucket: need(data, 'PhotoBucketName'),
    tables: {
      profiles: need(data, 'ProfilesTable'),
      listings: need(data, 'ListingsTable'),
      bookings: need(data, 'BookingsTable'),
      evSpecs: need(data, 'EVSpecsTable'),
    },
  };
}
