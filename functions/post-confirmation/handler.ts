import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import { parseUsPhone } from '../../src/lib/accountRules';
import { ddb } from '../shared/clients';
import { tables } from '../shared/env';
import type { ProfileItem } from '../shared/items';


/**
 * Cognito post-confirmation trigger: create the account's profile once the email is confirmed. One account drives
 * and hosts, so there is no role (Req 1.12). Idempotent: a retried confirmation keeps the existing profile.
 * Throwing makes Cognito report the confirmation as failed, so the user can retry.
 */
export async function handler(event: PostConfirmationTriggerEvent): Promise<PostConfirmationTriggerEvent> {
  // The same trigger fires after a password reset. That account already has a profile.
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;
  const a = event.request.userAttributes;
  const item: ProfileItem = {
    userId: a.sub,
    email: a.email ?? '',
    displayName: (a.name ?? '').trim(),
    // Cognito stores E.164 ("+16175551234"); the app keeps 10 US digits.
    phone: parseUsPhone(a.phone_number ?? '') ?? '',
    created_at: new Date().toISOString(),
  };
  try {
    await ddb.send(new PutCommand({ TableName: tables.profiles, Item: item, ConditionExpression: 'attribute_not_exists(userId)' }));
  } catch (err) {
    if ((err as Error).name !== 'ConditionalCheckFailedException') throw err;
  }
  return event;
}
