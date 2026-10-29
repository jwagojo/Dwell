import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { AccessLogFormat } from 'aws-cdk-lib/aws-apigateway';
import { CorsHttpMethod, HttpApi, HttpMethod, HttpStage, LogGroupLogDestination } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import type { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Bucket } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { eiaKeyParameterName, mbtaKeyParameterName, photoBucketArnExport, type DwellConfig } from './config';
import { DwellFunction } from './dwell-function';

export interface ApiStackProps extends StackProps {
  config: DwellConfig;
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  profiles: TableV2;
  listings: TableV2;
  bookings: TableV2;
  evSpecs: TableV2;
  photoBucket: Bucket;
}

type Grant = (fn: DwellFunction) => void;

interface RouteSpec {
  method: HttpMethod;
  path: string;
  handlerName: string;
  description: string;
  grants: Grant[];
  timeout?: Duration;
}

/**
 * DwellApi: the HTTP API and one Lambda per route. Stateless, so it can be redeployed freely. Every route sits
 * behind the Cognito JWT authorizer; each handler still checks ownership (driver, host, listing owner) itself.
 */
export class ApiStack extends Stack {
  readonly api: HttpApi;
  readonly url: string;
  /** Object-prefix S3 permissions (the only wildcards left), for the cdk-nag acknowledgements in nag.ts. */
  readonly photoPrefixGrants: { fn: DwellFunction; arn: string }[] = [];

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { profiles, listings, bookings, evSpecs, photoBucket, config } = props;

    const mbtaKey = StringParameter.fromSecureStringParameterAttributes(this, 'MbtaKey', { parameterName: mbtaKeyParameterName(config.stage) });
    const eiaKey = StringParameter.fromSecureStringParameterAttributes(this, 'EiaKey', {
      parameterName: eiaKeyParameterName(config.stage),
    });

    // Least privilege per route, with explicit actions and resources (no `grant*` wildcards). Transactions need the
    // per-item actions only. Presigning needs the permission the URL grants (GetObject / PutObject). ListBucket lets
    // HeadObject answer 404 for a missing photo instead of 403.
    const photoPrefixGrants = this.photoPrefixGrants;
    const photoBucketArn = Fn.importValue(photoBucketArnExport(config.stage));
    const photoObjects = (pattern: string) => `${photoBucketArn}/${pattern}`;
    const READ = ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:ConditionCheckItem'];
    const WRITE = ['dynamodb:PutItem', 'dynamodb:UpdateItem'];
    const activeIndexArn = `${listings.tableArn}/index/active`;
    const viewPhotos = (fn: DwellFunction, prefix: string) => {
      fn.allow(['s3:GetObject'], [photoObjects(`${prefix}*`)]);
      fn.allow(['s3:ListBucket'], [photoBucketArn]);
      photoPrefixGrants.push({ fn, arn: photoObjects(`${prefix}*`) });
    };
    const g = {
      readProfiles: (fn: DwellFunction) => fn.allow(['dynamodb:GetItem'], [profiles.tableArn]),
      writeProfiles: (fn: DwellFunction) => fn.allow(['dynamodb:GetItem', ...WRITE], [profiles.tableArn]),
      readListings: (fn: DwellFunction) => fn.allow(READ, [listings.tableArn, activeIndexArn]),
      writeListings: (fn: DwellFunction) => fn.allow([...READ, ...WRITE], [listings.tableArn]),
      readBookings: (fn: DwellFunction) => fn.allow(['dynamodb:GetItem'], [bookings.tableArn]),
      queryListingBookings: (fn: DwellFunction) => fn.allow(['dynamodb:Query'], [`${bookings.tableArn}/index/byListing`]),
      writeBookings: (fn: DwellFunction) => fn.allow(['dynamodb:GetItem', ...WRITE], [bookings.tableArn]),
      readCars: (fn: DwellFunction) => fn.allow(['dynamodb:GetItem', 'dynamodb:Scan'], [evSpecs.tableArn]),
      viewAllPhotos: (fn: DwellFunction) => viewPhotos(fn, 'media/'),
      viewListingPhotos: (fn: DwellFunction) => viewPhotos(fn, 'media/listings/'),
      viewBookingPhotos: (fn: DwellFunction) => viewPhotos(fn, 'media/bookings/'),
      presignUploads: (fn: DwellFunction) => {
        fn.allow(['s3:PutObject'], [photoObjects('media/*')]);
        photoPrefixGrants.push({ fn, arn: photoObjects('media/*') });
      },
      readEiaKey: (fn: DwellFunction) => fn.allow(['ssm:GetParameter'], [eiaKey.parameterArn]),
      readMbtaKey: (fn: DwellFunction) => fn.allow(['ssm:GetParameter'], [mbtaKey.parameterArn]),
    } satisfies Record<string, Grant>;

