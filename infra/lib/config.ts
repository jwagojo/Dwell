import type { App } from 'aws-cdk-lib';

/**
 * Deployment settings from CDK context (infra/cdk.json, or `-c key=value` on the command line).
 * - stage: prefixes every stack name so each developer can deploy a personal copy (`-c stage=dev-wesley`).
 * - webOrigins: origins allowed by CORS on the API and the photo bucket. The hosting stack will add its own later.
 */
export interface DwellConfig {
  stage: string;
  /**
   * Region for every stack. Set explicitly (context `region`) rather than taken from the CLI profile: the project's
   * AWS Organization allows only us-east-2 (a service control policy denies CloudFormation everywhere else).
   */
  region: string;
  webOrigins: string[];
  /** Termination protection on the stateful stack. On for every stage that does not start with "dev". */
  protectData: boolean;
}

const STAGE_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;
/** The only region the organization's SCP allows for this account. */
export const DEFAULT_REGION = 'us-east-2';

export function readConfig(app: App): DwellConfig {
  const stage = String(app.node.tryGetContext('stage') ?? 'dev');
  if (!STAGE_PATTERN.test(stage)) throw new Error(`stage "${stage}" must be lowercase letters, digits and dashes (2 to 31 characters).`);
  const rawOrigins = app.node.tryGetContext('webOrigins') ?? ['http://localhost:5173'];
  const listed: string[] = typeof rawOrigins === 'string' ? rawOrigins.split(',') : rawOrigins;
  // Browsers send the origin without a trailing slash, and CORS needs an exact match, so drop one if it was pasted.
  const webOrigins = listed.map((s) => s.trim().replace(/\/$/, ''));
  for (const o of webOrigins) {
    if (!/^https?:\/\/[^/\s*]+$/.test(o)) throw new Error(`webOrigins entry "${o}" must be an origin like https://example.com (no path, no wildcard).`);
  }
  const region = String(app.node.tryGetContext('region') ?? DEFAULT_REGION);
  if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) throw new Error(`region "${region}" is not an AWS region name.`);
  return { stage, region, webOrigins, protectData: !stage.startsWith('dev') };
}

export const stackName = (stage: string, part: 'Data' | 'Api') => `Dwell-${stage}-${part}`;
/** SecureString parameter holding the EIA API key. Created by hand, never in a template (voltlot-rules.md §2). */
export const eiaKeyParameterName = (stage: string) => `/dwell/${stage}/eia-api-key`;
/** CloudFormation export with the photo bucket ARN (DwellData -> DwellApi). */
export const photoBucketArnExport = (stage: string) => `Dwell-${stage}-PhotoBucketArn`;
