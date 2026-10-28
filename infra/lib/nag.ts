import { Stack, Validations } from 'aws-cdk-lib';
// cdk-nag builds IAM5 finding ids from the flattened resource; reuse its helper so the ids always match.
import { flattenCfnReference } from 'cdk-nag/lib/utils/flatten-cfn-reference';
import type { ApiStack } from './api-stack';
import type { DataStack } from './data-stack';

/**
 * cdk-nag (AwsSolutions) findings that are accepted for the MVP, each with its reason. Everything else is fixed in
 * the stacks. Review this list before a public launch.
 */
export function addNagSuppressions(data: DataStack, api: ApiStack): void {
  Validations.of(data.photoBucket).acknowledge({
    id: 'AwsSolutions-S1',
    reason: 'Server access logs need a separate log bucket. Deferred for the MVP; enable CloudTrail S3 data events or access logs before launch.',
  });
  Validations.of(data.userPool).acknowledge({
    id: 'AwsSolutions-COG2',
    reason: 'TOTP MFA is offered (optional) but not required: the MVP sign-up flow has no MFA enrollment step yet.',
  });
  Validations.of(data.userPool).acknowledge({
    id: 'AwsSolutions-COG8',
    reason: 'The Essentials feature plan is used for the MVP. Plus (threat protection) is billed per user; revisit before launch.',
  });

  // The only wildcards left are S3 object prefixes: photo keys are generated per listing and booking, so a role
  // must cover a prefix. Each Lambda still checks ownership before it signs a URL for a key.
  for (const { fn, arn } of api.photoPrefixGrants) {
    const resource = flattenCfnReference(Stack.of(fn).resolve(arn));
    Validations.of(fn.executionRole).acknowledge({
      id: `AwsSolutions-IAM5[Resource::${resource}]`,
      reason: 'Photo keys live under media/listings/{listingId}/ and media/bookings/{bookingId}/; access to one key is decided in the handler.',
    });
  }
}
