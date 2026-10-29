import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import HostBookings from '../components/HostBookings';
import { AutoGrid, Button, LinkButton, Photo, RouteBadges, StatusDot, WalkChip, WarnNote } from '../components/ui';
import { EV_MODELS } from '../data/evFallbackSeed';
import { stationToDestination } from '../data/destinations';
import { STATIONS } from '../data/stations';
import { computePrice } from '../engines/pricing';
import { summarizeDays } from '../lib/availability';
import { fmtHour, formatDataMonth, formatRateInput, money } from '../lib/format';
import { estimateWalk, haversineDistanceMeters } from '../lib/geo';
import { EDIT_LISTING_PATH, NEW_LISTING_PATH, SIGNUP_FOR_HOSTING_PATH } from '../lib/hostEntry';
import { useApp } from '../state/AppState';

const PRICE_CARS = ['toyota-prius-prime', 'nissan-leaf', 'tesla-my'].map((id) => EV_MODELS.find((c) => c.id === id)!);

export default function HostHome() {
  const navigate = useNavigate();
  const { user, hostListing: l, update, backend, syncAccount } = useApp();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

  /** Backend: take it out of search on the server (bookings already made can still finish). */
  async function remove() {
    if (!backend) {
      setConfirmRemove(false);
      return update({ hostListing: null });
    }
    setRemoving(true);
    setRemoveError('');
    const r = await backend.api.removeListing();
    if (!r.ok) {
      setRemoving(false);
      return setRemoveError(r.message);
    }
    update({ hostListing: null });
    await syncAccount();
    setRemoving(false);
    setConfirmRemove(false);
  }

  if (!user) return <Navigate to={SIGNUP_FOR_HOSTING_PATH} replace />;

  if (!l) {
    return (
      <div className="min-h-dvh bg-surface">
        <Header />
        <main className="mx-auto max-w-[960px] px-6 py-16">
          <div className="rounded-card border border-line bg-paper p-8 shadow-panel">
            <h1 className="text-[34px] font-semibold text-ink">No listing yet</h1>
            <p className="mt-2 text-[16px] text-body">List your charger to start earning from idle hours.</p>
            <LinkButton to={NEW_LISTING_PATH} size="lg" className="mt-6">
              List your charger
            </LinkButton>
          </div>
        </main>
      </div>
    );
  }

  const nearest = STATIONS.map((s) => ({ s, d: haversineDistanceMeters(l, s) })).sort((a, b) => a.d - b.d)[0];
  const walk = estimateWalk(nearest.d);
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <div className="min-h-dvh bg-surface">
      <Header />
      <main className="mx-auto flex max-w-[960px] flex-col gap-8 px-6 pb-16 pt-10">
        <div className="flex flex-col gap-2">
          <StatusDot>Live in search</StatusDot>
          <h1 className="text-[34px] font-semibold text-ink">You’re listed, {firstName}.</h1>
          <p className="text-[17px] text-body">Drivers heading to {nearest.s.name} can book your spot now.</p>
        </div>

        <section aria-label="Your listing" className="flex flex-wrap gap-5 rounded-card border border-line bg-paper p-4 shadow-panel">
          <Photo src={l.photos[0]} className="h-[176px] w-[176px] shrink-0 rounded-card" />
          <div className="flex min-w-[240px] flex-1 flex-col gap-2.5">
            <div>
              <h2 className="text-[22px] font-semibold text-ink">{l.title}</h2>
              <p className="text-[14px] text-muted">
                {l.privateAddress
                  ? `${l.privateAddress.line}${l.privateAddress.unit ? ` #${l.privateAddress.unit}` : ''}, ${l.privateAddress.city}, ${l.privateAddress.state} ${l.privateAddress.zip}`
                  : `${l.street}, ${l.neighborhood}`}
              </p>
              {l.privateAddress && <p className="text-[13px] text-muted">Drivers see only “{l.street}, {l.neighborhood}” until they book.</p>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <WalkChip minutes={walk.minutes} />
              <RouteBadges routes={nearest.s.routes} max={5} />
            </div>
            <p className="text-[15px] font-medium text-body">
              {l.level}, {l.chargerKw} kW, {l.plug}
              {l.adapters !== 'NONE' ? `, adapter to ${l.plug === 'J1772' ? 'NACS' : 'J1772'}` : ''}
              {l.solarKw > 0 ? `, ${l.solarKw} kW solar` : ''}
            </p>
            {l.rateSource && (
              <p className="text-[14px] text-body">
                Electricity rate: ${formatRateInput(l.rate)}/kWh ·{' '}
                {l.rateSource === 'EIA' && l.rateDataMonth
                  ? `Massachusetts residential average (EIA, ${formatDataMonth(l.rateDataMonth)}, estimate)`
                  : l.rateSource === 'HOST'
                    ? 'your own rate'
                    : 'fallback estimate'}
              </p>
            )}
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px] text-body">
              {l.windows.map((w) => (
                <li key={w.id}>
                  {summarizeDays(w.days)}, {fmtHour(w.start)} to {fmtHour(w.end)}
                  {w.end <= w.start ? ' (overnight)' : ''}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-label="What drivers pay">
          <AutoGrid min={260} gap={14}>
            {PRICE_CARS.map((car) => {
              const p = computePrice({
                charger_kW: l.chargerKw,
                car_max_AC_kW: car.maxAcKw,
                local_rate: l.rate,
                host_earnings_hr: l.earningsHr,
                booked_hours: 1,
              });
              return (
                <div key={car.id} className="rounded-card border border-line bg-paper p-5">
                  <p className="text-[15px] font-medium text-body">A {car.name} pays</p>
                  <p className="mt-1 text-[28px] font-semibold text-ink">{p.ok ? `${money(p.value.price_per_hr)}/hr` : 'Not set'}</p>
                  <p className="mt-1 text-[13px] text-muted">
                    You keep {money(l.earningsHr)} + {p.ok ? money(p.value.electricity_cost_per_hr) : 'the cost'} for power
                  </p>
                </div>
              );
            })}
          </AutoGrid>
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <Button
            size="lg"
            onClick={() => {
              update({ destination: stationToDestination(nearest.s) });
              navigate('/search');
            }}
          >
            See it in search
          </Button>
          <LinkButton to={EDIT_LISTING_PATH} variant="secondary" size="lg">
            Edit listing
          </LinkButton>
          <Button variant="ghost" size="lg" onClick={() => setConfirmRemove(true)} aria-expanded={confirmRemove}>
            Remove listing
          </Button>
        </div>

        {confirmRemove && (
          <div role="alertdialog" aria-label="Remove your listing" className="flex flex-col gap-3 rounded-card border border-amber-ink bg-amber-bg p-4">
            <p className="text-[15px] font-medium text-amber-deep">
              {backend
                ? `Remove “${l.title}” from search? Drivers can’t book it anymore. Bookings already made can still finish. You can list again later.`
                : `Remove “${l.title}” from search? Its details and photos are deleted from this browser. You can list again later, but you’ll start from scratch.`}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void remove()} disabled={removing}>
                {removing ? 'Removing…' : 'Remove listing'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                Keep it
              </Button>
            </div>
            {removeError && <WarnNote>{removeError}</WarnNote>}
          </div>
        )}

        {backend ? (
          <HostBookings backend={backend} />
        ) : (
          <p className="text-[14px] text-muted">
            Bookings from drivers show up here when the app is connected to the Dwell backend. Booking notifications aren’t part of this demo.
          </p>
        )}
      </main>
    </div>
  );
}
