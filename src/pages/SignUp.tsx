import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckboxCard, TextField } from '../components/form';
import Header from '../components/Header';
import { AutoGrid, Button } from '../components/ui';
import { NEW_LISTING_PATH, SIGNIN_PATH } from '../lib/hostEntry';
import { registerAccount } from '../state/accounts';
import { useApp } from '../state/AppState';

type Errors = Partial<Record<'name' | 'phone' | 'email' | 'password' | 'terms', string>>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const digitsOnly = (s: string) => s.replace(/\D/g, '');

/**
 * The one sign-up. The account is not a driver or a host: it can do both. `?next=host` (from "Host an EV charger")
 * continues to the listing steps afterwards. A destination picked on the landing page is already saved in app state.
 */
export default function SignUp() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, update } = useApp();
  const forHosting = params.get('next') === 'host';
  const afterSignUp = forHosting ? NEW_LISTING_PATH : '/search';

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    terms: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function validate(): Errors {
    const e: Errors = {};
    if (form.name.trim().length < 2) e.name = 'Enter your full name.';
    if (digitsOnly(form.phone).length !== 10) e.phone = 'Enter a 10-digit phone number.';
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (form.password.length < 8) e.password = 'Use at least 8 characters.';
    if (!form.terms) e.terms = 'Accept the terms to continue.';
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    // No car is asked for here: someone who only hosts has no EV to price for. Search lets them pick one.
    const user = { name: form.name.trim(), email: form.email.trim(), phone: digitsOnly(form.phone) };
    // The password is saved only as a salted hash (state/accounts.ts), so this browser can sign the account back in.
    setBusy(true);
    const result = await registerAccount(localStorage, form.password, { user, car: null, hostListing: null, booking: null });
    setBusy(false);
    if (!result.ok) {
      setErrors(
        result.reason === 'EXISTS'
          ? { email: 'An account with this email already exists. Sign in instead.' }
          : { password: 'This browser can’t store a password securely right now. Open the site over https or on localhost.' },
      );
      return;
    }
    update({ user });
    navigate(afterSignUp);
  }

  // Already signed in: there is nothing to create. Send them where this sign-up was headed.
  if (user) return <Navigate to={afterSignUp} replace />;

  return (
    <div className="min-h-dvh bg-surface">
      <Header />
      <main className="mx-auto max-w-[760px] px-6 pb-16 pt-10">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8 rounded-card border border-line bg-paper p-5 shadow-panel sm:p-7">
          <div>
            <h1 className="text-[30px] font-semibold text-ink">Create your Dwell account</h1>
            <p className="mt-2 text-[16px] text-body">
              Start parking or hosting
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

          <CheckboxCard checked={form.terms} onChange={(v) => set('terms', v)} lead="I agree to the Dwell terms." error={errors.terms}>
            Pickup ends my session, late minutes are billed, and there is no refund for unused hours.
          </CheckboxCard>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-[15px] text-muted">
              Already have an account?{' '}
              <Link to={SIGNIN_PATH} className="font-medium text-ink underline decoration-line-strong decoration-1 underline-offset-4 transition-colors hover:decoration-brand hover:text-brand active:text-green-deep">
                Sign in
              </Link>
            </p>
            <Button type="submit" size="lg" disabled={busy}>
              Create Account
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
