import { App, Validations } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH } from '../../src/lib/accountRules';
import { buildDwell } from './app';

/** Bundling is skipped (no esbuild runs); the templates are otherwise what `cdk synth` produces. */
function newApp(context: Record<string, unknown> = {}) {
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [], stage: 'dev-test', ...context } });
  return { app, ...buildDwell(app) };
}

/** Template.fromStack synthesizes the app, so build templates only after any validation plugin is added. */
function build() {
  const stacks = newApp();
  return { data: Template.fromStack(stacks.data), api: Template.fromStack(stacks.api) };
}

describe('DwellData', () => {
  const { data } = build();

  it('keeps every table: on-demand, PITR, deletion protection, retained', () => {
    const tables = data.findResources('AWS::DynamoDB::GlobalTable');
    expect(Object.keys(tables)).toHaveLength(4);
    for (const t of Object.values(tables)) {
      expect(t.DeletionPolicy).toBe('Retain');
      expect(t.Properties.BillingMode).toBe('PAY_PER_REQUEST');
      expect(t.Properties.Replicas[0]).toMatchObject({ DeletionProtectionEnabled: true, PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true } });
    }
  });

  it('has the keys and indexes the handlers query', () => {
    const keyed = (pk: string) => Match.objectLike({ KeySchema: [{ AttributeName: pk, KeyType: 'HASH' }] });
    for (const pk of ['userId', 'listingId', 'bookingId', 'evId']) data.hasResourceProperties('AWS::DynamoDB::GlobalTable', keyed(pk));
    data.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      GlobalSecondaryIndexes: [Match.objectLike({ IndexName: 'active', KeySchema: [{ AttributeName: 'activePartition', KeyType: 'HASH' }, { AttributeName: 'listingId', KeyType: 'RANGE' }] })],
    });
    data.hasResourceProperties('AWS::DynamoDB::GlobalTable', { GlobalSecondaryIndexes: [Match.objectLike({ IndexName: 'byListing' })] });
  });

  it('has a public app client with no secret, rotating refresh tokens and email sign-in', () => {
    data.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      EnableTokenRevocation: true,
      RefreshTokenRotation: { Feature: 'ENABLED' },
      ExplicitAuthFlows: ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_USER_SRP_AUTH'],
    });
    data.hasResourceProperties('AWS::Cognito::UserPool', { UsernameAttributes: ['email'], DeletionProtection: 'ACTIVE' });
    data.hasResource('AWS::Cognito::UserPool', { DeletionPolicy: 'Retain' });
  });

  it('enforces the same password and phone rules as the sign-up form', () => {
    data.hasResourceProperties('AWS::Cognito::UserPool', {
      Policies: {
        PasswordPolicy: Match.objectLike({ MinimumLength: PASSWORD_MIN_LENGTH, RequireUppercase: true, RequireLowercase: true, RequireNumbers: true, RequireSymbols: true }),
      },
      Schema: Match.arrayWith([Match.objectLike({ Name: 'name', Required: true }), Match.objectLike({ Name: 'phone_number', Required: true })]),
    });
  });

  it('keeps the photo bucket private and TLS-only', () => {
    data.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      CorsConfiguration: { CorsRules: [Match.objectLike({ AllowedMethods: ['POST'], AllowedOrigins: ['http://localhost:5173'] })] },
    });
    data.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } })]) },
    });
  });
});

describe('DwellApi', () => {
  const { api } = build();

  it('puts every route behind the Cognito JWT authorizer', () => {
    const routes = Object.values(api.findResources('AWS::ApiGatewayV2::Route'));
    expect(routes).toHaveLength(15);
    for (const r of routes) expect(r.Properties.AuthorizationType).toBe('JWT');
    api.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', { AuthorizerType: 'JWT', IdentitySource: ['$request.header.Authorization'] });
  });

  it('throttles and logs the stage, and allows only the configured origins', () => {
    api.hasResourceProperties('AWS::ApiGatewayV2::Stage', { StageName: '$default', DefaultRouteSettings: { ThrottlingRateLimit: 25, ThrottlingBurstLimit: 50 }, AccessLogSettings: Match.anyValue() });
    api.hasResourceProperties('AWS::ApiGatewayV2::Api', { CorsConfiguration: Match.objectLike({ AllowOrigins: ['http://localhost:5173'] }) });
  });

  it('runs Node.js 24 on ARM and never attaches an AWS managed policy', () => {
    for (const fn of Object.values(api.findResources('AWS::Lambda::Function'))) {
      expect(fn.Properties).toMatchObject({ Runtime: 'nodejs24.x', Architectures: ['arm64'] });
    }
    for (const role of Object.values(api.findResources('AWS::IAM::Role'))) expect(role.Properties.ManagedPolicyArns).toBeUndefined();
  });

  it('reads the EIA key from its stage parameter only', () => {
    api.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Action: 'ssm:GetParameter', Resource: Match.objectLike({ 'Fn::Join': Match.arrayWith([Match.arrayWith([':parameter/dwell/dev-test/eia-api-key'])]) }) })]) },
    });
  });
});

describe('cdk-nag', () => {
  it('passes AwsSolutions with only the acknowledged findings', () => {
    const { app } = newApp();
    Validations.of(app).addPlugins(new AwsSolutionsChecks(app));
    // Synth throws ValidationFailed on any finding that lib/nag.ts does not acknowledge.
    expect(() => app.synth()).not.toThrow();
  });

  it('accepts an origin pasted with a trailing slash and stores it without one', () => {
    const { config } = newApp({ webOrigins: ['http://localhost:5173', 'https://main.example.amplifyapp.com/'] });
    expect(config.webOrigins).toEqual(['http://localhost:5173', 'https://main.example.amplifyapp.com']);
    expect(() => newApp({ webOrigins: ['https://example.com/app'] })).toThrow(/origin/);
  });

  it('rejects a bad stage name', () => {
    expect(() => newApp({ stage: 'Prod!' })).toThrow(/stage/);
  });
});
