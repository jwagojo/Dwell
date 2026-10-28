import { api, json, notFound, pathId, userId } from '../shared/http';
import { toApiListing } from '../shared/mappers';
import { getListing } from '../shared/store';

/**
 * GET /listings/{id}: one listing. Anyone signed in sees an active listing's public fields. The host also sees the
 * exact address, and sees the listing after removing it. A driver gets the address through their booking.
 */
export const handler = api(async (event) => {
  const sub = userId(event);
  const item = await getListing(pathId(event, 'id'));
  const isHost = item?.hostId === sub;
  if (!item || (!item.active && !isHost)) throw notFound('That listing');
  return json(200, { listing: await toApiListing(item, { includePrivate: isHost }) });
});
