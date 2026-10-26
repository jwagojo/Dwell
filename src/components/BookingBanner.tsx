import { isBookingLive, isReservationExpired } from '../features/session/bookingGuard';
import { bookedEndTs } from '../features/session/settleBooking';
import { fmtClock, fmtRange, money } from '../lib/format';
import { useApp } from '../state/AppState';
import { Button, LinkButton, StatusDot } from './ui';

function dayLabel(dayStart: number): string {
  const d = new Date(dayStart);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * The signed-in driver's booking, at the top of the home page:
 * - reserved or charging: what it is, and "Open session";
 * - finished: the last trip, with "View receipt" (the only way back to a receipt);
 * - a reservation whose window passed without a check-in: says so.
 * The last two can be dismissed, which forgets the booking. Renders nothing when there is no booking.
 */
export default function BookingBanner() {
  const { user, booking, listings, update } = useApp();
  if (!user || !booking) return null;
  const listing = listings.find((l) => l.id === booking.listingId);
  if (!listing) return null;

  const now = Date.now();
  const live = isBookingLive(booking, now);
  const expired = isReservationExpired(booking, now);
  const when = `${dayLabel(booking.dayStart)}, ${fmtRange(booking.startHour, booking.hours)}`;

  let status: string;
  let detail: string;
  if (live) {
    status = booking.status === 'ACTIVE' ? 'Charging now' : 'Reserved';
    detail = `${when}, ${booking.carName}. Total ${money(booking.total)}.`;
  } else if (expired) {
    status = 'Reservation ended';
    detail = `${when}. The window ended at ${fmtClock(bookedEndTs(booking))} without a check-in, so no session started.`;
  } else {
    status = 'Last trip';
    const r = booking.result;
    detail = r ? `${when}. Picked up at ${fmtClock(r.pickupAt)}. Total ${money(r.total)}.` : `${when}.`;
  }

  return (
    <section aria-label={live ? 'Your active booking' : 'Your last booking'} className={`border-b border-line ${live ? 'bg-brand-wash' : 'bg-surface'}`}>
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-4 sm:px-8">
        <div className="flex min-w-0 flex-col gap-0.5">
          <StatusDot tone={live ? 'green' : 'muted'}>{status}</StatusDot>
          <p className="text-[17px] font-semibold text-ink">{listing.title}</p>
          <p className="text-[15px] text-body">{detail}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!live && (
            <Button variant="ghost" size="md" onClick={() => update({ booking: null })}>
              Dismiss
            </Button>
          )}
          {live ? (
            <LinkButton to="/session" size="md">
              Open session
            </LinkButton>
          ) : expired ? (
            <LinkButton to="/search" variant="secondary" size="md">
              Find parking
            </LinkButton>
          ) : (
            <LinkButton to="/session" variant="secondary" size="md">
              View receipt
            </LinkButton>
          )}
        </div>
      </div>
    </section>
  );
}
