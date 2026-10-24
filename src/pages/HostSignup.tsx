import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMassachusettsResidentialRate } from '../adapters/eiaRates';
import { isMassachusetts, type GeocodedAddress } from '../adapters/mapboxGeocoding';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { CheckboxCard, ChoiceGroup, SelectField, Stepper, TextAreaField, TextField } from '../components/form';
import Header from '../components/Header';
import { Pin } from '../components/Icons';
import PinPicker from '../components/PinPicker';
import { AutoGrid, Button, Pill } from '../components/ui';
import Wizard from '../components/Wizard';
import { EV_MODELS } from '../data/evFallbackSeed';
import {
  DEFAULT_LOCAL_RATE,
  CHARGER_KW_MAX,
  CHARGER_KW_MIN,
  EARNINGS_CAP_MULTIPLE,
  MAX_LOCAL_RATE,
  MIN_LOCAL_RATE,
  SUGGESTED_EARNINGS_HR,
} from '../engines/constants';
import type { Adapters, Plug } from '../engines/plug';
import { computePrice } from '../engines/pricing';
import { resolveRate, type RateResolution } from '../engines/rate';
import { DAY_LABELS, summarizeDays } from '../lib/availability';
import { fmtHour, formatDataMonth, formatRateInput, money } from '../lib/format';
import { fileToDataUrl } from '../lib/image';
import { MASSACHUSETTS_CENTER, hasMapboxToken } from '../lib/mapbox';
import { isMassachusettsZip, stripHouseNumber } from '../lib/massachusetts';
import { useApp } from '../state/AppState';
import type { AvailabilityWindow, Level, Listing, SpotType } from '../types/listing';
import { EMAIL_RE, digitsOnly } from './DriverSignup';

const STEPS = ['Account', 'Your spot', 'Charger', 'Pricing', 'Photos & instructions', 'Availability', 'Review'];
const STEP_HEAD: { title: string; why: string }[] = [
  { title: 'Create your host account', why: 'We use your details to confirm bookings and reach you if a driver needs help.' },
  { title: 'Tell us about your spot', why: 'Drivers see the neighborhood first. The exact address is shared only after they book.' },
  { title: 'Describe your charger', why: 'The charger’s speed and plug decide which cars can use it and what they pay.' },
  { title: 'Set your pricing', why: 'Drivers pay for the power their car can draw, plus what you earn per hour.' },
  { title: 'Add photos and instructions', why: 'Good photos and clear directions help drivers find the spot without calling you.' },
  { title: 'Choose when it’s available', why: 'Windows are strict. A booking must fit inside one, so you never need to move a car.' },
  { title: 'Review and publish', why: 'Check everything once. You can edit any section from here.' },
];

const SPOT_TYPES: SpotType[] = ['Driveway', 'Garage', 'Carport', 'Private lot'];
const L2_PRESETS = [7.2, 7.7, 9.6, 11.5];
const L1_PRESETS = [1.44, 1.9];
const PRICE_TABLE_CARS = ['toyota-prius-prime', 'nissan-leaf', 'tesla-my'].map((id) => EV_MODELS.find((c) => c.id === id)!);

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const PRESETS: { label: string; w: Omit<AvailabilityWindow, 'id'> }[] = [
  { label: '+ Weekdays 7 AM to 7 PM', w: { days: [0, 1, 2, 3, 4], start: 7, end: 19 } },
  { label: '+ Every day 8 AM to 8 PM', w: { days: [0, 1, 2, 3, 4, 5, 6], start: 8, end: 20 } },
  { label: '+ Overnight 8 PM to 8 AM', w: { days: [0, 1, 2, 3, 4, 5, 6], start: 20, end: 8 } },
];

type KwMode = number | 'other';

/** The address the host is listing. `geocode` comes from a selected search result; `manual` is typed by hand. */
interface Addr {
  source: 'none' | 'geocode' | 'manual';
  line: string;
  streetName: string;
  city: string;
  zip: string;
  neighborhood: string;
}
const NO_ADDR: Addr = { source: 'none', line: '', streetName: '', city: '', zip: '', neighborhood: '' };

/** The point drivers navigate to. Only a confirmed pin may be published. */
interface PinState {
  lat: number;
  lng: number;
  confirmed: boolean;
}

