import type { DwellApi } from '../adapters/dwellApi';

/**
 * The one photo upload for listing, arrival and pickup photos (tasks.md 15.1, Req 1.4, 5.2). The API issues a
 * presigned POST for one exact key; the photo then goes straight to the private S3 bucket. 30 s budget for the
 * whole exchange. Never throws, and the caller's state only moves on with `ok: true`.
 */

export const UPLOAD_TIMEOUT_MS = 30_000;

export type UploadResult = { ok: true; key: string } | { ok: false; reason: 'TIMEOUT' | 'REFUSED' | 'FAILED'; message: string };

/** A data URL ("data:image/jpeg;base64,...") as a Blob, without fetch, so it works the same everywhere. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
}

export interface UploadDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function uploadPhoto(
  api: Pick<DwellApi, 'createUpload'>,
  target: { kind: 'listing' | 'arrival' | 'pickup'; bookingId?: string },
  dataUrl: string,
  deps: UploadDeps = {},
): Promise<UploadResult> {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob || blob.type !== 'image/jpeg') return { ok: false, reason: 'FAILED', message: 'That photo couldn’t be read. Take it again.' };

  const timeoutMs = deps.timeoutMs ?? UPLOAD_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const timeout = new Promise<UploadResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, reason: 'TIMEOUT', message: `The upload took longer than ${timeoutMs / 1000} seconds. Try again.` });
    }, timeoutMs);
  });

  const attempt = (async (): Promise<UploadResult> => {
    const presign = await api.createUpload(target);
    if (!presign.ok) return { ok: false, reason: 'REFUSED', message: presign.message };
    const { url, fields, key, maxBytes } = presign.data.upload;
    if (blob.size > maxBytes) return { ok: false, reason: 'FAILED', message: 'That photo is too large. Take it again.' };
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('file', blob); // S3 requires the file to be the last field
    try {
      const res = await (deps.fetchImpl ?? fetch)(url, { method: 'POST', body: form, signal: controller.signal });
      return res.ok ? { ok: true, key } : { ok: false, reason: 'FAILED', message: 'The photo didn’t upload. Try again.' };
    } catch {
      return { ok: false, reason: 'FAILED', message: 'The photo didn’t upload. Check your connection and try again.' };
    }
  })();

  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
