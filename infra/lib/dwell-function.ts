import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, LoggingFormat, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Handler entry for a route folder in functions/ (one folder per route). */
export const handlerEntry = (name: string) => path.join(REPO_ROOT, 'functions', name, 'handler.ts');

export interface DwellFunctionProps {
  /** Folder name under functions/ */
  handlerName: string;
  description: string;
  environment?: Record<string, string>;
  timeout?: Duration;
}

/**
 * Every Dwell Lambda: Node.js 24 on ARM, bundled by esbuild from functions/<name>/handler.ts together with the pure
 * src/ modules it imports. The AWS SDK is bundled too, so the pinned versions in package-lock.json are what runs.
 *
 * Each function gets its own role that may only write to its own log group (no AWS managed policy). Data access is
 * added per route with explicit actions (api-stack.ts).
 */
export class DwellFunction extends NodejsFunction {
  readonly executionRole: Role;

  constructor(scope: Construct, id: string, props: DwellFunctionProps) {
    const logGroup = new LogGroup(scope, `${id}Logs`, { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY });
    const role = new Role(scope, `${id}Role`, {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for ${props.handlerName}`,
    });
    role.addToPolicy(new PolicyStatement({ actions: ['logs:CreateLogStream', 'logs:PutLogEvents'], resources: [logGroup.logGroupArn] }));
    super(scope, id, {
      entry: handlerEntry(props.handlerName),
      handler: 'handler',
      description: props.description,
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: props.timeout ?? Duration.seconds(10),
      environment: { NODE_OPTIONS: '--enable-source-maps', ...props.environment },
      loggingFormat: LoggingFormat.JSON,
      logGroup,
      role,
      projectRoot: REPO_ROOT,
      depsLockFilePath: path.join(REPO_ROOT, 'package-lock.json'),
      bundling: {
        format: OutputFormat.CJS,
        minify: true,
        sourceMap: true,
        externalModules: [],
        tsconfig: path.join(REPO_ROOT, 'functions', 'tsconfig.json'),
      },
    });
    this.executionRole = role;
  }

  /** Allow `actions` on `resources`, nothing broader. */
  allow(actions: string[], resources: string[]): void {
    this.executionRole.addToPolicy(new PolicyStatement({ actions, resources }));
  }
}
