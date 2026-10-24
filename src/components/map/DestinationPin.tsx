import { LINE_STYLES } from '../../data/transit';
import type { Destination } from '../../types/destination';
import { Pin } from '../Icons';

/**
 * Destination marker visual, distinct from price pills: a round "T" in the line color for stations,
 * a brand-colored location glyph for addresses. The circle is the anchor; the label hangs below it.
 */
export default function DestinationPin({ destination }: { destination: Destination }) {
  const isStation = destination.kind === 'station';
  return (
    <div className="pointer-events-none relative h-[34px] w-[34px]" data-testid="destination-pin" data-kind={destination.kind}>
      <span
        className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-[3px] border-paper text-[15px] font-semibold text-on-ink shadow-pin"
        style={{ background: isStation && destination.primary ? LINE_STYLES[destination.primary].stroke : 'var(--color-brand)' }}
        aria-hidden="true"
      >
        {isStation ? 'T' : <Pin size={17} />}
      </span>
      <span className="absolute left-1/2 top-full mt-1 max-w-[220px] -translate-x-1/2 truncate whitespace-nowrap rounded-card bg-paper px-2 py-0.5 text-[13px] font-semibold text-ink shadow-pin">
        {destination.label}
      </span>
    </div>
  );
}
