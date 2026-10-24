import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import DestinationSearch from '../components/DestinationSearch';
import { CheckboxCard, ChoiceGroup, SelectField, TextField } from '../components/form';
import Header from '../components/Header';
import { AutoGrid, Button, StatTile } from '../components/ui';
import { EV_MODELS, OTHER_CAR_ID, carById } from '../data/evFallbackSeed';
import { DEFAULT_DESTINATION, stationIdToDestination } from '../data/destinations';
import { STATIONS } from '../data/stations';
import type { Plug } from '../engines/plug';
import { useApp } from '../state/AppState';
import type { Destination } from '../types/destination';
import type { Car } from '../types/listing';

type Errors = Partial<Record<'name' | 'phone' | 'email' | 'password' | 'car' | 'customName' | 'customKw' | 'customPlug' | 'terms', string>>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const digitsOnly = (s: string) => s.replace(/\D/g, '');

export default function DriverSignup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { destination: savedDestination, update } = useApp();

  const initialTo = params.get('to');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    carId: '',
    customName: '',
    customKw: '',
    customPlug: null as Plug | null,
    plate: '',
    destination: (initialTo && STATIONS.some((s) => s.id === initialTo) ? stationIdToDestination(initialTo) : (savedDestination ?? DEFAULT_DESTINATION)) as Destination,
    destinationText: '',
    terms: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const known = carById(form.carId);
  const isOther = form.carId === OTHER_CAR_ID;

  function validate(): Errors {
    const e: Errors = {};
    if (form.name.trim().length < 2) e.name = 'Enter your full name.';
    if (digitsOnly(form.phone).length !== 10) e.phone = 'Enter a 10-digit phone number.';
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (form.password.length < 8) e.password = 'Use at least 8 characters.';
    if (!form.carId) e.car = 'Choose your car so we can price each charger for it.';
    if (isOther) {
      if (form.customName.trim().length < 2) e.customName = 'Enter your car’s make and model.';
      if (form.customKw.trim() !== '') {
        const kw = Number(form.customKw);
        if (!Number.isFinite(kw) || kw < 1 || kw > 22) e.customKw = 'Enter a value between 1 and 22 kW, or leave it blank.';
      }
      if (!form.customPlug) e.customPlug = 'Choose your car’s plug.';
    }
    if (!form.terms) e.terms = 'Accept the terms to continue.';
    return e;
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    let car: Car;
    if (isOther) {
      const kw = form.customKw.trim() === '' ? null : Number(form.customKw);
      car = { id: OTHER_CAR_ID, name: form.customName.trim(), maxAcKw: kw, plug: form.customPlug! };
    } else {
      car = known!;
    }
    // Password is intentionally dropped: prototype only, Cognito handles it later.
    update({
      user: { role: 'driver', name: form.name.trim(), email: form.email.trim(), phone: digitsOnly(form.phone) },
      car,
      destination: form.destination,
    });
    navigate('/search');
  }

  return (
    <div className="min-h-dvh bg-surface">
      <Header />
      <main className="mx-auto max-w-[760px] px-6 pb-16 pt-10">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8 rounded-card border border-line bg-paper p-5 shadow-panel sm:p-7">
          <div>
            <h1 className="text-[30px] font-semibold text-ink">Sign up to park and charge</h1>
            <p className="mt-2 text-[16px] text-body">
              Your car sets the price you see on every listing, because it decides how much power you can actually draw.
            </p>
          </div>

          <section aria-labelledby="acct" className="flex flex-col gap-4">
            <h2 id="acct" className="text-[18px] font-semibold text-ink">Your account</h2>
            <AutoGrid min={240} gap={16}>
              <TextField label="Full name" autoComplete="name" value={form.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
              <TextField label="Phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} error={errors.phone} onChange={(e) => set('phone', e.target.value)} />
            </AutoGrid>
            <TextField label="Email" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={(e) => set('email', e.target.value)} />
            <TextField
              label="Password"
              type="password"
              autoComplete="new-password"
              hint="At least 8 characters."
              value={form.password}
              error={errors.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </section>

          <section aria-labelledby="ev" className="flex flex-col gap-4">
            <h2 id="ev" className="text-[18px] font-semibold text-ink">Your EV</h2>
            <SelectField label="Make and model" value={form.carId} error={errors.car} onChange={(e) => set('carId', e.target.value)}>
              <option value="">Select your car</option>
              {EV_MODELS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={OTHER_CAR_ID}>Other / not listed</option>
            </SelectField>

            {known && (
              <AutoGrid min={180} gap={12}>
                <StatTile label="Max charging speed (AC)" value={`${known.maxAcKw} kW`} />
                <StatTile label="Plug" value={known.plug} />
              </AutoGrid>
            )}

            {isOther && (
              <div className="flex flex-col gap-4">
                <TextField label="Make and model" value={form.customName} error={errors.customName} onChange={(e) => set('customName', e.target.value)} />
                <TextField
                  label="Max AC charging speed (kW)"
                  optional
                  inputMode="decimal"
                  hint="Leave blank and we price at each charger’s full power."
                  value={form.customKw}
                  error={errors.customKw}
                  onChange={(e) => set('customKw', e.target.value)}
                />
                <ChoiceGroup<Plug>
                  legend="Your car’s plug"
                  options={[
                    { value: 'J1772', label: 'J1772', sub: 'Most non-Tesla EVs' },
                    { value: 'NACS', label: 'NACS', sub: 'Teslas and newer EVs' },
                  ]}
                  value={form.customPlug}
                  onChange={(v) => set('customPlug', v)}
                  error={errors.customPlug}
                />
              </div>
            )}

            <TextField
              label="License plate"
              optional
              hint="Helps the host recognize your car in their driveway."
              autoComplete="off"
              value={form.plate}
              onChange={(e) => set('plate', e.target.value)}
            />
          </section>

          <section aria-labelledby="dest" className="flex flex-col gap-4">
            <h2 id="dest" className="text-[18px] font-semibold text-ink">Where are you headed first?</h2>
            <DestinationSearch
              label="Destination"
              value={form.destinationText}
              placeholder="T station or address"
              hint={`Selected: ${form.destination.label}. Search to change it.`}
              onInputChange={(t) => set('destinationText', t)}
              onSelect={(d) => setForm((f) => ({ ...f, destination: d, destinationText: d.label }))}
            />
          </section>

          <CheckboxCard checked={form.terms} onChange={(v) => set('terms', v)} lead="I agree to the Dwell terms." error={errors.terms}>
            Pickup ends my session, late minutes are billed, and there is no refund for unused hours.
          </CheckboxCard>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-[15px] text-body">
              Have a charger instead?{' '}
              <Link to="/signup/host" className="font-medium text-ink underline decoration-line-strong decoration-1 underline-offset-4 transition-colors hover:decoration-brand hover:text-brand active:text-green-deep">
                List it
              </Link>
            </p>
            <Button type="submit" size="lg">
              Create account and find chargers
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