interface HostForm {
  name: string;
  phone: string;
  email: string;
  password: string;
  /** Text in the address search box */
  searchText: string;
  addr: Addr;
  /** Typed address entry, used when address search is unavailable */
  manual: boolean;
  unit: string;
  spotType: SpotType;
  spots: number;
  rightToList: boolean;
  pin: PinState | null;
  /** Bump to fly the map to the pin (address chosen, GPS). Dragging must not recenter. */
  recenter: number;
  level: Level;
  kwMode: KwMode;
  kwOther: string;
  plug: Plug;
  hasAdapter: boolean;
  outdoorOutlet: boolean;
  solar: 'yes' | 'no';
  solarKw: string;
  rate: string;
  earnings: string;
  title: string;
  photos: string[];
  instructions: string;
  windows: AvailabilityWindow[];
  terms: boolean;
}

type Errors = Record<string, string>;

/** State of the electricity-rate estimate. The EIA number is one Massachusetts statewide residential average. */
type RateInfo =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'eia'; resolution: RateResolution }
  | { status: 'fallback'; resolution: RateResolution; reason: string };

const BILL_TIP = 'Replace it with the rate on your electricity bill.';

const windowSummary = (w: AvailabilityWindow) =>
  `${summarizeDays(w.days)}, ${fmtHour(w.start)} to ${fmtHour(w.end)}${w.end <= w.start ? ' (overnight)' : ''}`;

const INITIAL: HostForm = {
  name: '',
  phone: '',
  email: '',
  password: '',
  searchText: '',
  addr: NO_ADDR,
  manual: !hasMapboxToken,
  unit: '',
  spotType: 'Driveway',
  spots: 1,
  rightToList: false,
  pin: null,
  recenter: 0,
  level: 'L2',
  kwMode: 9.6,
  kwOther: '',
  plug: 'J1772',
  hasAdapter: false,
  outdoorOutlet: false,
  solar: 'no',
  solarKw: '',
  rate: '0.30',
  earnings: SUGGESTED_EARNINGS_HR.toFixed(2),
  title: '',
  photos: [],
  instructions: '',
  windows: [],
  terms: false,
};

