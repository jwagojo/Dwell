import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import ConfirmEmail from '../components/ConfirmEmail';
import { TextField } from '../components/form';
import Header from '../components/Header';
import { Button } from '../components/ui';
import { SIGNUP_PATH } from '../lib/hostEntry';
import { authenticate } from '../state/accounts';
import { useApp } from '../state/AppState';
import { DEMO_EMAIL, DEMO_PASSWORD, SHOW_DEMO_HINT } from '../state/demoAccount';
import { EMAIL_RE } from './SignUp';

type Errors = Partial<Record<'email' | 'password', string>>;

const LANDING_AFTER_SIGN_IN = '/search';

/**
 * Sign-in. Backend mode: Amazon Cognito, then the account loads from the API. Prototype mode: checks the email and
 * password against the accounts saved in this browser (state/accounts.ts).
 */
export default function SignIn() {
  const navigate = useNavigate();
  const { user, signIn, backend, syncAccount } = useApp();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  // Backend: the account exists but its email was never confirmed.
  const [confirming, setConfirming] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e: Errors = {};
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter the email you signed up with.';
    if (form.password === '') e.password = 'Enter your password.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    if (backend) return signInWithCognito();

    setBusy(true);
    const result = await authenticate(localStorage, form.email, form.password);
    setBusy(false);
    if (!result.ok) {
      setErrors({
        password:
          result.reason === 'INVALID'
            ? 'That email and password don’t match an account on this browser.'
            : 'This browser can’t check passwords right now. Open the site over https or on localhost.',
      });
      return;
    }
    signIn(result.data);
    navigate(LANDING_AFTER_SIGN_IN);
  }

  async function signInWithCognito() {
    setBusy(true);
    const r = await backend!.signIn(form.email, form.password);
    if (!r.ok) {
      setBusy(false);
      if (r.code === 'NOT_CONFIRMED') return setConfirming(true);
      setConfirming(false);
      return setErrors({ password: r.message });
    }
    const sync = await syncAccount();
    setBusy(false);
    if (!sync.ok) {
      setConfirming(false);
      return setErrors({ password: sync.message });
    }
    navigate(LANDING_AFTER_SIGN_IN);
  }

  // Already signed in: nothing to do here.
  if (user) return <Navigate to={LANDING_AFTER_SIGN_IN} replace />;

  return (
    <div className="min-h-dvh bg-surface">
      <Header />
      <main className="mx-auto max-w-[560px] px-6 pb-16 pt-10">
        {confirming && backend ? (
          <div className="rounded-card border border-line bg-paper p-5 shadow-panel sm:p-7">
            <ConfirmEmail backend={backend} email={form.email.trim()} onConfirmed={signInWithCognito} />
          </div>
        ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 rounded-card border border-line bg-paper p-5 shadow-panel sm:p-7">
          <div>
            <h1 className="text-[30px] font-semibold text-ink">Sign in to Dwell</h1>
            <p className="mt-2 text-[16px] text-body">Pick up where you left off, as a driver, a host, or both.</p>
          </div>

          <TextField label="Email" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={(e) => set('email', e.target.value)} />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            error={errors.password}
            onChange={(e) => set('password', e.target.value)}
          />

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-[15px] text-muted">
              New to Dwell?{' '}
              <Link to={SIGNUP_PATH} className="font-medium text-ink underline decoration-line-strong decoration-1 underline-offset-4 transition-colors hover:decoration-brand hover:text-brand active:text-green-deep">
                Create an account
              </Link>
            </p>
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </div>
        </form>
        )}
        {SHOW_DEMO_HINT && !backend && (
          <p className="mt-4 text-[13px] text-muted">
            Dev server only: try {DEMO_EMAIL} with password {DEMO_PASSWORD}.
          </p>
        )}
      </main>
    </div>
  );
}
