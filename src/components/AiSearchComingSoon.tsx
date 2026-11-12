import { Sparkle } from './Icons';

/**
 * Placeholder for natural-language search, in the top-left corner of the map (render it inside a `relative` map
 * container). It is plain text, not a control, until the feature exists.
 */
export default function AiSearchComingSoon() {
  return (
    <p className="absolute left-3 top-3 z-30 inline-flex h-11 max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-line-strong bg-paper px-4 text-[15px] font-semibold text-ink shadow-panel">
      <span className="text-brand"><Sparkle size={18} /></span>
      AI search coming soon
    </p>
  );
}
