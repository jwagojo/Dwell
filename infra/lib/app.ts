import type { App } from 'aws-cdk-lib';
import { ApiStack } from './api-stack';
import { readConfig, stackName } from './config';
import { DataStack } from './data-stack';
import { addNagSuppressions } from './nag';

/** Both backend stacks for one stage. Hosting (DwellWeb) is not built yet. The region comes from context, not the CLI profile. */
export function buildDwell(app: App, account?: string) {
  const config = readConfig(app);
  const env = { account, region: config.region };
  const dataName = stackName(config.stage, 'Data');
  const apiName = stackName(config.stage, 'Api');
  const data = new DataStack(app, dataName, { stackName: dataName, env, config, description: `Dwell ${config.stage}: accounts, tables and photos (stateful)` });
  const api = new ApiStack(app, apiName, {
    stackName: apiName,
    env,
    config,
    description: `Dwell ${config.stage}: HTTP API and Lambda handlers`,
    userPool: data.userPool,
    userPoolClient: data.userPoolClient,
    profiles: data.profiles,
    listings: data.listings,
    bookings: data.bookings,
    evSpecs: data.evSpecs,
    photoBucket: data.photoBucket,
  });
  // The API imports the photo bucket ARN by export name, so make the deploy order explicit.
  api.addStackDependency(data);
  addNagSuppressions(data, api);
  return { config, data, api };
}
