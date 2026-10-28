import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestEnv } from '../shared/testing';
import { handler } from './handler';

useTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const event = (triggerSource: string) =>
  ({
    triggerSource,
    request: { userAttributes: { sub: 'new-sub', email: 'new@example.com', name: ' Nia New ', phone_number: '+16175550111' } },
    response: {},
  }) as unknown as PostConfirmationTriggerEvent;

beforeEach(() => ddb.reset());

describe('post-confirmation trigger', () => {
  it('creates the profile once, with 10-digit phone and no role', async () => {
    ddb.on(PutCommand).resolves({});
    await handler(event('PostConfirmation_ConfirmSignUp'));
    const input = ddb.commandCalls(PutCommand)[0].args[0].input;
    expect(input.Item).toMatchObject({ userId: 'new-sub', email: 'new@example.com', displayName: 'Nia New', phone: '6175550111' });
    expect(input.Item).not.toHaveProperty('role');
    expect(input.ConditionExpression).toBe('attribute_not_exists(userId)');
  });

  it('ignores password-reset confirmations and an existing profile', async () => {
    await handler(event('PostConfirmation_ConfirmForgotPassword'));
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
    ddb.on(PutCommand).rejects(Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' }));
    await expect(handler(event('PostConfirmation_ConfirmSignUp'))).resolves.toBeDefined();
  });
});
