import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AccountRecovery,
  FeaturePlan,
  Mfa,
  UserPool,
  UserPoolClient,
  UserPoolEmail,
} from 'aws-cdk-lib/aws-cognito';
import { AttributeType, Billing, ProjectionType, TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { PASSWORD_MIN_LENGTH } from '../../src/lib/accountRules';
import { photoBucketArnExport, type DwellConfig } from './config';
import { DwellFunction } from './dwell-function';

export interface DataStackProps extends StackProps {
  config: DwellConfig;
}

/**
 * DwellData: everything that cannot be rebuilt. Accounts (Cognito), the four tables and the photo bucket.
 * All of it is RETAINed if the stack is deleted. Never rename a construct id here: that replaces the resource and
 * loses its data. Run `cdk diff` before every deploy.
 */
export class DataStack extends Stack {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly profiles: TableV2;
  readonly listings: TableV2;
  readonly bookings: TableV2;
  readonly evSpecs: TableV2;
  readonly photoBucket: Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, { ...props, terminationProtection: props.config.protectData });

    const tableDefaults = {
      billing: Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    };

    // One profile per account, keyed by the Cognito sub.
    this.profiles = new TableV2(this, 'Profiles', {
      ...tableDefaults,
      partitionKey: { name: 'userId', type: AttributeType.STRING },
    });

    // `active` is sparse: only active listings carry activePartition, so search reads one small partition.
    this.listings = new TableV2(this, 'Listings', {
      ...tableDefaults,
      partitionKey: { name: 'listingId', type: AttributeType.STRING },
      globalSecondaryIndexes: [
        {
          indexName: 'active',
          partitionKey: { name: 'activePartition', type: AttributeType.STRING },
          sortKey: { name: 'listingId', type: AttributeType.STRING },
          projectionType: ProjectionType.ALL,
        },
      ],
    });

    // `byListing` serves the host's bookings view (tasks.md 19.2).
    this.bookings = new TableV2(this, 'Bookings', {
      ...tableDefaults,
      partitionKey: { name: 'bookingId', type: AttributeType.STRING },
      globalSecondaryIndexes: [
        {
          indexName: 'byListing',
          partitionKey: { name: 'listingId', type: AttributeType.STRING },
          sortKey: { name: 'booked_start', type: AttributeType.STRING },
          projectionType: ProjectionType.ALL,
        },
      ],
    });

    this.evSpecs = new TableV2(this, 'EVSpecs', {
      ...tableDefaults,
      partitionKey: { name: 'evId', type: AttributeType.STRING },
    });

    // Private photo bucket. The browser uploads with presigned POSTs and reads with presigned GETs from the API.
    this.photoBucket = new Bucket(this, 'Photos', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      minimumTLSVersion: 1.2,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [HttpMethods.POST],
          allowedOrigins: props.config.webOrigins,
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(1) }],
    });

    const postConfirmation = new DwellFunction(this, 'PostConfirmation', {
      handlerName: 'post-confirmation',
      description: 'Creates the Profiles item when a Dwell account confirms its email',
      environment: { PROFILES_TABLE: this.profiles.tableName },
    });
    this.profiles.grant(postConfirmation, 'dynamodb:PutItem');

    // Email sign-in, one account for driving and hosting (Req 1.11, 1.12). Required attributes cannot be changed
    // after the pool exists, so email, name and phone are the full list.
    this.userPool = new UserPool(this, 'Users', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      keepOriginal: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: true, mutable: true },
        phoneNumber: { required: true, mutable: true },
      },
      // Must match the sign-up form: both use src/lib/accountRules.ts.
      passwordPolicy: {
        minLength: PASSWORD_MIN_LENGTH,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      mfa: Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      featurePlan: FeaturePlan.ESSENTIALS,
      // Cognito's own sender is limited to a small daily quota. Switch to SES before real sign-ups.
      email: UserPoolEmail.withCognito(),
      lambdaTriggers: { postConfirmation },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Public client for the browser: no secret. The app's own pages call the user-pool API (USER_PASSWORD_AUTH over
    // TLS, or SRP). Refresh tokens rotate, so the app refreshes with GetTokensFromRefreshToken.
    this.userPoolClient = this.userPool.addClient('WebClient', {
      generateSecret: false,
      authFlows: { userPassword: true, userSrp: true },
      disableOAuth: true,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(7),
      refreshTokenRotationGracePeriod: Duration.seconds(10),
    });

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, 'PhotoBucketName', { value: this.photoBucket.bucketName });
    // For scripts/ (config, seed, smoke test), read from cdk-outputs.json.
    new CfnOutput(this, 'Region', { value: this.region });
    new CfnOutput(this, 'ProfilesTable', { value: this.profiles.tableName });
    new CfnOutput(this, 'ListingsTable', { value: this.listings.tableName });
    new CfnOutput(this, 'BookingsTable', { value: this.bookings.tableName });
    new CfnOutput(this, 'EVSpecsTable', { value: this.evSpecs.tableName });
    // Named export so the API stack's IAM policies read the same text at synth and in the template (nag.ts).
    new CfnOutput(this, 'PhotoBucketArn', { value: this.photoBucket.bucketArn, exportName: photoBucketArnExport(props.config.stage) });
  }
}