    const routes: RouteSpec[] = [
      { method: HttpMethod.GET, path: '/me', handlerName: 'get-me', description: 'Profile, car, own listing and latest booking', grants: [g.readProfiles, g.readListings, g.readBookings, g.viewAllPhotos] },
      { method: HttpMethod.PUT, path: '/me', handlerName: 'save-me', description: 'Saves the driver car choice', grants: [g.writeProfiles, g.readCars] },
      { method: HttpMethod.GET, path: '/listings', handlerName: 'list-listings', description: 'Active listings, public fields', grants: [g.readListings, g.viewListingPhotos] },
      { method: HttpMethod.GET, path: '/listings/{id}', handlerName: 'get-listing', description: 'One listing; exact address for its host', grants: [g.readListings, g.viewListingPhotos] },
      { method: HttpMethod.PUT, path: '/me/listing', handlerName: 'save-my-listing', description: 'Validates and publishes the account listing', grants: [g.writeProfiles, g.writeListings, g.viewListingPhotos] },
      { method: HttpMethod.DELETE, path: '/me/listing', handlerName: 'remove-my-listing', description: 'Takes the account listing out of search', grants: [g.readProfiles, g.writeListings] },
      { method: HttpMethod.GET, path: '/rate', handlerName: 'get-electricity-rate', description: 'EIA Massachusetts residential average or the fallback', grants: [g.readEiaKey], timeout: Duration.seconds(10) },
      { method: HttpMethod.GET, path: '/transit', handlerName: 'get-transit', description: 'MBTA routes near a point', grants: [g.readMbtaKey], timeout: Duration.seconds(15) },
      { method: HttpMethod.GET, path: '/cars', handlerName: 'list-cars', description: 'Car list: EVSpecs plus the seeded fallback', grants: [g.readCars] },
      { method: HttpMethod.POST, path: '/bookings', handlerName: 'create-booking', description: 'Guards, prices and reserves a booking', grants: [g.writeProfiles, g.readListings, g.writeBookings] },
      { method: HttpMethod.GET, path: '/me/listing/bookings', handlerName: 'list-host-bookings', description: 'Bookings on the account listing, for its host', grants: [g.readProfiles, g.readListings, g.queryListingBookings, g.viewBookingPhotos] },
      { method: HttpMethod.GET, path: '/bookings/{id}', handlerName: 'get-booking-details', description: 'Booking and listing for its driver or host', grants: [g.readBookings, g.readListings, g.viewAllPhotos] },
      { method: HttpMethod.POST, path: '/bookings/{id}/check-in', handlerName: 'check-in', description: 'Starts the session after the arrival photo', grants: [g.writeBookings, g.viewBookingPhotos] },
      { method: HttpMethod.POST, path: '/bookings/{id}/pickup', handlerName: 'complete-pickup', description: 'Geofence check and settlement', grants: [g.writeBookings, g.readListings, g.viewBookingPhotos], timeout: Duration.seconds(25) },
      { method: HttpMethod.POST, path: '/uploads', handlerName: 'create-upload', description: 'Presigned POST for one photo', grants: [g.writeProfiles, g.readBookings, g.presignUploads] },
    ];

    const authorizer = new HttpUserPoolAuthorizer('CognitoAuthorizer', props.userPool, {
      userPoolClients: [props.userPoolClient],
      identitySource: ['$request.header.Authorization'],
    });

    this.api = new HttpApi(this, 'HttpApi', {
      apiName: `dwell-${config.stage}`,
      description: `Dwell API (${config.stage})`,
      createDefaultStage: false,
      defaultAuthorizer: authorizer,
      corsPreflight: {
        allowOrigins: config.webOrigins,
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PUT, CorsHttpMethod.DELETE],
        allowHeaders: ['authorization', 'content-type'],
        maxAge: Duration.hours(1),
      },
    });

    const accessLogs = new LogGroup(this, 'AccessLogs', { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY });
    const stage = new HttpStage(this, 'DefaultStage', {
      httpApi: this.api,
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 25, burstLimit: 50 },
      accessLogSettings: {
        destination: new LogGroupLogDestination(accessLogs),
        format: AccessLogFormat.custom(
          JSON.stringify({
            requestId: '$context.requestId',
            ip: '$context.identity.sourceIp',
            routeKey: '$context.routeKey',
            status: '$context.status',
            latencyMs: '$context.responseLatency',
            user: '$context.authorizer.claims.sub',
            authError: '$context.authorizer.error',
            integrationError: '$context.integrationErrorMessage',
          }),
        ),
      },
    });
    this.url = stage.url;

    const tableEnv = {
      PROFILES_TABLE: profiles.tableName,
      LISTINGS_TABLE: listings.tableName,
      BOOKINGS_TABLE: bookings.tableName,
      EVSPECS_TABLE: evSpecs.tableName,
      PHOTO_BUCKET: photoBucket.bucketName,
      EIA_KEY_PARAM: eiaKeyParameterName(config.stage),
      MBTA_KEY_PARAM: mbtaKeyParameterName(config.stage),
    };

    for (const r of routes) {
      const id = r.handlerName.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
      const fn = new DwellFunction(this, id, {
        handlerName: r.handlerName,
        description: r.description,
        environment: tableEnv,
        timeout: r.timeout,
      });
      for (const grant of r.grants) grant(fn);
      this.api.addRoutes({ path: r.path, methods: [r.method], integration: new HttpLambdaIntegration(`${id}Integration`, fn) });
    }

    new CfnOutput(this, 'ApiUrl', { value: this.url });
  }
}
