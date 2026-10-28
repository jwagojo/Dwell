import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/clients';
import { ACTIVE_LISTINGS_INDEX, ACTIVE_PARTITION, tables } from '../shared/env';
import { api, json, userId } from '../shared/http';
import type { ListingItem } from '../shared/items';
import { toApiListing } from '../shared/mappers';

/**
 * GET /listings: every active listing, public fields only (street name, neighborhood, pin, charger, price inputs,
 * availability, photo URLs). DynamoDB has no radius query, so the app filters by the visible map and measures with
 * haversineDistanceMeters() (voltlot-rules.md §2).
 */
export const handler = api(async (event) => {
  userId(event);
  const items: ListingItem[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: tables.listings,
        IndexName: ACTIVE_LISTINGS_INDEX,
        KeyConditionExpression: 'activePartition = :a',
        ExpressionAttributeValues: { ':a': ACTIVE_PARTITION },
        ExclusiveStartKey,
      }),
    );
    items.push(...((page.Items ?? []) as ListingItem[]));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  const listings = await Promise.all(items.filter((i) => i.active).map((i) => toApiListing(i, { includePrivate: false })));
  return json(200, { listings });
});
