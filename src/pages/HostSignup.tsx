import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getMassachusettsResidentialRate } from '../adapters/eiaRates';
import { ADDRESS_TYPES, DESTINATION_TYPES, isMassachusetts, searchAddresses, type GeocodedAddress } from '../adapters/addressSearch';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { CheckboxCard, ChoiceGroup, SelectField, Stepper, TextAreaField, TextField } from '../components/form';
import Header from '../components/Header';
import { Pin } from '../components/Icons';
import PinPicker from '../components/PinPicker';
import { AutoGrid, Button, Pill, WarnNote } from '../components/ui';
import Wizard from '../components/Wizard';
import { EV_MODELS } from '../data/evFallbackSeed';
import {
  DEFAULT_LOCAL_RATE,
  CHARGER_KW_MAX,
  CHARGER_KW_MIN,
  EARNINGS_CAP_MULTIPLE,
  L1_KW_MAX,
  L2_KW_MIN,
  MAX_LOCAL_RATE,
  MIN_LOCAL_RATE,
  SOLAR_KW_MAX,
  SUGGESTED_EARNINGS_HR,
} from '../engines/constants';
import type { Adapters, Plug } from '../engines/plug';
import { computePrice } from '../engines/pricing';
import { resolveRate, type RateResolution } from '../engines/rate';
import { FIELD_STEP, type ListingField } from '../features/host/validateListing';
import { DAY_LABELS, summarizeDays } from '../lib/availability';
import { fmtHour, formatDataMonth, formatRateInput, money } from '../lib/format';
import { fileToDataUrl } from '../lib/image';
import { uploadPhoto } from '../lib/upload';
import { HOST_HOME_PATH, NEW_LISTING_PATH, SIGNUP_FOR_HOSTING_PATH } from '../lib/hostEntry';
import { MASSACHUSETTS_CENTER } from '../lib/mapbox';
import { isMassachusettsZip, stripHouseNumber } from '../lib/massachusetts';
import { useApp } from '../state/AppState';
import type { AvailabilityWindow, Level, Listing, SpotType } from '../types/listing';
import { digitsOnly } from './SignUp';

