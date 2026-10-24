import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Header from '../components/Header';
import PhotoCapture from '../components/PhotoCapture';
import { AutoGrid, Button, LinkButton, PaidPill, Photo, Segmented, StatTile, StatusDot } from '../components/ui';
import { lateRatePerMinute } from '../engines/billing';
import { MILES_PER_KWH, PICKUP_RADIUS_M, SERVICE_FEE } from '../engines/constants';
import { bookedEndTs, bookedStartTs, settleBooking } from '../features/session/settleBooking';
import { fmtClock, fmtDuration, fmtRange, money } from '../lib/format';
import { haversineDistanceMeters, offsetNorth, type LatLng } from '../lib/geo';
import { useApp } from '../state/AppState';

type Step = 'arrived' | 'charging' | 'pickup' | 'done';
type ClockMode = 'early' | 'ontime' | 'late' | 'real';
type PhoneMode = 'car' | 'far' | 'gps';
type Loc =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; meters: number }
  | { kind: 'far'; meters: number }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

const STEPS: { id: Step; label: string }[] = [
  { id: 'arrived', label: 'Arrived' },
  { id: 'charging', label: 'Charging' },
  { id: 'pickup', label: 'Pickup' },
  { id: 'done', label: 'Done' },
];

const card = 'flex flex-col gap-5 rounded-2xl border border-line bg-white p-6';

