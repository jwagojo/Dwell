import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

export type ApiEvent = APIGatewayProxyEventV2WithJWTAuthorizer;
export interface ApiResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/** A failure the caller may see: status, a stable code for the app, and a message safe to show. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };

export const json = (statusCode: number, body: unknown): ApiResult => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) });
export const noContent = (): ApiResult => ({ statusCode: 204, headers: { 'cache-control': 'no-store' }, body: '' });

export const notFound = (what = 'That item') => new HttpError(404, 'NOT_FOUND', `${what} was not found.`);
export const badRequest = (message: string, details?: Record<string, unknown>) => new HttpError(400, 'BAD_REQUEST', message, details);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) => new HttpError(409, code, message, details);

/**
 * The caller's user id: the Cognito `sub` from the token the JWT authorizer already verified.
 * Never taken from the request body. A missing claim means the route was deployed without the authorizer.
 */
export function userId(event: ApiEvent): string {
  const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (typeof sub !== 'string' || sub.length === 0) throw new HttpError(401, 'UNAUTHORIZED', 'Sign in to continue.');
  return sub;
}

/** Ids are UUIDs we issue (and short seed ids). Anything else cannot exist, so it is a 404, not a lookup. */
export const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
export const isId = (v: unknown): v is string => typeof v === 'string' && ID_PATTERN.test(v);

export function pathId(event: ApiEvent, name: string): string {
  const value = event.pathParameters?.[name];
  if (!isId(value)) throw notFound();
  return value;
}

const MAX_BODY_BYTES = 64 * 1024;

export function readJson(event: ApiEvent): Record<string, unknown> {
  if (!event.body) return {};
  const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new HttpError(413, 'TOO_LARGE', 'The request is too large.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw badRequest('The request body is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw badRequest('The request body must be a JSON object.');
  return parsed as Record<string, unknown>;
}

/** A DynamoDB condition (or a condition inside a transaction) failed: someone changed the data first. */
export function isConditionFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'ConditionalCheckFailedException') return true;
  if (err.name === 'TransactionCanceledException') {
    const reasons = (err as Error & { CancellationReasons?: { Code?: string }[] }).CancellationReasons ?? [];
    return reasons.some((r) => r.Code === 'ConditionalCheckFailed');
  }
  return false;
}

/**
 * Wrap a route handler: typed errors become their status, a lost race becomes 409, anything else is logged and
 * becomes a plain 500. Request bodies and tokens are never logged.
 */
export function api(fn: (event: ApiEvent) => Promise<ApiResult>) {
  return async (event: ApiEvent): Promise<ApiResult> => {
    try {
      return await fn(event);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: { code: err.code, message: err.message, ...err.details } });
      if (isConditionFailure(err)) {
        return json(409, { error: { code: 'CONFLICT', message: 'Something changed while saving. Reload and try again.' } });
      }
      const e = err instanceof Error ? err : new Error(String(err));
      console.error(JSON.stringify({ level: 'ERROR', route: event.routeKey, name: e.name, message: e.message, stack: e.stack }));
      return json(500, { error: { code: 'INTERNAL', message: 'Something went wrong. Try again in a moment.' } });
    }
  };
}
