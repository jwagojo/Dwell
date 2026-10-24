import { useId, useState } from 'react';
import { fileToDataUrl } from '../lib/image';
import { Camera } from './Icons';

/**
 * Arrival / pickup photo (spec §4.12). Dashed box until a photo exists, then green with a thumbnail.
 * Prototype: the photo stays in the browser. S3 upload arrives with the unified upload flow (tasks.md 15.1).
 */
export default function PhotoCapture({
  title,
  reason,
  savedTitle,
  value,
  onChange,
}: {
  title: string;
  reason: string;
  savedTitle: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const id = useId();
  const [error, setError] = useState('');

  async function handle(file: File | undefined) {
    if (!file) return;
    try {
      setError('');
      onChange(await fileToDataUrl(file, 640));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that photo');
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`flex flex-wrap items-center gap-4 rounded-2xl border-2 p-4 ${
          value ? 'border-green bg-green-bg' : 'border-dashed border-line-strong bg-white'
        }`}
      >
        {value ? (
          <img src={value} alt="Your saved photo" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface text-muted">
            <Camera size={26} />
          </span>
        )}
        <div className="min-w-[200px] flex-1">
          <div className="text-[16px] font-extrabold text-ink">{value ? savedTitle : title}</div>
          <p className="text-[14px] text-body">{reason}</p>
        </div>
        <label
          htmlFor={id}
          className="inline-flex h-12 cursor-pointer items-center justify-center rounded-xl border border-line-strong bg-white px-5 text-[16px] font-bold text-ink focus-within:outline-2 hover:border-brand"
        >
          {value ? 'Retake' : 'Open camera'}
          <input
            id={id}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              void handle(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-amber-ink">
          {error}
        </p>
      )}
    </div>
  );
}