export default function Session() {
  const { user, booking, listings, update } = useApp();
  const [pickupStage, setPickupStage] = useState(false);
  const [clock, setClock] = useState<ClockMode>('early');
  const [phone, setPhone] = useState<PhoneMode>('car');
  const [loc, setLoc] = useState<Loc>({ kind: 'idle' });
  const [arrivalPhoto, setArrivalPhoto] = useState<string | null>(null);
  const [pickupPhoto, setPickupPhoto] = useState<string | null>(null);
  const [msgNote, setMsgNote] = useState(false);
  const [, setTick] = useState(0);
  const timer = useRef<number>(0);

  // The real clock moves; re-render every 30 s while it is selected.
  useEffect(() => {
    if (clock !== 'real') return;
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [clock]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!user) return <Navigate to="/signup/driver" replace />;

  const listing = booking ? listings.find((l) => l.id === booking.listingId) : undefined;
  if (!booking || !listing) {
    return (
      <div className="min-h-screen bg-surface">
        <Header />
        <main className="mx-auto max-w-[1120px] px-6 py-16">
          <div className={card}>
            <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-ink">No active booking</h1>
            <p className="text-[16px] text-body">Book a charger and your session will show up here.</p>
            <LinkButton to="/search" size="lg" className="w-fit">
              Find parking
            </LinkButton>
          </div>
        </main>
      </div>
    );
  }

  const b = booking;
  const endTs = bookedEndTs(b);
  const startTs = bookedStartTs(b);
  const nowTs = { early: endTs - 30 * 60_000, ontime: endTs, late: endTs + 25 * 60_000, real: Date.now() }[clock];
  const step: Step = b.status === 'COMPLETED' ? 'done' : b.status === 'RESERVED' ? 'arrived' : pickupStage ? 'pickup' : 'charging';
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const minutesLeft = Math.round((endTs - nowTs) / 60_000);
  const progress = Math.min(Math.max((nowTs - startTs) / (endTs - startTs), 0), 1);
  const estMiles = Math.round(b.pEff * b.hours * MILES_PER_KWH);
  const milesSoFar = Math.round(estMiles * progress);
  const locOk = loc.kind === 'ok' || loc.kind === 'denied';

  function jump(to: Step) {
    setLoc({ kind: 'idle' });
    if (to === 'arrived') {
      setPickupStage(false);
      update({ booking: { ...b, status: 'RESERVED', result: undefined } });
    } else if (to === 'charging' || to === 'pickup') {
      setPickupStage(to === 'pickup');
      update({ booking: { ...b, status: 'ACTIVE', result: undefined } });
    } else {
      finish(false);
    }
  }

  function finish(flagged: boolean) {
    const result = settleBooking(b, listing!, nowTs, flagged);
    if (!result) return;
    update({ booking: { ...b, status: 'COMPLETED', result } });
    setPickupStage(false);
    window.scrollTo({ top: 0 });
  }

  function checkLocation() {
    window.clearTimeout(timer.current);
    setLoc({ kind: 'checking' });
    const evaluate = (pos: LatLng) => {
      const d = Math.round(haversineDistanceMeters(pos, listing!));
      setLoc(d <= PICKUP_RADIUS_M ? { kind: 'ok', meters: d } : { kind: 'far', meters: d });
    };
    if (phone === 'gps') {
      if (!navigator.geolocation) return setLoc({ kind: 'denied' });
      navigator.geolocation.getCurrentPosition(
        (p) => evaluate({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (err) => setLoc(err.code === err.PERMISSION_DENIED ? { kind: 'denied' } : { kind: 'unavailable' }),
        { timeout: 30_000, enableHighAccuracy: true },
      );
      return;
    }
    timer.current = window.setTimeout(() => evaluate(offsetNorth(listing!, phone === 'car' ? 18 : 420)), 600);
  }

  /* ---------- Step bodies ---------- */

  const arrived = (
    <div className={card}>
      <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-ink">You’ve arrived</h1>
      {listing.privateAddress && (
        <p className="text-[15px] font-semibold text-ink">
          Address: {listing.privateAddress.line}
          {listing.privateAddress.unit ? ` #${listing.privateAddress.unit}` : ''}, {listing.privateAddress.city}, {listing.privateAddress.state} {listing.privateAddress.zip}
        </p>
      )}
      <p className="max-w-[640px] text-[16px] leading-[1.6] text-body">{listing.instructions}</p>
      <div className="grid grid-cols-3 gap-2">
        {['Street view', 'Charger', 'Your spot'].map((label, i) => (
          <Photo key={label} src={listing.photos[i]} index={i} label={label} className="h-24 rounded-xl" />
        ))}
      </div>
      <PhotoCapture
        title="Take an arrival photo"
        reason="It shows the spot and charger as you found them, for you and the host."
        savedTitle="Arrival photo saved"
        value={arrivalPhoto}
        onChange={setArrivalPhoto}
      />
      <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[15px] text-body">
        <li>Set your charge limit in your car’s app.</li>
        <li>Plug in and check the car shows it’s charging.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg" disabled={!arrivalPhoto} onClick={() => update({ booking: { ...b, status: 'ACTIVE' } })}>
          I’m plugged in. Start session
        </Button>
        {!arrivalPhoto && <p className="text-[14px] text-muted">Add your arrival photo to start.</p>}
      </div>
    </div>
  );

  const charging = (
    <div className={card}>
      <StatusDot>Charging</StatusDot>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[44px] font-extrabold leading-none tracking-[-0.03em] text-ink">
            {minutesLeft >= 0 ? `${fmtDuration(minutesLeft)} left` : `${Math.abs(minutesLeft)} min late`}
          </h1>
          <p className={`mt-2 text-[15px] ${minutesLeft < 0 ? 'font-semibold text-amber-ink' : 'text-body'}`}>
            Booking ends {fmtClock(endTs)}. After that, {money(lateRatePerMinute(b.pricePerHr))}/min.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[13px] font-bold text-muted">Estimated miles added so far</p>
          <p className="text-[22px] font-extrabold text-ink">
            +{milesSoFar} <span className="text-[15px] font-semibold text-muted">of +{estMiles} mi</span>
          </p>
        </div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-chip" role="progressbar" aria-label="Booking time used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => setPickupStage(true)}>
          I’m back at the car. Pick up
        </Button>
        <Button variant="secondary" size="lg" onClick={() => setMsgNote(true)}>
          Message host
        </Button>
      </div>
      {msgNote && (
        <p role="status" className="text-[14px] text-muted">
          Messaging isn’t part of this demo.
        </p>
      )}
    </div>
  );

  const panelBase = 'flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4';
  const pickup = (
    <div className={card}>
      <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-ink">Pick up your car</h1>
      <div aria-live="polite">
        {loc.kind === 'idle' && (
          <div className={`${panelBase} bg-surface`}>
            <p className="text-[16px] font-bold text-ink">Check that you are at the car</p>
            <Button variant="secondary" onClick={checkLocation}>Check location</Button>
          </div>
        )}
        {loc.kind === 'checking' && (
          <div className={`${panelBase} bg-surface`}>
            <p className="text-[16px] font-bold text-ink">Checking your location…</p>
          </div>
        )}
        {loc.kind === 'ok' && (
          <div className={`${panelBase} bg-green-bg`}>
            <div>
              <p className="text-[16px] font-extrabold text-green-ink">You’re at the car · {loc.meters} m away</p>
              <p className="text-[14px] text-green-ink">Within the {PICKUP_RADIUS_M} m pickup radius.</p>
            </div>
          </div>
        )}
        {loc.kind === 'far' && (
          <div className={`${panelBase} bg-amber-bg`}>
            <div>
              <p className="text-[16px] font-extrabold text-amber-deep">You’re {loc.meters} m from the car</p>
              <p className="text-[14px] text-amber-ink">Pickup unlocks within {PICKUP_RADIUS_M} m. Late minutes keep counting.</p>
            </div>
            <Button variant="secondary" onClick={checkLocation}>Try again</Button>
          </div>
        )}
        {loc.kind === 'denied' && (
          <div className={`${panelBase} bg-amber-bg`}>
            <div>
              <p className="text-[16px] font-extrabold text-amber-deep">Location unavailable</p>
              <p className="text-[14px] text-amber-ink">You can still pick up with a photo. The host reviews it.</p>
            </div>
          </div>
        )}
        {loc.kind === 'unavailable' && (
          <div className={`${panelBase} bg-amber-bg`}>
            <div>
              <p className="text-[16px] font-extrabold text-amber-deep">We couldn’t get your location in time</p>
              <p className="text-[14px] text-amber-ink">Try again. Your session stays open until you pick up.</p>
            </div>
            <Button variant="secondary" onClick={checkLocation}>Try again</Button>
          </div>
        )}
      </div>
      <PhotoCapture
        title="Take a pickup photo"
        reason="It shows the spot as you left it."
        savedTitle="Pickup photo saved"
        value={pickupPhoto}
        onChange={setPickupPhoto}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg" disabled={!locOk || !pickupPhoto} onClick={() => finish(loc.kind === 'denied')}>
          Confirm Pickup at {fmtClock(nowTs)}
        </Button>
        {(!locOk || !pickupPhoto) && (
          <p className="text-[14px] text-muted">
            {!locOk ? `Check your location first (within ${PICKUP_RADIUS_M} m of the car).` : 'Add your pickup photo.'}
          </p>
        )}
      </div>
      <p className="text-[13px] text-muted">If location is blocked on your phone, you can still pick up with a photo and the host reviews it.</p>
    </div>
  );

  const r = b.result;
  const done = r && (
    <div className={card}>
      <p className="text-[14px] font-bold text-green-ink">
        Picked up at {fmtClock(r.pickupAt)}
        {r.flagged ? ' · flagged for host review' : ''}
      </p>
      <h1 className="-mt-3 text-[28px] font-extrabold tracking-[-0.02em] text-ink">Trip complete</h1>
      <dl className="m-0 flex max-w-[480px] flex-col gap-2.5 text-[15px] text-body">
        <div className="flex justify-between gap-3">
          <dt>{money(b.pricePerHr)} × {b.hours} h</dt>
          <dd className="m-0 font-bold text-ink">{money(r.subtotal)}</dd>
        </div>
        {r.lateMinutes > 0 && (
          <div className="flex justify-between gap-3 text-amber-ink">
            <dt>Late · {r.lateMinutes} min</dt>
            <dd className="m-0 font-bold">{money(r.lateFee)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt>Service fee ({Math.round(SERVICE_FEE * 100)}%)</dt>
          <dd className="m-0 font-bold text-ink">{money(r.serviceFee)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-line pt-3 text-[17px] font-extrabold text-ink">
          <dt>Total</dt>
          <dd className="m-0">{money(r.total)}</dd>
        </div>
      </dl>
      <AutoGrid min={170} gap={12}>
        <StatTile big label="Estimated miles added" value={`+${Math.round(r.milesAdded)} mi`} />
        <StatTile big label="Solar share" value={r.solarShare !== null ? `${Math.round(r.solarShare * 100)}%` : 'Unavailable'} />
        <StatTile big label="CO₂ vs. gas" value={r.co2Kg !== null ? `${r.co2Kg.toFixed(1)} kg` : 'Unavailable'} />
        <StatTile big tone="green" label="Green Score" value={r.greenScore !== null ? r.greenScore.toFixed(2) : 'Unavailable'} />
      </AutoGrid>
      <LinkButton to="/search" size="lg" className="w-fit">
        Book another charger
      </LinkButton>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="mx-auto flex max-w-[1120px] flex-wrap items-start gap-8 px-6 pb-16 pt-8">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <ol className="m-0 grid list-none grid-cols-4 gap-2 p-0" aria-label="Session progress">
            {STEPS.map((s, i) => (
              <li key={s.id} aria-current={i === stepIndex ? 'step' : undefined}>
                <div className={`h-1.5 rounded-full ${i <= stepIndex ? 'bg-brand' : 'bg-pill'}`} />
                <span className={`mt-2 block text-[14px] font-bold ${i <= stepIndex ? 'text-ink' : 'text-muted'}`}>{s.label}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-white p-4">
            <Photo src={listing.photos[0]} className="h-14 w-14 shrink-0 rounded-xl" />
            <div className="min-w-[200px] flex-1">
              <p className="text-[17px] font-extrabold text-ink">{listing.title}</p>
              <p className="text-[14px] text-muted">
                {fmtRange(b.startHour, b.hours, ' – ')} · {b.carName} · {b.pEff} kW draw
              </p>
            </div>
            <PaidPill amount={money(b.total)} />
          </div>

          {step === 'arrived' && arrived}
          {step === 'charging' && charging}
          {step === 'pickup' && pickup}
          {step === 'done' && done}
        </div>

        <aside
          aria-label="Demo controls"
          className="flex min-w-0 flex-[1_1_260px] flex-col gap-4 rounded-2xl border-2 border-dashed border-disabled bg-white p-4"
        >
          <p className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-muted">Demo controls</p>
          <Segmented<Step>
            label="Jump to step"
            value={step}
            onChange={jump}
            options={STEPS.map((s) => ({ value: s.id, label: s.label }))}
          />
          <Segmented<ClockMode>
            label="Clock at pickup"
            value={clock}
            onChange={setClock}
            options={[
              { value: 'early', label: '30 min early' },
              { value: 'ontime', label: 'On time' },
              { value: 'late', label: '25 min late' },
              { value: 'real', label: 'Real clock' },
            ]}
          />
          <Segmented<PhoneMode>
            label="Phone location"
            value={phone}
            onChange={(m) => {
              setPhone(m);
              setLoc({ kind: 'idle' });
            }}
            options={[
              { value: 'car', label: 'At the car' },
              { value: 'far', label: '420 m away' },
              { value: 'gps', label: 'Real GPS' },
            ]}
          />
        </aside>
      </main>
    </div>
  );
}
