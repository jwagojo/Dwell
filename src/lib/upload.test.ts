import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataUrlToBlob, uploadPhoto } from './upload';

const JPEG = `data:image/jpeg;base64,${btoa('fake-jpeg-bytes')}`;
const presigned = { ok: true as const, status: 200, data: { upload: { key: 'media/bookings/b1/arrival.jpg', url: 'https://bucket.s3.amazonaws.com/', fields: { key: 'media/bookings/b1/arrival.jpg', Policy: 'p' }, maxBytes: 1000 } } };

afterEach(() => vi.useRealTimers());

describe('uploadPhoto', () => {
  it('posts the policy fields, then the file last, and returns the key', async () => {
    const api = { createUpload: vi.fn().mockResolvedValue(presigned) };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const r = await uploadPhoto(api, { kind: 'arrival', bookingId: 'b1' }, JPEG, { fetchImpl });
    expect(r).toEqual({ ok: true, key: 'media/bookings/b1/arrival.jpg' });
    expect(api.createUpload).toHaveBeenCalledWith({ kind: 'arrival', bookingId: 'b1' });
    const form = fetchImpl.mock.calls[0][1].body as FormData;
    expect([...form.keys()]).toEqual(['key', 'Policy', 'file']);
  });

  it('reports a refused presign and a failed S3 post without throwing', async () => {
    const refused = { createUpload: vi.fn().mockResolvedValue({ ok: false, status: 409, code: 'NOT_ACTIVE', message: 'Start the session first.', details: {} }) };
    expect(await uploadPhoto(refused, { kind: 'pickup', bookingId: 'b1' }, JPEG)).toEqual({ ok: false, reason: 'REFUSED', message: 'Start the session first.' });
    const api = { createUpload: vi.fn().mockResolvedValue(presigned) };
    expect((await uploadPhoto(api, { kind: 'arrival', bookingId: 'b1' }, JPEG, { fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 403 })) })).ok).toBe(false);
    expect((await uploadPhoto(api, { kind: 'arrival', bookingId: 'b1' }, 'data:image/png;base64,AAAA')).ok).toBe(false);
  });

  it('gives up after the 30 s budget', async () => {
    vi.useFakeTimers();
    const api = { createUpload: vi.fn(() => new Promise<never>(() => {})) };
    const pending = uploadPhoto(api, { kind: 'listing' }, JPEG);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toMatchObject({ ok: false, reason: 'TIMEOUT' });
  });

  it('decodes data URLs', () => {
    expect(dataUrlToBlob(JPEG)?.type).toBe('image/jpeg');
    expect(dataUrlToBlob('https://example.com/a.jpg')).toBeNull();
  });
});