export default function HostSignup() {
  const navigate = useNavigate();
  const { update } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<HostForm>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  const [addrNotice, setAddrNotice] = useState('');
  const [photoError, setPhotoError] = useState('');
  const titleTouched = useRef(false);
  const rateEditedRef = useRef(false); // mirrors rateEdited for async callbacks that must not see stale state
  const windowId = useRef(0);

  const set = <K extends keyof HostForm>(k: K, v: HostForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  /* ----- Electricity rate -----
     The ZIP only tells us the address is in a supported Massachusetts location. The estimate itself is EIA's
     Massachusetts statewide residential average (monthly, in cents/kWh, a couple of months behind), converted to
     dollars/kWh. It is NOT ZIP-specific or utility-specific, which is why the lookup is keyed on "supported or not",
     not on the ZIP value. The adapter caches the statewide result, so changing ZIPs never refetches.
     A rate the host typed is never overwritten. */
  const [rateInfo, setRateInfo] = useState<RateInfo>({ status: 'idle' });
  const [rateEdited, setRateEdited] = useState(false);
  const supportedLocation = isMassachusettsZip(form.addr.zip);

  useEffect(() => {
    if (!supportedLocation) return;
    let cancelled = false;
    setRateInfo((r) => (r.status === 'eia' ? r : { status: 'loading' }));
    void getMassachusettsResidentialRate().then((result) => {
      if (cancelled) return;
      const resolution = resolveRate(result.ok ? result.rate : null); // falls back to $0.30 when unusable
      setRateInfo(result.ok ? { status: 'eia', resolution } : { status: 'fallback', resolution, reason: result.message });
      if (!rateEditedRef.current) set('rate', formatRateInput(resolution.local_rate));
    });
    return () => {
      cancelled = true;
    };
  }, [supportedLocation]);

  const estimateName = rateInfo.status === 'eia' ? 'EIA estimate' : 'fallback estimate';
  const rateHint =
    rateEdited ? (
      <>
        Your own rate. It replaces the {estimateName}.
      </>
    ) : rateInfo.status === 'loading' ? (
      'Looking up the Massachusetts residential average from EIA…'
    ) : rateInfo.status === 'eia' && rateInfo.resolution.dataMonth ? (
      <>
        <strong className="font-bold text-ink">
          Massachusetts residential average, EIA, {formatDataMonth(rateInfo.resolution.dataMonth)}
        </strong>
        . A statewide estimate: your ZIP only confirms a supported location, so it is not specific to your ZIP or utility.
        EIA data runs a couple of months behind. {BILL_TIP}
      </>
    ) : rateInfo.status === 'fallback' ? (
      <>
        <strong className="font-bold text-amber-ink">Fallback estimate, {money(DEFAULT_LOCAL_RATE)}/kWh</strong>. {rateInfo.reason}{' '}
        {BILL_TIP}
      </>
    ) : (
      'An estimate fills in once your address is chosen.'
    );

  const kw = form.kwMode === 'other' ? Number(form.kwOther) : form.kwMode;
  const earningsCap = SUGGESTED_EARNINGS_HR * EARNINGS_CAP_MULTIPLE;
  const adapters: Adapters = !form.hasAdapter ? 'NONE' : form.plug === 'J1772' ? 'J1772_TO_NACS' : 'NACS_TO_J1772';
  const otherPlug: Plug = form.plug === 'J1772' ? 'NACS' : 'J1772';

  // Suggest a title when the host reaches the photos step and hasn't typed their own.
  useEffect(() => {
    if (step === 4 && !titleTouched.current && !form.title) {
      const hood = form.addr.neighborhood || form.addr.city || 'Massachusetts';
      set('title', `${hood} ${form.spotType.toLowerCase()}`);
    }
  }, [step]);

  function validate(s: number): Errors {
    const e: Errors = {};
    if (s === 0) {
      if (form.name.trim().length < 2) e.name = 'Enter your full name.';
      if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.';
      if (digitsOnly(form.phone).length !== 10) e.phone = 'Enter a 10-digit phone number.';
      if (form.password.length < 8) e.password = 'Use at least 8 characters.';
    }
    if (s === 1) {
      const a = form.addr;
      if (form.manual) {
        if (a.line.trim().length < 4) e.line = 'Enter your street address.';
        if (a.city.trim().length < 2) e.city = 'Enter your city or town.';
        if (!isMassachusettsZip(a.zip)) e.zip = 'Enter a 5-digit Massachusetts ZIP code.';
      } else if (a.source !== 'geocode') {
        e.address = 'Choose your address from the suggestions.';
      }
      if (!form.pin) e.pin = 'Place the pin on your driveway or charger entrance.';
      else if (!form.pin.confirmed) e.pin = 'Confirm the pin location before continuing.';
      if (!form.rightToList) e.rightToList = 'Confirm you have the right to list this spot.';
    }
    if (s === 2) {
      const [lo, hi] = form.level === 'L2' ? [3.0, CHARGER_KW_MAX] : [CHARGER_KW_MIN, 1.92];
      if (!Number.isFinite(kw) || kw < lo || kw > hi) e.kw = `Enter a power between ${lo} and ${hi} kW for ${form.level}.`;
      if (form.level === 'L1' && !form.outdoorOutlet) e.outdoorOutlet = 'L1 needs a dedicated outdoor-rated outlet.';
      if (form.solar === 'yes') {
        const s2 = Number(form.solarKw);
        if (form.solarKw.trim() === '' || !Number.isFinite(s2) || s2 < 0 || s2 > 50) e.solarKw = 'Enter your system size between 0 and 50 kW.';
      }
    }
    if (s === 3) {
      const r = Number(form.rate);
      if (!Number.isFinite(r) || r < MIN_LOCAL_RATE || r > MAX_LOCAL_RATE) e.rate = `Enter a rate between ${money(MIN_LOCAL_RATE)} and ${money(MAX_LOCAL_RATE)} per kWh.`;
      const en = Number(form.earnings);
      if (!Number.isFinite(en) || en <= 0) e.earnings = 'Enter what you’d like to earn per hour.';
      else if (en > earningsCap) e.earnings = `The most you can set here is ${money(earningsCap)} per hour (2× the suggested ${money(SUGGESTED_EARNINGS_HR)}).`;
    }
    if (s === 4) {
      if (form.title.trim().length < 4) e.title = 'Give your listing a title.';
      if (form.photos.length < 1) e.photos = 'Add at least one photo.';
      if (form.instructions.trim().length < 20) e.instructions = 'Write at least 20 characters so drivers can find the spot.';
    }
    if (s === 5) {
      if (form.windows.length < 1) e.windows = 'Add at least one availability window.';
      else if (form.windows.some((w) => w.days.length === 0)) e.windows = 'Pick at least one day for each window.';
      else if (form.windows.some((w) => w.start === w.end)) e.windows = 'Each window needs different start and end times.';
    }
    if (s === 6 && !form.terms) e.terms = 'Accept the terms to publish.';
    return e;
  }

  function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    publish();
  }

  function publish() {
    // Never publish without an address and a pin the host confirmed. A ZIP centroid is never a stand-in.
    const pin = form.pin;
    if (!pin || !pin.confirmed || form.addr.source === 'none') {
      setErrors({ pin: 'Confirm the pin location before publishing.' });
      setStep(1);
      window.scrollTo({ top: 0 });
      return;
    }
    setBusy(true);
    const a = form.addr;
    const listing: Listing = {
      id: `host-${Date.now()}`,
      title: form.title.trim(),
      // Public summaries show the street name only. The exact address stays in privateAddress.
      street: a.streetName || stripHouseNumber(a.line),
      neighborhood: a.neighborhood || a.city,
      lat: pin.lat,
      lng: pin.lng,
      privateAddress: { line: a.line, unit: form.unit.trim() || undefined, city: a.city, state: 'MA', zip: a.zip },
      spotType: form.spotType,
      chargerKw: kw,
      level: form.level,
      plug: form.plug,
      adapters,
      solarKw: form.solar === 'yes' ? Number(form.solarKw) : 0,
      spots: form.spots,
      hostName: form.name.trim().split(/\s+/)[0],
      rate: Number(form.rate),
      rateSource: rateEdited ? 'HOST' : rateInfo.status === 'eia' ? 'EIA' : 'FALLBACK',
      rateDataMonth: !rateEdited && rateInfo.status === 'eia' ? rateInfo.resolution.dataMonth : null,
      earningsHr: Number(form.earnings),
      windows: form.windows,
      instructions: form.instructions.trim(),
      photos: form.photos,
      isNew: true,
    };
    // Password is intentionally dropped: prototype only, Cognito handles it later.
    update({
      user: { role: 'host', name: form.name.trim(), email: form.email.trim(), phone: digitsOnly(form.phone) },
      hostListing: listing,
    });
    navigate('/host');
  }

  /* ----- Address and pin. Any address change throws away the old pin: coordinates are never reused. ----- */

  // The map and search are interactive, so their errors clear the moment the host fixes them
  // (other fields keep the "clear on next Continue" rule).
  const clearErrors = (...keys: string[]) =>
    setErrors((e) => {
      const next = { ...e };
      keys.forEach((k) => delete next[k]);
      return next;
    });

  function onSearchInput(text: string) {
    setAddrNotice('');
    setForm((f) => ({ ...f, searchText: text, addr: NO_ADDR, pin: null }));
  }

  function onSelectAddress(a: GeocodedAddress) {
    if (!isMassachusetts(a)) {
      setAddrNotice(`That address is in ${a.state || 'another state'}. Dwell is only available in Massachusetts right now.`);
      setForm((f) => ({ ...f, addr: NO_ADDR, pin: null }));
      return;
    }
    setAddrNotice('');
    clearErrors('address');
    setForm((f) => ({
      ...f,
      searchText: a.line1,
      addr: { source: 'geocode', line: a.line1, streetName: a.streetName, city: a.city, zip: a.zip, neighborhood: a.neighborhood },
      // Start the pin at the geocoded point; the host must still place it exactly and confirm it.
      pin: { lat: a.lat, lng: a.lng, confirmed: false },
      recenter: f.recenter + 1,
    }));
  }

  function editManual(field: 'line' | 'city' | 'zip', value: string) {
    setForm((f) => {
      const addr = { ...f.addr, source: 'manual' as const, [field]: value };
      return { ...f, addr: { ...addr, streetName: stripHouseNumber(addr.line), neighborhood: addr.city }, pin: null };
    });
  }

  function useManualEntry() {
    setAddrNotice('');
    setForm((f) => ({ ...f, manual: true, searchText: '', addr: NO_ADDR, pin: null }));
  }

  const onPinMove = (p: { lat: number; lng: number }) => {
    clearErrors('pin');
    setForm((f) => ({ ...f, pin: { lat: p.lat, lng: p.lng, confirmed: false } }));
  };
  const confirmPin = () => {
    clearErrors('pin');
    setForm((f) => (f.pin ? { ...f, pin: { ...f.pin, confirmed: true } } : f));
  };
  const unconfirmPin = () => setForm((f) => (f.pin ? { ...f, pin: { ...f.pin, confirmed: false } } : f));

  function useMyLocation() {
    if (!navigator.geolocation) return setLocMsg('Location is not available on this device. Drag the pin or click the map instead.');
    setLocMsg('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Positions the same pin as the map does. It still needs the host's explicit confirmation.
        clearErrors('pin');
        setForm((f) => ({ ...f, pin: { lat: pos.coords.latitude, lng: pos.coords.longitude, confirmed: false }, recenter: f.recenter + 1 }));
        setLocMsg('Pin moved to your location. Check it, then confirm.');
      },
      (err) =>
        setLocMsg(
          err.code === 1
            ? 'Location permission was denied. Drag the pin or click the map to place it instead.'
            : 'We couldn’t get your location. Drag the pin or click the map to place it instead.',
        ),
      { timeout: 30_000 },
    );
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setPhotoError('');
    try {
      const room = 8 - form.photos.length;
      const urls = await Promise.all(Array.from(files).slice(0, room).map((f) => fileToDataUrl(f, 800)));
      setForm((f) => ({ ...f, photos: [...f.photos, ...urls].slice(0, 8) }));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not add that photo');
    }
  }

  const addWindow = (w: Omit<AvailabilityWindow, 'id'>) => set('windows', [...form.windows, { ...w, id: `w${++windowId.current}` }]);
  const patchWindow = (id: string, patch: Partial<AvailabilityWindow>) =>
    set('windows', form.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const priceRows = useMemo(
    () =>
      PRICE_TABLE_CARS.map((car) => {
        const p = computePrice({
          charger_kW: kw,
          car_max_AC_kW: car.maxAcKw,
          local_rate: Number(form.rate),
          host_earnings_hr: Number(form.earnings),
          booked_hours: 1,
        });
        return { car, p: p.ok ? p.value : null };
      }),
    [kw, form.rate, form.earnings],
  );

  /* ---------- Step bodies ---------- */

  const body = [
    // 0 Account
    <>
      <AutoGrid min={240} gap={16}>
        <TextField label="Full name" autoComplete="name" value={form.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
        <TextField label="Phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} error={errors.phone} onChange={(e) => set('phone', e.target.value)} />
      </AutoGrid>
      <TextField label="Email" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={(e) => set('email', e.target.value)} />
      <TextField label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." value={form.password} error={errors.password} onChange={(e) => set('password', e.target.value)} />
    </>,

    // 1 Your spot
    <>
      {form.manual ? (
        <div className="flex flex-col gap-4">
          <p className="rounded-xl bg-surface p-3.5 text-[14px] text-body">
            {hasMapboxToken
              ? 'Entering your address by hand. '
              : 'Address search is unavailable right now (no Mapbox token), so enter your address by hand. '}
            You will place and confirm the pin yourself.
            {hasMapboxToken && (
              <>
                {' '}
                <button
                  type="button"
                  className="font-bold text-brand underline underline-offset-2 whitespace-nowrap"
                  onClick={() => setForm((f) => ({ ...f, manual: false, addr: NO_ADDR, pin: null, searchText: '' }))}
                >
                  Use address search instead
                </button>
              </>
            )}
          </p>
          <AutoGrid min={240} gap={16}>
            <TextField label="Street address" autoComplete="address-line1" value={form.addr.line} error={errors.line} onChange={(e) => editManual('line', e.target.value)} />
            <TextField label="Unit" optional value={form.unit} onChange={(e) => set('unit', e.target.value)} />
          </AutoGrid>
          <AutoGrid min={160} gap={16}>
            <TextField label="City or town" autoComplete="address-level2" value={form.addr.city} error={errors.city} onChange={(e) => editManual('city', e.target.value)} />
            <TextField label="State" value="MA" readOnly hint="Massachusetts only" />
            <TextField
              label="ZIP code"
              inputMode="numeric"
              maxLength={5}
              autoComplete="postal-code"
              value={form.addr.zip}
              error={errors.zip}
              onChange={(e) => editManual('zip', digitsOnly(e.target.value).slice(0, 5))}
            />
          </AutoGrid>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <AutoGrid min={240} gap={16}>
            <AddressAutocomplete
              value={form.searchText}
              onInputChange={onSearchInput}
              onSelect={onSelectAddress}
              error={addrNotice || errors.address || undefined}
              hint="Search your Massachusetts street address and pick it from the list."
            />
            <TextField label="Unit" optional value={form.unit} onChange={(e) => set('unit', e.target.value)} />
          </AutoGrid>
          {form.addr.source === 'geocode' && (
            <AutoGrid min={160} gap={16}>
              <TextField label="City or town" value={form.addr.city} readOnly hint="From your selected address" />
              <TextField label="State" value="MA" readOnly />
              <TextField label="ZIP code" value={form.addr.zip} readOnly />
            </AutoGrid>
          )}
          <p className="text-[13px] text-muted">
            Can’t find it?{' '}
            <button type="button" className="font-bold text-brand underline underline-offset-2 whitespace-nowrap" onClick={useManualEntry}>
              Enter the address by hand
            </button>
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div>
          <Button variant="secondary" onClick={useMyLocation}>
            <Pin size={18} />
            I’m at the spot: use my location
          </Button>
        </div>
        {locMsg && (
          <p className="text-[13px] text-muted" role="status">
            {locMsg}
          </p>
        )}
      </div>

      {form.pin || form.addr.source !== 'none' || form.manual ? (
        <PinPicker
          position={form.pin}
          confirmed={form.pin?.confirmed ?? false}
          onMove={onPinMove}
          onConfirm={confirmPin}
          onUnconfirm={unconfirmPin}
          recenterToken={form.recenter}
          fallbackCenter={MASSACHUSETTS_CENTER}
          error={errors.pin}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-muted p-5 text-[14px] text-muted" data-testid="pin-placeholder">
          The map appears after you choose an address. You will drag the pin to your driveway or charger entrance and confirm it.
          {errors.pin && (
            <p role="alert" className="mt-2 text-[13px] font-semibold text-amber-ink">
              {errors.pin}
            </p>
          )}
        </div>
      )}
      <ChoiceGroup<SpotType>
        legend="Type of spot"
        min={120}
        options={SPOT_TYPES.map((t) => ({ value: t, label: t }))}
        value={form.spotType}
        onChange={(v) => set('spotType', v)}
      />
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-bold text-ink">Number of spots</span>
        <Stepper label="Spots" value={form.spots} min={1} max={4} onChange={(n) => set('spots', n)} />
      </div>
      <CheckboxCard checked={form.rightToList} onChange={(v) => set('rightToList', v)} lead="I have the right to list this spot." error={errors.rightToList}>
        I own it, or my landlord, condo association or shared-driveway neighbors allow it.
      </CheckboxCard>
    </>,

    // 2 Charger
    <>
      <ChoiceGroup<Level>
        legend="Charger level"
        options={[
          { value: 'L2', label: 'Level 2', sub: '240 V wall charger, 7 to 19 kW' },
          { value: 'L1', label: 'Level 1', sub: '120 V outlet, 1 to 2 kW, priced lower' },
        ]}
        value={form.level}
        onChange={(v) => setForm((f) => ({ ...f, level: v, kwMode: v === 'L2' ? 9.6 : 1.44, kwOther: '', outdoorOutlet: false }))}
      />
      <div role="group" aria-label="Charger power" className="flex flex-col gap-2">
        <span className="text-[14px] font-bold text-ink">Charger power</span>
        <div className="flex flex-wrap gap-2">
          {(form.level === 'L2' ? L2_PRESETS : L1_PRESETS).map((p) => (
            <Pill key={p} selected={form.kwMode === p} onClick={() => set('kwMode', p)}>
              {p} kW
            </Pill>
          ))}
          <Pill selected={form.kwMode === 'other'} onClick={() => set('kwMode', 'other')}>
            Other
          </Pill>
        </div>
        {form.kwMode === 'other' && (
          <div className="max-w-[240px]">
            <TextField label="Power (kW)" inputMode="decimal" value={form.kwOther} error={errors.kw} onChange={(e) => set('kwOther', e.target.value)} />
          </div>
        )}
        {form.kwMode !== 'other' && errors.kw && (
          <p role="alert" className="text-[13px] font-semibold text-amber-ink">
            {errors.kw}
          </p>
        )}
      </div>
      <ChoiceGroup<Plug>
        legend="Plug type"
        options={[
          { value: 'J1772', label: 'J1772', sub: 'Most non-Tesla EVs' },
          { value: 'NACS', label: 'NACS', sub: 'Teslas and newer EVs' },
        ]}
        value={form.plug}
        onChange={(v) => setForm((f) => ({ ...f, plug: v, hasAdapter: false }))}
      />
      <CheckboxCard checked={form.hasAdapter} onChange={(v) => set('hasAdapter', v)} lead={`I have a ${form.plug} → ${otherPlug} adapter I can leave at the charger.`}>
        Drivers with {otherPlug} cars can then book you.
      </CheckboxCard>
      {form.level === 'L1' && (
        <CheckboxCard checked={form.outdoorOutlet} onChange={(v) => set('outdoorOutlet', v)} lead="This is a dedicated outdoor-rated outlet." error={errors.outdoorOutlet}>
          Never an extension cord.
        </CheckboxCard>
      )}
      <ChoiceGroup<'yes' | 'no'>
        legend="Do you have solar panels?"
        min={140}
        options={[
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        value={form.solar}
        onChange={(v) => set('solar', v)}
      />
      {form.solar === 'yes' && (
        <div className="max-w-[260px]">
          <TextField label="Solar system size (kW)" inputMode="decimal" value={form.solarKw} error={errors.solarKw} onChange={(e) => set('solarKw', e.target.value)} />
        </div>
      )}
      <p className="rounded-xl bg-surface p-3.5 text-[14px] font-semibold text-body">
        {form.level}, {Number.isFinite(kw) && kw > 0 ? `${kw} kW` : 'kW not set'}, {form.plug}
        {form.hasAdapter ? `, adapter to ${otherPlug}` : ''}
        {form.solar === 'yes' && form.solarKw ? `, ${form.solarKw} kW solar` : ''}
      </p>
    </>,

    // 3 Pricing
    <>
      <AutoGrid min={240} gap={16}>
        <TextField
          label="Electricity rate ($/kWh)"
          inputMode="decimal"
          hint={rateHint}
          value={form.rate}
          error={errors.rate}
          onChange={(e) => {
            rateEditedRef.current = true;
            setRateEdited(true);
            set('rate', e.target.value);
          }}
        />
        <TextField
          label="You earn per hour ($)"
          inputMode="decimal"
          hint={`Suggested ${money(SUGGESTED_EARNINGS_HR)}. The most you can set is ${money(earningsCap)}.`}
          value={form.earnings}
          error={errors.earnings}
          onChange={(e) => set('earnings', e.target.value)}
        />
      </AutoGrid>
      <div>
        <h3 className="mb-2 text-[18px] font-extrabold text-ink">What drivers pay per hour</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
            <thead className="bg-surface text-muted">
              <tr>
                {['Car', 'Draws', 'Electricity', 'You earn', 'Driver pays'].map((h, i) => (
                  <th key={h} scope="col" className={`px-4 py-3 font-bold ${i > 0 ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {priceRows.map(({ car, p }) => (
                <tr key={car.id} className="border-t border-line">
                  <th scope="row" className="px-4 py-3 font-semibold text-ink">{car.name}</th>
                  <td className="px-4 py-3 text-right">{p ? `${p.P_eff} kW` : 'n/a'}</td>
                  <td className="px-4 py-3 text-right">{p ? money(p.electricity_cost_per_hr) : 'n/a'}</td>
                  <td className="px-4 py-3 text-right">{money(Number(form.earnings) || 0)}</td>
                  <td className="px-4 py-3 text-right font-extrabold text-ink">{p ? money(p.price_per_hr) : 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[13px] text-muted">
          Driver pays = min(charger kW, car kW) × your rate + what you earn. Drivers also pay a 10% service fee on top.
        </p>
      </div>
    </>,

    // 4 Photos & instructions
    <>
      <TextField label="Listing title" value={form.title} error={errors.title} onChange={(e) => { titleTouched.current = true; set('title', e.target.value); }} />
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-bold text-ink">Photos</span>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
          {form.photos.map((src, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-xl bg-surface">
              <img src={src} alt={`Listing photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => set('photos', form.photos.filter((_, j) => j !== i))}
                className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-paper text-[18px] font-bold text-ink shadow-pin hover:text-brand"
              >
                ×
              </button>
            </div>
          ))}
          {form.photos.length < 8 && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-muted text-[14px] font-bold text-muted hover:border-brand focus-within:outline-2">
              <span className="text-[26px] leading-none">+</span>
              Add photos
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
        {(errors.photos || photoError) && (
          <p role="alert" className="text-[13px] font-semibold text-amber-ink">
            {errors.photos || photoError}
          </p>
        )}
        <p className="text-[13px] text-muted">Up to 8 photos. Show the street view, the charger and where to park.</p>
      </div>
      <TextAreaField
        label="Parking instructions"
        hint="Where to park, where the charger is, and anything to watch for."
        value={form.instructions}
        error={errors.instructions}
        onChange={(e) => set('instructions', e.target.value)}
      />
    </>,

    // 5 Availability
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Add a window">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => addWindow(p.w)} className="h-10 rounded-full border border-pill bg-paper px-3 text-[14px] font-semibold text-ink hover:border-brand">
            {p.label}
          </button>
        ))}
      </div>
      {errors.windows && (
        <p role="alert" className="text-[13px] font-semibold text-amber-ink">
          {errors.windows}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {form.windows.map((w) => (
          <div key={w.id} className="flex flex-col gap-3 rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[16px] font-extrabold text-ink">{windowSummary(w)}</p>
              <Button variant="ghost" size="nav" onClick={() => set('windows', form.windows.filter((x) => x.id !== w.id))}>
                Remove
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
              {DAY_LABELS.map((d, i) => {
                const on = w.days.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => patchWindow(w.id, { days: on ? w.days.filter((x) => x !== i) : [...w.days, i].sort() })}
                    className={`h-11 w-12 rounded-full border text-[14px] font-semibold ${on ? 'border-ink bg-ink text-accent-ink' : 'border-pill bg-paper text-ink hover:border-brand'}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <AutoGrid min={160} gap={12}>
              <SelectField label="From" value={w.start} onChange={(e) => patchWindow(w.id, { start: Number(e.target.value) })}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>{fmtHour(h)}</option>
                ))}
              </SelectField>
              <SelectField label="To" value={w.end} onChange={(e) => patchWindow(w.id, { end: Number(e.target.value) })}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>{fmtHour(h)}</option>
                ))}
              </SelectField>
            </AutoGrid>
          </div>
        ))}
        {form.windows.length === 0 && <p className="text-[15px] text-muted">No windows yet. Add one above to appear in search.</p>}
      </div>
    </>,

    // 6 Review
    <>
      <dl className="m-0 flex flex-col divide-y divide-line border-y border-line">
        {[
          { i: 0, k: 'Account', v: `${form.name}, ${form.email}` },
          { i: 1, k: 'Spot', v: `${form.spotType}, ${form.addr.line}${form.unit ? ` #${form.unit}` : ''}, ${form.addr.city}, MA ${form.addr.zip}, pin ${form.pin?.confirmed ? 'confirmed' : 'not confirmed'}, ${form.spots} spot${form.spots > 1 ? 's' : ''}` },
          { i: 2, k: 'Charger', v: `${form.level}, ${kw} kW, ${form.plug}${form.hasAdapter ? `, adapter to ${otherPlug}` : ''}${form.solar === 'yes' ? `, ${form.solarKw} kW solar` : ''}` },
          { i: 3, k: 'Pricing', v: `${money(Number(form.rate) || 0)}/kWh, you earn ${money(Number(form.earnings) || 0)}/hr` },
          { i: 4, k: 'Listing', v: `${form.title}, ${form.photos.length} photo${form.photos.length === 1 ? '' : 's'}` },
          { i: 5, k: 'Availability', v: form.windows.map(windowSummary).join(', ') },
        ].map((r) => (
          <div key={r.k} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <dt className="text-[13px] font-bold text-muted">{r.k}</dt>
              <dd className="m-0 text-[15px] font-semibold text-ink">{r.v}</dd>
            </div>
            <Button variant="link" size="nav" onClick={() => setStep(r.i)} aria-label={`Edit ${r.k}`}>
              Edit
            </Button>
          </div>
        ))}
      </dl>
      <div className="rounded-2xl bg-surface p-4">
        <h3 className="text-[16px] font-extrabold text-ink">What happens next</h3>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[15px] text-body">
          <li>Your listing goes live in search right away.</li>
          <li>Drivers book a window. You never hand over a key or touch the car.</li>
          <li>Each session ends when the driver taps Pick up near your driveway.</li>
        </ul>
      </div>
      <CheckboxCard checked={form.terms} onChange={(v) => set('terms', v)} lead="I agree to the Dwell host terms." error={errors.terms}>
        Payments and notifications are simulated in this demo.
      </CheckboxCard>
    </>,
  ];

  return (
    <div className="bg-paper">
      <Header />
      <main className="container pb-20 pt-8">
        <Wizard
          title="List your charger"
          steps={STEPS}
          current={step}
          onStepClick={(i) => {
            setErrors({});
            setStep(i);
            window.scrollTo({ top: 0 });
          }}
          stepTitle={STEP_HEAD[step].title}
          stepWhy={STEP_HEAD[step].why}
          onBack={() => {
            setErrors({});
            setStep(step - 1);
            window.scrollTo({ top: 0 });
          }}
          onNext={next}
          busy={busy}
        >
          {body[step]}
        </Wizard>
      </main>
    </div>
  );
}
