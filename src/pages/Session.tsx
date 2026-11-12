import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { locateExact } from '../adapters/geolocation';
import Header from '../components/Header';
import PhotoCapture from '../components/PhotoCapture';
import { AutoGrid, Button, LinkButton, PaidPill, Photo, Segmented, StatTile, StatusDot, WarnNote } from '../components/ui';
import { lateRatePerMinute } from '../engines/billing';
import { MILES_PER_KWH, PICKUP_RADIUS_M, SERVICE_FEE } from '../engines/constants';
import { isReservationExpired } from '../features/session/bookingGuard';
import { checkPickupDistance } from '../features/session/pickup';
import { accruedLateFee, bookedEndTs, bookedStartTs, settleBooking } from '../features/session/settleBooking';
import { fmtClock, fmtDuration, fmtRange, money } from '../lib/format';
import { haversineDistanceMeters, offsetNorth, type LatLng } from '../lib/geo';
import { uploadPhoto } from '../lib/upload';
import { localDate, windowIrradiance } from '../lib/openMeteo';
import { useApp } from '../state/AppState';
import { useSunlight } from '../state/useLiveData';

type Step = 'arrived' | 'charging' | 'pickup' | 'done';
type ClockMode = 'early' | 'ontime' | 'late' | 'real';
type PhoneMode = 'car' | 'far' | 'gps';
type Loc =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; meters: number; pos: LatLng }
  | { kind: 'far'; meters: number }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

const STEPS: { id: Step; label: string }[] = [
  { id: 'arrived', label: 'Arrived' },
  { id: 'charging', label: 'Charging' },
  { id: 'pickup', label: 'Pickup' },
  { id: 'done', label: 'Done' },
];

const card = 'flex flex-col gap-5 rounded-card border border-line bg-paper p-6';