const STEPS = ['Your spot', 'Charger', 'Pricing', 'Photos & instructions', 'Availability', 'Review'];
const STEP_HEAD: { title: string; why: string }[] = [
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
  /** Text in the address search box */
  searchText: string;
  addr: Addr;
  /** Typed address entry, used when address search is unavailable */
  manual: boolean;
  /**
   * Parts the picked search result left out (OpenStreetMap often has no ZIP, sometimes no town). The host fills them
   * in. The ZIP matters: it confirms a supported location and starts the electricity-rate lookup.
   */
  missing: { city: boolean; zip: boolean };
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
  searchText: '',
  addr: NO_ADDR,
  manual: false,
  missing: { city: false, zip: false },
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

/** Fill the wizard from a published listing, for editing. Everything starts confirmed and accepted. */
function formFromListing(l: Listing): HostForm {
  const pa = l.privateAddress;
  const city = pa?.city ?? '';
  const zip = pa?.zip ?? '';
  const presets = l.level === 'L2' ? L2_PRESETS : L1_PRESETS;
  return {
    ...INITIAL,
    searchText: pa?.line ?? '',
    addr: { source: 'geocode', line: pa?.line ?? l.street, streetName: l.street, city, zip, neighborhood: l.neighborhood },
    missing: { city: city.trim().length < 2, zip: !isMassachusettsZip(zip) },
    unit: pa?.unit ?? '',
    spotType: l.spotType,
    spots: l.spots,
    rightToList: true,
    pin: { lat: l.lat, lng: l.lng, confirmed: true },
    level: l.level,
    kwMode: presets.includes(l.chargerKw) ? l.chargerKw : 'other',
    kwOther: presets.includes(l.chargerKw) ? '' : String(l.chargerKw),
    plug: l.plug,
    hasAdapter: l.adapters !== 'NONE',
    outdoorOutlet: l.level === 'L1', // required to publish an L1 listing, so it was confirmed
    solar: l.solarKw > 0 ? 'yes' : 'no',
    solarKw: l.solarKw > 0 ? String(l.solarKw) : '',
    rate: formatRateInput(l.rate),
    earnings: l.earningsHr.toFixed(2),
    title: l.title,
    photos: l.photos,
    instructions: l.instructions,
    windows: l.windows,
    terms: true,
  };
}

/**
 * The listing wizard. `new` creates the account's listing; `edit` changes the published one in place (same id), and
 * opens on the Review step so every section can be edited from there.
 */
export default function HostSignup({ mode = 'new' }: { mode?: 'new' | 'edit' }) {
  const navigate = useNavigate();
  const { user, hostListing, update, backend, syncAccount } = useApp();
  const editing = mode === 'edit' && hostListing !== null;
  const [step, setStep] = useState(editing ? STEPS.length - 1 : 0);
  const [form, setForm] = useState<HostForm>(() => (editing ? formFromListing(hostListing!) : INITIAL));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  const [addrNotice, setAddrNotice] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [findMsg, setFindMsg] = useState('');
  const [finding, setFinding] = useState(false);
  const titleTouched = useRef(editing);
  // A rate the host typed is never overwritten, including when editing a listing that already has one.
  const ownRate = editing && hostListing!.rateSource === 'HOST';
  const rateEditedRef = useRef(ownRate); // mirrors rateEdited for async callbacks that must not see stale state
  // New windows must not reuse the ids of windows loaded for editing.
  const windowId = useRef(editing ? hostListing!.windows.length + 1000 : 0);

  const set = <K extends keyof HostForm>(k: K, v: HostForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  /* ----- Electricity rate -----
     The ZIP only tells us the address is in a supported Massachusetts location. The estimate itself is EIA's
     Massachusetts statewide residential average (monthly, in cents/kWh, a couple of months behind), converted to
     dollars/kWh. It is NOT ZIP-specific or utility-specific, which is why the lookup is keyed on "supported or not",
     not on the ZIP value. The adapter caches the statewide result, so changing ZIPs never refetches.
     A rate the host typed is never overwritten. */
  // Editing a listing priced from EIA keeps that estimate (and its data month) unless the address changes. Re-fetching
  // on open could silently swap it for the $0.30 fallback when EIA is unreachable.
  const keepPublishedEia = editing && hostListing!.rateSource === 'EIA';
  const [rateInfo, setRateInfo] = useState<RateInfo>(() =>
    keepPublishedEia
      ? { status: 'eia', resolution: { local_rate: hostListing!.rate, source: 'EIA', dataMonth: hostListing!.rateDataMonth ?? null, overridable: true } }
      : { status: 'idle' },
  );
  const [rateEdited, setRateEdited] = useState(ownRate);
  const supportedLocation = isMassachusettsZip(form.addr.zip);

  useEffect(() => {
    if (!supportedLocation) return;
    if (keepPublishedEia && form.addr.zip === hostListing!.privateAddress?.zip) return;
    let cancelled = false;
    setRateInfo((r) => (r.status === 'eia' ? r : { status: 'loading' }));
    // Backend: the API asks EIA with the key kept server-side (GET /rate). Prototype: the browser asks EIA directly.
    const lookup: Promise<RateInfo> = backend
      ? backend.api.getRate().then((r) =>
          r.ok && r.data.rate.source === 'EIA'
            ? { status: 'eia', resolution: r.data.rate }
            : { status: 'fallback', resolution: resolveRate(null), reason: r.ok ? 'EIA wasn’t available, so this is the fallback estimate.' : r.message },
        )
      : getMassachusettsResidentialRate().then((result) => {
          const resolution = resolveRate(result.ok ? result.rate : null); // falls back to $0.30 when unusable
          return result.ok ? { status: 'eia', resolution } : { status: 'fallback', resolution, reason: result.message };
        });
    void lookup.then((info) => {
      if (cancelled || info.status !== 'eia' && info.status !== 'fallback') return;
      setRateInfo(info);
      if (!rateEditedRef.current) set('rate', formatRateInput(info.resolution.local_rate));
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
        <strong className="font-medium text-ink">
          Massachusetts residential average (EIA, {formatDataMonth(rateInfo.resolution.dataMonth)})
        </strong>
        . A statewide estimate: your ZIP only confirms a supported location, so it is not specific to your ZIP or utility.
        EIA data runs a couple of months behind. {BILL_TIP}
      </>
    ) : rateInfo.status === 'fallback' ? (
      <>
        <strong className="font-medium text-amber-ink">Fallback estimate: {money(DEFAULT_LOCAL_RATE)}/kWh</strong>. {rateInfo.reason}{' '}
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
    if (step === 3 && !titleTouched.current && !form.title) {
      const hood = form.addr.neighborhood || form.addr.city || 'Massachusetts';
      set('title', `${hood} ${form.spotType.toLowerCase()}`);
    }
  }, [step]);

  function validate(s: number): Errors {
    const e: Errors = {};
    if (s === 0) {
      const a = form.addr;
      if (form.manual) {
        if (a.line.trim().length < 4) e.line = 'Enter your street address.';
        if (a.city.trim().length < 2) e.city = 'Enter your city or town.';
        if (!isMassachusettsZip(a.zip)) e.zip = 'Enter a 5-digit Massachusetts ZIP code.';
      } else if (a.source !== 'geocode') {
        e.address = 'Choose your address from the suggestions.';
      } else {
        // A picked result can still lack a town or ZIP. Never publish without them.
        if (a.city.trim().length < 2) e.city = 'Enter your city or town.';
        if (!isMassachusettsZip(a.zip)) e.zip = 'Enter your 5-digit Massachusetts ZIP code.';
      }
      if (!form.pin) e.pin = 'Place the pin on your driveway or charger entrance.';
      else if (!form.pin.confirmed) e.pin = 'Confirm the pin location before continuing.';
      if (!form.rightToList) e.rightToList = 'Confirm you have the right to list this spot.';
    }
    if (s === 1) {
      const [lo, hi] = form.level === 'L2' ? [L2_KW_MIN, CHARGER_KW_MAX] : [CHARGER_KW_MIN, L1_KW_MAX];
      if (!Number.isFinite(kw) || kw < lo || kw > hi) e.kw = `Enter a power between ${lo} and ${hi} kW for ${form.level}.`;
      if (form.level === 'L1' && !form.outdoorOutlet) e.outdoorOutlet = 'L1 needs a dedicated outdoor-rated outlet.';
      if (form.solar === 'yes') {
        const s2 = Number(form.solarKw);
        if (form.solarKw.trim() === '' || !Number.isFinite(s2) || s2 < 0 || s2 > SOLAR_KW_MAX) e.solarKw = `Enter your system size between 0 and ${SOLAR_KW_MAX} kW.`;
      }
    }
    if (s === 2) {
      const r = Number(form.rate);
      if (!Number.isFinite(r) || r < MIN_LOCAL_RATE || r > MAX_LOCAL_RATE) e.rate = `Enter a rate between ${money(MIN_LOCAL_RATE)} and ${money(MAX_LOCAL_RATE)} per kWh.`;
      const en = Number(form.earnings);
      if (!Number.isFinite(en) || en <= 0) e.earnings = 'Enter what you’d like to earn per hour.';
      else if (en > earningsCap) e.earnings = `The most you can set here is ${money(earningsCap)} per hour (2× the suggested ${money(SUGGESTED_EARNINGS_HR)}).`;
    }
    if (s === 3) {
      if (form.title.trim().length < 4) e.title = 'Give your listing a title.';
      if (form.photos.length < 1) e.photos = 'Add at least one photo.';
      if (form.instructions.trim().length < 20) e.instructions = 'Write at least 20 characters so drivers can find the spot.';
    }
    if (s === 4) {
      if (form.windows.length < 1) e.windows = 'Add at least one availability window.';
      else if (form.windows.some((w) => w.days.length === 0)) e.windows = 'Pick at least one day for each window.';
      else if (form.windows.some((w) => w.start === w.end)) e.windows = 'Each window needs different start and end times.';
    }
    if (s === 5 && !form.terms) e.terms = 'Accept the terms to publish.';
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
      setStep(0);
      window.scrollTo({ top: 0 });
      return;
    }
    setBusy(true);
    if (backend) return void publishOnServer(pin);
    const a = form.addr;
    const listing: Listing = {
      // Editing keeps the same listing, so links and the host's own-listing check still match it.
      id: editing ? hostListing!.id : `host-${Date.now()}`,
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
      hostName: (user?.name ?? '').trim().split(/\s+/)[0],
      rate: Number(form.rate),
      rateSource: rateEdited ? 'HOST' : rateInfo.status === 'eia' ? 'EIA' : 'FALLBACK',
      rateDataMonth: !rateEdited && rateInfo.status === 'eia' ? rateInfo.resolution.dataMonth : null,
      earningsHr: Number(form.earnings),
      windows: form.windows,
      instructions: form.instructions.trim(),
      photos: form.photos,
      isNew: editing ? hostListing!.isNew : true,
    };
    // The account already exists (made at sign-up), so publishing only adds (or replaces) its listing.
    update({ hostListing: listing });
    navigate(HOST_HOME_PATH);
  }

  /**
   * Backend: upload new photos (existing ones keep their keys), then PUT /me/listing. The server reruns the full
   * validation (features/host/validateListing.ts); its field errors land on the matching step.
   */
  async function publishOnServer(pin: PinState) {
    const stop = (errs: Errors, toStep?: number) => {
      setBusy(false);
      setErrors(errs);
      if (toStep !== undefined) setStep(toStep);
      window.scrollTo({ top: 0 });
    };
    const keys: string[] = [];
    for (const photo of form.photos) {
      const i = hostListing?.photos.indexOf(photo) ?? -1;
      const kept = i >= 0 ? hostListing?.photoKeys?.[i] : undefined;
      if (kept) {
        keys.push(kept);
        continue;
      }
      const up = await uploadPhoto(backend!.api, { kind: 'listing' }, photo);
      if (!up.ok) return stop({ photos: up.message, publish: up.message }, 3);
      keys.push(up.key);
    }
    const a = form.addr;
    const r = await backend!.api.saveListing({
      title: form.title.trim(),
      street: a.streetName,
      neighborhood: a.neighborhood,
      address: { line: a.line, unit: form.unit.trim() || null, city: a.city, zip: a.zip },
      lat: pin.lat,
      lng: pin.lng,
      spotType: form.spotType,
      spots: form.spots,
      rightToList: form.rightToList,
      level: form.level,
      chargerKw: kw,
      plug: form.plug,
      adapters,
      outdoorOutlet: form.outdoorOutlet,
      solarKw: form.solar === 'yes' ? Number(form.solarKw) : 0,
      rate: Number(form.rate),
      rateSource: rateEdited ? 'HOST' : rateInfo.status === 'eia' ? 'EIA' : 'FALLBACK',
      rateDataMonth: !rateEdited && rateInfo.status === 'eia' ? rateInfo.resolution.dataMonth : null,
      earningsHr: Number(form.earnings),
      windows: form.windows,
      instructions: form.instructions.trim(),
      photoKeys: keys,
      termsAccepted: form.terms,
    });
    if (!r.ok) {
      const fields = (r.details.fields ?? {}) as Partial<Record<ListingField, string>>;
      const names = Object.keys(fields) as ListingField[];
      if (names.length === 0) return stop({ publish: r.message });
      return stop({ ...fields, publish: `Some details need fixing: ${Object.values(fields).join(' ')}` }, Math.min(...names.map((f) => FIELD_STEP[f] ?? 5)));
    }
    update({ hostListing: r.data.listing });
    await syncAccount();
    setBusy(false);
    navigate(HOST_HOME_PATH);
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
    setForm((f) => ({ ...f, searchText: text, addr: NO_ADDR, pin: null, missing: { city: false, zip: false } }));
  }

  function onSelectAddress(a: GeocodedAddress) {
    if (!isMassachusetts(a)) {
      setAddrNotice(`That address is in ${a.state || 'another state'}. Dwell is only available in Massachusetts right now.`);
      setForm((f) => ({ ...f, addr: NO_ADDR, pin: null }));
      return;
    }
    setAddrNotice('');
    clearErrors('address', 'city', 'zip');
    // Keep a ZIP only if it is a real Massachusetts one. A missing or out-of-state ZIP is asked for instead.
    const zipOk = isMassachusettsZip(a.zip);
    const cityOk = a.city.trim().length >= 2;
    setForm((f) => ({
      ...f,
      searchText: a.line1,
      addr: { source: 'geocode', line: a.line1, streetName: a.streetName, city: cityOk ? a.city : '', zip: zipOk ? a.zip : '', neighborhood: a.neighborhood },
      missing: { city: !cityOk, zip: !zipOk },
      // Start the pin at the geocoded point; the host must still place it exactly and confirm it.
      pin: { lat: a.lat, lng: a.lng, confirmed: false },
      recenter: f.recenter + 1,
    }));
  }

  /**
   * Typing an address by hand keeps the pin where it is (clearing it on every keystroke threw away a placed pin), but
   * the pin has to be confirmed again, because the address it was confirmed for has changed.
   */
  function editManual(field: 'line' | 'city' | 'zip', value: string) {
    setFindMsg('');
    setForm((f) => {
      const addr = { ...f.addr, source: 'manual' as const, [field]: value };
      return {
        ...f,
        addr: { ...addr, streetName: stripHouseNumber(addr.line), neighborhood: addr.city },
        pin: f.pin ? { ...f.pin, confirmed: false } : null,
      };
    });
  }

  const canFindTyped = form.addr.line.trim().length >= 4 && (form.addr.city.trim().length >= 2 || isMassachusettsZip(form.addr.zip));

  /** Look up the typed address and move the pin there, so the host starts close instead of at the state's center. */
  async function findTypedAddress() {
    const a = form.addr;
    const q = [a.line, a.city, `MA ${a.zip}`.trim()].filter((p) => p.trim()).join(', ');
    setFinding(true);
    setFindMsg('');
    // Try for the exact address first, then the street or town, so the map at least lands nearby.
    let hit: GeocodedAddress | undefined;
    for (const types of [ADDRESS_TYPES, DESTINATION_TYPES]) {
      const r = await searchAddresses(q, { types, limit: 5 });
      hit = r.ok ? r.results.find(isMassachusetts) : undefined;
      if (hit) break;
    }
    setFinding(false);
    if (!hit) {
      setFindMsg('We couldn’t find that address. Drag the pin or click the map to place it.');
      return;
    }
    clearErrors('pin');
    const exact = hit.featureType === 'address';
    setFindMsg(exact ? 'Pin moved to that address. Check it, then confirm.' : `Pin moved near ${hit.label}. Drag it to your driveway, then confirm.`);
    setForm((f) => ({ ...f, pin: { lat: hit!.lat, lng: hit!.lng, confirmed: false }, recenter: f.recenter + 1 }));
  }

  /** Fill in a part the search result left out. The pin stays: the point on the map has not changed. */
  function fillGeocoded(field: 'city' | 'zip', value: string) {
    clearErrors(field);
    setForm((f) => ({ ...f, addr: { ...f.addr, [field]: value } }));
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
    // 0 Your spot
    <>
      {form.manual ? (
        <div className="flex flex-col gap-4">
          <p className="rounded-card bg-surface p-3.5 text-[14px] text-body">
            Entering your address by hand. You will place and confirm the pin yourself.{' '}
            <button
              type="button"
              className="whitespace-nowrap font-medium text-ink underline decoration-line-strong decoration-1 underline-offset-4 transition-colors hover:decoration-brand hover:text-brand active:text-green-deep"
              onClick={() => setForm((f) => ({ ...f, manual: false, addr: NO_ADDR, pin: null, searchText: '' }))}
            >
              Use address search instead
            </button>
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
          <div className="flex flex-col gap-1.5">
            <div>
              <Button variant="secondary" onClick={findTypedAddress} disabled={!canFindTyped || finding}>
                <Pin size={18} />
                {finding ? 'Finding…' : 'Find this address on the map'}
              </Button>
            </div>
            {findMsg && (
              <p className="text-[13px] text-muted" role="status">
                {findMsg}
              </p>
            )}
          </div>
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
              {form.missing.city ? (
                <TextField
                  label="City or town"
                  autoComplete="address-level2"
                  hint="The search result didn’t include a town."
                  value={form.addr.city}
                  error={errors.city}
                  onChange={(e) => fillGeocoded('city', e.target.value)}
                />
              ) : (
                <TextField label="City or town" value={form.addr.city} readOnly hint="From your selected address" />
              )}
              <TextField label="State" value="MA" readOnly />
              {form.missing.zip ? (
                <TextField
                  label="ZIP code"
                  inputMode="numeric"
                  maxLength={5}
                  autoComplete="postal-code"
                  hint="The search result didn’t include a ZIP. It fills in your electricity rate."
                  value={form.addr.zip}
                  error={errors.zip}
                  onChange={(e) => fillGeocoded('zip', digitsOnly(e.target.value).slice(0, 5))}
                />
              ) : (
                <TextField label="ZIP code" value={form.addr.zip} readOnly />
              )}
            </AutoGrid>
          )}
          <p className="text-[13px] text-muted">
            Can’t find it?{' '}
            <button type="button" className="whitespace-nowrap font-medium text-ink underline decoration-line-strong decoration-1 underline-offset-4 transition-colors hover:decoration-brand hover:text-brand active:text-green-deep" onClick={useManualEntry}>
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
        <div className="rounded-card border border-dashed border-line-strong p-5 text-[14px] text-muted" data-testid="pin-placeholder">
          The map appears after you choose an address. You will drag the pin to your driveway or charger entrance and confirm it.
          {errors.pin && (
            <p role="alert" className="mt-2 text-[13px] font-medium text-amber-ink">
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
        <span className="text-[14px] font-medium text-ink">Number of spots</span>
        <Stepper label="Spots" value={form.spots} min={1} max={4} onChange={(n) => set('spots', n)} />
      </div>
      <CheckboxCard checked={form.rightToList} onChange={(v) => set('rightToList', v)} lead="I have the right to list this spot." error={errors.rightToList}>
        I own it, or my landlord, condo association or shared-driveway neighbors allow it.
      </CheckboxCard>
    </>,

    // 1 Charger
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
        <span className="text-[14px] font-medium text-ink">Charger power</span>
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
          <p role="alert" className="text-[13px] font-medium text-amber-ink">
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
      <p className="rounded-card bg-surface p-3.5 text-[14px] font-medium text-body">
        {form.level}, {Number.isFinite(kw) && kw > 0 ? `${kw} kW` : 'kW not set'}, {form.plug}
        {form.hasAdapter ? `, adapter to ${otherPlug}` : ''}
        {form.solar === 'yes' && form.solarKw ? `, ${form.solarKw} kW solar` : ''}
      </p>
    </>,

    // 2 Pricing
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
        <h3 className="mb-2 text-[18px] font-semibold text-ink">What drivers pay per hour</h3>
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
            <thead className="bg-surface text-muted">
              <tr>
                {['Car', 'Draws', 'Electricity', 'You earn', 'Driver pays'].map((h, i) => (
                  <th key={h} scope="col" className={`px-4 py-3 font-medium ${i > 0 ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {priceRows.map(({ car, p }) => (
                <tr key={car.id} className="border-t border-line">
                  <th scope="row" className="px-4 py-3 font-medium text-ink">{car.name}</th>
                  <td className="px-4 py-3 text-right">{p ? `${p.P_eff} kW` : 'n/a'}</td>
                  <td className="px-4 py-3 text-right">{p ? money(p.electricity_cost_per_hr) : 'n/a'}</td>
                  <td className="px-4 py-3 text-right">{money(Number(form.earnings) || 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{p ? money(p.price_per_hr) : 'n/a'}</td>
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

    // 3 Photos & instructions
    <>
      <TextField label="Listing title" value={form.title} error={errors.title} onChange={(e) => { titleTouched.current = true; set('title', e.target.value); }} />
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-medium text-ink">Photos</span>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
          {form.photos.map((src, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-card bg-surface">
              <img src={src} alt={`Listing photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => set('photos', form.photos.filter((_, j) => j !== i))}
                className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-paper text-[18px] font-medium text-ink shadow-pin hover:text-brand"
              >
                ×
              </button>
            </div>
          ))}
          {form.photos.length < 8 && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-line-strong text-[14px] font-medium text-muted hover:border-brand focus-within:outline-2">
              <span className="text-[26px] leading-none">+</span>
              Add photos
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
        {(errors.photos || photoError) && (
          <p role="alert" className="text-[13px] font-medium text-amber-ink">
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

    // 4 Availability
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Add a window">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => addWindow(p.w)} className="h-10 rounded-full border border-pill bg-paper px-3 text-[14px] font-medium text-ink hover:border-brand">
            {p.label}
          </button>
        ))}
      </div>
      {errors.windows && (
        <p role="alert" className="text-[13px] font-medium text-amber-ink">
          {errors.windows}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {form.windows.map((w) => (
          <div key={w.id} className="flex flex-col gap-3 rounded-card border border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[16px] font-semibold text-ink">{windowSummary(w)}</p>
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
                    className={`h-11 w-12 rounded-full border text-[14px] font-medium ${on ? 'border-ink bg-ink text-on-ink' : 'border-pill bg-paper text-ink hover:border-brand'}`}
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

    // 5 Review
    <>
      <dl className="m-0 flex flex-col divide-y divide-line rounded-card border border-line">
        {[
          { i: 0, k: 'Spot', v: `${form.spotType}, ${form.addr.line}${form.unit ? ` #${form.unit}` : ''}, ${form.addr.city}, MA ${form.addr.zip}. Pin ${form.pin?.confirmed ? 'confirmed' : 'not confirmed'}, ${form.spots} spot${form.spots > 1 ? 's' : ''}` },
          { i: 1, k: 'Charger', v: `${form.level}, ${kw} kW, ${form.plug}${form.hasAdapter ? `, adapter to ${otherPlug}` : ''}${form.solar === 'yes' ? `, ${form.solarKw} kW solar` : ''}` },
          { i: 2, k: 'Pricing', v: `${money(Number(form.rate) || 0)}/kWh, you earn ${money(Number(form.earnings) || 0)}/hr` },
          { i: 3, k: 'Listing', v: `${form.title}, ${form.photos.length} photo${form.photos.length === 1 ? '' : 's'}` },
          { i: 4, k: 'Availability', v: form.windows.map(windowSummary).join('; ') },
        ].map((r) => (
          <div key={r.k} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <dt className="text-[13px] font-medium text-muted">{r.k}</dt>
              <dd className="m-0 text-[15px] font-medium text-ink">{r.v}</dd>
            </div>
            <Button variant="link" size="nav" onClick={() => setStep(r.i)} aria-label={`Edit ${r.k}`}>
              Edit
            </Button>
          </div>
        ))}
      </dl>
      <div className="rounded-card bg-surface p-4">
        <h3 className="text-[16px] font-semibold text-ink">What happens next</h3>
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

  // Hosting needs an account (made once, at sign-up) and allows one listing for now. This comes after every hook.
  if (!user) return <Navigate to={SIGNUP_FOR_HOSTING_PATH} replace />;
  // One listing per account: a new listing only when there is none, and editing only when there is one.
  if (mode === 'new' && hostListing) return <Navigate to={HOST_HOME_PATH} replace />;
  if (mode === 'edit' && !hostListing) return <Navigate to={NEW_LISTING_PATH} replace />;

  const last = step === STEPS.length - 1;
  const head = editing && last ? { title: 'Review and save', why: 'Use Edit on any section to change it, then save.' } : STEP_HEAD[step];

  return (
    <div className="min-h-dvh bg-surface">
      <Header />
      <main className="mx-auto max-w-[1120px] px-6 pb-16 pt-8">
        {errors.publish && <WarnNote className="mb-6">{errors.publish}</WarnNote>}
        <Wizard
          title={editing ? 'Edit your listing' : 'List your charger'}
          steps={STEPS}
          current={step}
          onStepClick={(i) => {
            setErrors({});
            setStep(i);
            window.scrollTo({ top: 0 });
          }}
          stepTitle={head.title}
          stepWhy={head.why}
          nextLabel={editing && last ? 'Save changes' : undefined}
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
