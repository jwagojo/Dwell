import { fmtRange, money } from '../lib/format';
import { useApp } from '../state/AppState';
import { StatusDot, LinkButton } from './ui';

function dayLabel(dayStart: number): string {
  const d = new Date(dayStart);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * The signed-in driver's booking that is still going (reserved or charging), shown at the top of the home page.
 * Finished sessions are not shown here. Renders nothing when there is no active booking.
 */
export default function ActiveBookingBanner() {
  const { user, booking, listings } = useApp();
  if (!user || !booking || booking.status === 'COMPLETED') return null;
  const listing = listings.find((l) => l.id === booking.listingId);
  if (!listing) return null;

  return (
    <section aria-label="Your active booking" className="border-b border-line bg-brand-wash">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-4 sm:px-8">
        <div className="flex min-w-0 flex-col gap-0.5">
          <StatusDot>{booking.status === 'ACTIVE' ? 'Charging now' : 'Reserved'}</StatusDot>
          <p className="text-[17px] font-semibold text-ink">{listing.title}</p>
          <p className="text-[15px] text-body">
            {dayLabel(booking.dayStart)}, {fmtRange(booking.startHour, booking.hours)}, {booking.carName}. Total {money(booking.total)}.
          </p>
        </div>
        <LinkButton to="/session" size="md">
          Open session
        </LinkButton>
      </div>
    </section>
  );
}
