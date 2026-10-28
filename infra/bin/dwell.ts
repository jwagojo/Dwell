import { App, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { buildDwell } from '../lib/app';

// `cdk synth -c stage=dev-<name>` (or cdk.json) picks the stage. The account comes from your AWS profile; the region
// comes from cdk.json (us-east-2, the only region this account's organization allows).
const app = new App();
buildDwell(app, process.env.CDK_DEFAULT_ACCOUNT);
// cdk-nag security checks. Accepted findings are acknowledged with reasons in lib/nag.ts.
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
