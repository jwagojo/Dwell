import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3 } from './clients';
import { env } from './env';

/**
 * Photo keys (Req 1.4, 5.1, 5.5). The bucket is private: the browser uploads with a presigned POST for one exact key
 * (create-upload) and reads through short-lived presigned GET URLs returned by the API.
 */
export const PHOTO_CONTENT_TYPE = 'image/jpeg';
export const UPLOAD_EXPIRES_S = 300;
export const VIEW_EXPIRES_S = 3600;

export const listingPhotoPrefix = (listingId: string) => `media/listings/${listingId}/`;
export const bookingPhotoKey = (bookingId: string, kind: 'arrival' | 'pickup') => `media/bookings/${bookingId}/${kind}.jpg`;

const LISTING_PHOTO_KEY = /^media\/listings\/([A-Za-z0-9-]+)\/[A-Za-z0-9-]+\.jpg$/;
/** True when `key` is a photo key this listing could have been issued by create-upload. */
export const isListingPhotoKey = (key: string, listingId: string): boolean => LISTING_PHOTO_KEY.exec(key)?.[1] === listingId;

export const photoBucket = () => env('PHOTO_BUCKET');

export function viewUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: photoBucket(), Key: key }), { expiresIn: VIEW_EXPIRES_S });
}

export const viewUrls = (keys: string[]): Promise<string[]> => Promise.all(keys.map(viewUrl));

/** Whether the upload landed. The functions can list the bucket, so a missing key is a 404 (not a 403). */
export async function photoExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: photoBucket(), Key: key }));
    return true;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if ((err as Error).name === 'NotFound' || status === 404) return false;
    throw err;
  }
}
