import { useEffect, useState } from 'react';
import type { HostBooking } from '../adapters/dwellApi';
import { isReservationExpired } from '../features/session/bookingGuard';
import { accruedLateFee, bookedEndTs } from '../features/session/settleBooking';
import { fmtClock, fmtRange, money } from '../lib/format';
import type { DwellBackend } from '../state/backend';
import { StatusDot, WarnNote } from './ui';

const dayLabel = (dayStart: number) => new Date(dayStart).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

function statusOf(h: HostBooking, now: number): { label: string; tone: 'green' | 'muted' } {
  const b = h.booking;
  if (b.status === 'COMPLETED') return { label: 'Picked up', tone: 'muted' };
  if (b.status === 'ACTIVE') return { label: 'Charging now', tone: 'green' };
  return isReservationExpired(b, now) ? { label: 'Ended without check-in', tone: 'muted' } : { label: 'Reserved', tone: 'green' };
}

/**
 * Backend mode: bookings on the host's listing (tasks.md 19.2). Shows each driver's first name, the window, totals and
 * photos, a "Needs review" badge for pickups completed without a location check (Req 5.7), and how late a running
 * session is with the late fee so far.
 */
export default function HostBookings({ backend }: { backend: DwellBackend }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; items: HostBooking[] }>({ kind: 'loading' });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    void backend.api.listHostBookings().then((r) => {
      if (!cancelled) setState(r.ok ? { kind: 'ok', items: r.data.bookings } : { kind: 'error', message: r.message });
    });
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [backend]);

  return (
    <section aria-labelledby="host-bookings" className="flex flex-col gap-3">
      <h2 id="host-bookings" className="text-[22px] font-semibold text-ink">Bookings</h2>
      {state.kind === 'loading' && <p className="text-[15px] text-muted">Loading bookings…</p>}
      {state.kind === 'error' && <WarnNote>{state.message}</WarnNote>}
      {state.kind === 'ok' && state.items.length === 0 && <p className="text-[15px] text-muted">No bookings yet. They show up here as soon as a driver books.</p>}
      {state.kind === 'ok' &&
        state.items.map((h) => {
          const b = h.booking;
          const status = statusOf(h, now);
          const late = b.status === 'ACTIVE' ? accruedLateFee(b, now) : null;
          const flagged = b.result?.flagged ?? false;
          return (
            <article key={b.id} className="flex flex-col gap-2 rounded-card border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusDot tone={status.tone}>{status.label}</StatusDot>
                {flagged && <span className="rounded-full bg-amber-bg px-3 py-1 text-[13px] font-semibold text-amber-deep">Needs review: picked up without a location check</span>}
              </div>
              <p className="text-[16px] font-semibold text-ink">
                {h.driverName}, {dayLabel(b.dayStart)}, {fmtRange(b.startHour, b.hours)}
              </p>
              <p className="text-[14px] text-body">
                {b.carName}, {b.pEff} kW. {b.result ? `Total ${money(b.result.total)}, picked up at ${fmtClock(b.result.pickupAt)}` : `Booked total ${money(b.total)}`}.
              </p>
              {late && late.lateMinutes > 0 && (
                <p className="text-[14px] font-medium text-amber-deep" role="status">
                  Driver is {late.lateMinutes} min late (booking ended {fmtClock(bookedEndTs(b))}). Late fee so far {money(late.lateFee)}.
                </p>
              )}
              {(b.arrivalPhoto || b.pickupPhoto) && (
                <div className="flex flex-wrap gap-3">
                  {[
                    { src: b.arrivalPhoto, label: 'Arrival photo' },
                    { src: b.pickupPhoto, label: 'Pickup photo' },
                  ]
                    .filter((p): p is { src: string; label: string } => Boolean(p.src))
                    .map((p) => (
                      <figure key={p.label} className="m-0 flex flex-col gap-1">
                        <a href={p.src} target="_blank" rel="noreferrer">
                          <img src={p.src} alt={`${p.label} from ${h.driverName}`} className="h-20 w-28 rounded-card object-cover" />
                        </a>
                        <figcaption className="text-[12px] font-medium text-muted">{p.label}</figcaption>
                      </figure>
                    ))}
                </div>
              )}
            </article>
          );
        })}
    </section>
  );
}