export default function Session() {
  const { user, booking, listings, update, backend, applyBooking } = useApp();
  // Backend: the server's clock settles the bill, so the page shows the real time too.
  const [clock, setClock] = useState<ClockMode>(backend ? 'real' : 'early');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [phone, setPhone] = useState<PhoneMode>('car');
  // The location check is never kept: after a reload the driver checks again, which is what the geofence needs.
  const [loc, setLoc] = useState<Loc>({ kind: 'idle' });
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
  // Prototype receipts are settled here, with real sunlight for the booked hours (the backend settles its own).
  const sessionListing = booking ? listings.find((l) => l.id === booking.listingId) : undefined;
  const { series } = useSunlight(backend ? null : (sessionListing ?? null));

  if (!user) return <Navigate to="/signup" replace />;

  const listing = booking ? listings.find((l) => l.id === booking.listingId) : undefined;
  if (!booking || !listing) {
    return (
      <div className="min-h-dvh bg-surface">
        <Header />
        <main className="mx-auto max-w-[1120px] px-6 py-16">
          <div className={card}>
            <h1 className="text-[28px] font-semibold text-ink">No active booking</h1>
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

  // A reservation whose window passed without a check-in. Nothing to run, and nothing is charged.
  if (isReservationExpired(b, Date.now())) {
    return (
      <div className="min-h-dvh bg-surface">
        <Header />
        <main className="mx-auto max-w-[1120px] px-6 py-16">
          <div className={card}>
            <h1 className="text-[28px] font-semibold text-ink">This reservation has ended</h1>
            <p className="text-[16px] text-body">
              {listing.title}, {fmtRange(b.startHour, b.hours)}. The window ended at {fmtClock(bookedEndTs(b))} without a check-in, so no session started.
            </p>
            <div className="flex flex-wrap gap-3">
              <LinkButton to="/search" size="lg">
                Find parking
              </LinkButton>
              <Button variant="secondary" size="lg" onClick={() => update({ booking: null })}>
                Dismiss
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Photos and the pickup step live on the booking, so a reload in the middle of a session loses nothing.
  const pickupStage = b.pickupStarted ?? false;
  const arrivalPhoto = b.arrivalPhoto ?? null;
  const pickupPhoto = b.pickupPhoto ?? null;
  const setPickupStage = (started: boolean) => update({ booking: { ...b, pickupStarted: started } });
  /** Backend: a photo counts only once it is in S3 (Req 5.2); a failed upload keeps the step and offers a retry. */
  async function savePhoto(kind: 'arrival' | 'pickup', photo: string | null) {
    const field = kind === 'arrival' ? 'arrivalPhoto' : 'pickupPhoto';
    setActionError('');
    if (!backend || photo === null) return update({ booking: { ...b, [field]: photo } });
    setBusy(true);
    const r = await uploadPhoto(backend.api, { kind, bookingId: b.id }, photo);
    setBusy(false);
    if (!r.ok) return setActionError(r.message);
    update({ booking: { ...b, [field]: photo } });
  }
  const setArrivalPhoto = (photo: string | null) => void savePhoto('arrival', photo);
  const setPickupPhoto = (photo: string | null) => void savePhoto('pickup', photo);

  async function startSession() {
    if (!backend) return update({ booking: { ...b, status: 'ACTIVE' } });
    setBusy(true);
    setActionError('');
    const r = await backend.api.checkIn(b.id);
    setBusy(false);
    if (!r.ok) return setActionError(r.message);
    applyBooking(r.data.booking);
  }

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
  const late = accruedLateFee(b, nowTs);

  // One update per action: separate updates built from the same `b` would overwrite each other.
  function jump(to: Step) {
    setLoc({ kind: 'idle' });
    if (to === 'arrived') {
      update({ booking: { ...b, status: 'RESERVED', result: undefined, pickupStarted: false } });
    } else if (to === 'charging' || to === 'pickup') {
      update({ booking: { ...b, status: 'ACTIVE', result: undefined, pickupStarted: to === 'pickup' } });
    } else {
      finish(false);
    }
  }

  async function finish(flagged: boolean) {
    if (backend) return finishOnServer(flagged);
    const irradiance = series ? windowIrradiance(series, localDate(b.dayStart), b.startHour, b.hours) : null;
    const result = settleBooking(b, listing!, nowTs, flagged, irradiance);
    if (!result) return;
    update({ booking: { ...b, status: 'COMPLETED', result, pickupStarted: false } });
    window.scrollTo({ top: 0 });
  }

  /** Backend: the server rechecks the 50 m geofence and settles with its own clock. */
  async function finishOnServer(flagged: boolean) {
    const position = !flagged && loc.kind === 'ok' ? loc.pos : null;
    setBusy(true);
    setActionError('');
    const r = await backend!.api.pickup(b.id, position);
    setBusy(false);
    if (!r.ok) {
      if (r.code === 'TOO_FAR' && typeof r.details.metersShown === 'number') return setLoc({ kind: 'far', meters: r.details.metersShown });
      return setActionError(r.message);
    }
    applyBooking(r.data.booking);
    window.scrollTo({ top: 0 });
  }

  function checkLocation() {
    window.clearTimeout(timer.current);
    setLoc({ kind: 'checking' });
    const evaluate = (pos: LatLng) => {
      // Exact distance for the check; the rounded number is only for display.
      const { ok, metersShown } = checkPickupDistance(haversineDistanceMeters(pos, listing!));
      setLoc(ok ? { kind: 'ok', meters: metersShown, pos } : { kind: 'far', meters: metersShown });
    };
    if (phone === 'gps') {
      // Exact, fresh fix (never the rounded Near me position): the 50 m check needs the real distance.
      void locateExact().then((r) => {
        if (r.ok) evaluate({ lat: r.lat, lng: r.lng });
        else setLoc(r.reason === 'DENIED' || r.reason === 'UNSUPPORTED' ? { kind: 'denied' } : { kind: 'unavailable' });
      });
      return;
    }
    timer.current = window.setTimeout(() => evaluate(offsetNorth(listing!, phone === 'car' ? 18 : 420)), 600);
  }

  /* ---------- Step bodies ---------- */

  const arrived = (
    <div className={card}>
      <h1 className="text-[28px] font-semibold text-ink">You’ve arrived</h1>
      {listing.privateAddress && (
        <p className="text-[15px] font-medium text-ink">
          Address: {listing.privateAddress.line}
          {listing.privateAddress.unit ? ` #${listing.privateAddress.unit}` : ''}, {listing.privateAddress.city}, {listing.privateAddress.state} {listing.privateAddress.zip}
        </p>
      )}
      <p className="max-w-[640px] text-[16px] leading-[1.6] text-body">{listing.instructions}</p>
      <div className="grid grid-cols-3 gap-2">
        {['Street view', 'Charger', 'Your spot'].map((label, i) => (
          <Photo key={label} src={listing.photos[i]} index={i} label={label} className="h-24 rounded-card" />
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
        <Button size="lg" disabled={!arrivalPhoto || busy} onClick={() => void startSession()}>
          {busy ? 'Saving…' : 'I’m plugged in. Start session'}
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
          <h1 className="text-[44px] font-semibold leading-none text-ink">
            {minutesLeft >= 0 ? `${fmtDuration(minutesLeft)} left` : `${Math.abs(minutesLeft)} min late`}
          </h1>
          <p className={`mt-2 text-[15px] ${minutesLeft < 0 ? 'font-medium text-amber-ink' : 'text-body'}`}>
            Booking ends {fmtClock(endTs)}. After that, {money(lateRatePerMinute(b.pricePerHr))}/min.
          </p>
          {late.lateMinutes > 0 && (
            <p className="mt-1 text-[15px] font-semibold text-amber-deep" role="status">
              Late fee so far: {money(late.lateFee)} for {late.lateMinutes} min, before the {Math.round(SERVICE_FEE * 100)}% service fee.
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[13px] font-medium text-muted">Estimated miles added so far</p>
          <p className="text-[22px] font-semibold text-ink">
            +{milesSoFar} <span className="text-[15px] font-medium text-muted">of +{estMiles} mi</span>
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

  const panelBase = 'flex flex-wrap items-center justify-between gap-3 rounded-card p-4';
  const pickup = (
    <div className={card}>
      <h1 className="text-[28px] font-semibold text-ink">Pick up your car</h1>
      <div aria-live="polite">
        {loc.kind === 'idle' && (
          <div className={`${panelBase} bg-surface`}>
            <p className="text-[16px] font-medium text-ink">Check that you are at the car</p>
            <Button variant="secondary" onClick={checkLocation}>Check location</Button>
          </div>
        )}
        {loc.kind === 'checking' && (
          <div className={`${panelBase} bg-surface`}>
            <p className="text-[16px] font-medium text-ink">Checking your location…</p>
          </div>
        )}
        {loc.kind === 'ok' && (
          <div className={`${panelBase} bg-green-bg`}>
            <div>
              <p className="text-[16px] font-semibold text-green-ink">You’re at the car, {loc.meters} m away</p>
              <p className="text-[14px] text-green-ink">Within the {PICKUP_RADIUS_M} m pickup radius.</p>
            </div>
          </div>
        )}
        {loc.kind === 'far' && (
          <div className={`${panelBase} bg-amber-bg`}>
            <div>
              <p className="text-[16px] font-semibold text-amber-deep">You’re {loc.meters} m from the car</p>
              <p className="text-[14px] text-amber-ink">Pickup opens within {PICKUP_RADIUS_M} m. Late minutes keep counting.</p>
            </div>
            <Button variant="secondary" onClick={checkLocation}>Try again</Button>
          </div>
        )}
        {loc.kind === 'denied' && (
          <div className={`${panelBase} bg-amber-bg`}>
            <div>
              <p className="text-[16px] font-semibold text-amber-deep">Location unavailable</p>
              <p className="text-[14px] text-amber-ink">You can still pick up with a photo. The host reviews it.</p>
            </div>
          </div>
        )}
        {loc.kind === 'unavailable' && (
          <div className={`${panelBase} bg-amber-bg`}>
            <div>
              <p className="text-[16px] font-semibold text-amber-deep">We couldn’t get your location in time</p>
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
        <Button size="lg" disabled={!locOk || !pickupPhoto || busy} onClick={() => void finish(loc.kind === 'denied')}>
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
      <p className="text-[14px] font-medium text-green-ink">
        Picked up at {fmtClock(r.pickupAt)}
        {r.flagged ? ', flagged for host review' : ''}
      </p>
      <h1 className="-mt-3 text-[28px] font-semibold text-ink">Trip complete</h1>
      <dl className="m-0 flex max-w-[480px] flex-col gap-2.5 text-[15px] text-body">
        <div className="flex justify-between gap-3">
          <dt>{money(b.pricePerHr)} × {b.hours} h</dt>
          <dd className="m-0 font-medium text-ink">{money(r.subtotal)}</dd>
        </div>
        {r.lateMinutes > 0 && (
          <div className="flex justify-between gap-3 text-amber-ink">
            <dt>Late, {r.lateMinutes} min</dt>
            <dd className="m-0 font-medium">{money(r.lateFee)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt>Service fee ({Math.round(SERVICE_FEE * 100)}%)</dt>
          <dd className="m-0 font-medium text-ink">{money(r.serviceFee)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-line pt-3 text-[17px] font-semibold text-ink">
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
      {(b.arrivalPhoto || b.pickupPhoto) && (
        <div className="flex flex-wrap gap-4">
          {[
            { src: b.arrivalPhoto, label: 'Arrival photo' },
            { src: b.pickupPhoto, label: 'Pickup photo' },
          ]
            .filter((p): p is { src: string; label: string } => Boolean(p.src))
            .map((p) => (
              <figure key={p.label} className="m-0 flex flex-col gap-1.5">
                <img src={p.src} alt={p.label} className="h-24 w-32 rounded-card object-cover" />
                <figcaption className="text-[13px] font-medium text-muted">{p.label}</figcaption>
              </figure>
            ))}
        </div>
      )}
      <LinkButton to="/search" size="lg" className="w-fit">
        Book another charger
      </LinkButton>
    </div>
  );

  return (
    <div className="min-h-dvh bg-surface">
      <Header />
      <main className="mx-auto flex max-w-[1120px] flex-wrap items-start gap-8 px-6 pb-16 pt-8">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <ol className="m-0 grid list-none grid-cols-4 gap-2 p-0" aria-label="Session progress">
            {STEPS.map((s, i) => (
              <li key={s.id} aria-current={i === stepIndex ? 'step' : undefined}>
                <div className={`h-1.5 rounded-full ${i <= stepIndex ? 'bg-brand' : 'bg-pill'}`} />
                <span className={`mt-2 block text-[14px] font-medium ${i <= stepIndex ? 'text-ink' : 'text-muted'}`}>{s.label}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-paper p-4">
            <Photo src={listing.photos[0]} className="h-14 w-14 shrink-0 rounded-card" />
            <div className="min-w-[200px] flex-1">
              <p className="text-[17px] font-semibold text-ink">{listing.title}</p>
              <p className="text-[14px] text-muted">
                {fmtRange(b.startHour, b.hours)}, {b.carName}, {b.pEff} kW draw
              </p>
            </div>
            <PaidPill amount={money(b.total)} />
          </div>

          {actionError && <WarnNote>{actionError}</WarnNote>}
          {busy && step !== 'done' && (
            <p role="status" className="text-[14px] text-muted">
              Saving…
            </p>
          )}
          {step === 'arrived' && arrived}
          {step === 'charging' && charging}
          {step === 'pickup' && pickup}
          {step === 'done' && done}
        </div>

        <aside
          aria-label="Demo controls"
          className="flex min-w-0 flex-[1_1_260px] flex-col gap-4 rounded-card border-2 border-dashed border-disabled bg-paper p-4"
        >
          <p className="text-[12px] font-semibold text-muted">Demo controls</p>
          {backend ? (
            <p className="text-[13px] text-muted">
              Connected to the Dwell backend: the server&apos;s clock and records decide the steps and the bill, so only the phone location can be simulated.
            </p>
          ) : (
          <>
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
          </>
          )}
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
