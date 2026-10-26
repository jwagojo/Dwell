import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { TextField } from '../components/form';
import Header from '../components/Header';
import { Button } from '../components/ui';
import { registerAccount } from '../state/accounts';
import { useApp, type SignOutProblem } from '../state/AppState';

const MIN_PASSWORD = 8;

/**
 * Signs out, then sends the visitor to the landing page.
 * It is its own route so the page they were on has already unmounted when the account disappears. Otherwise a
 * guarded page (search, listing, session) would see "no user" first and redirect to sign-up instead of home.
 *
 * If the account's data can't be kept for the next sign-in, nothing is removed and this page asks first:
 * an account with no password (made before sign-in existed) can set one now; a full browser storage can stay
 * signed in or sign out anyway.
 */
export default function SignOut() {
  const { user, car, hostListing, booking, signOut } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [problem, setProblem] = useState<SignOutProblem | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return; // StrictMode runs effects twice in development
    tried.current = true;
    const r = signOut();
    if (!r.ok) setProblem(r.reason);
  }, [signOut]);

  if (!user) return <Navigate to="/" replace />;
  if (!problem) return null; // signing out; the redirect above follows on the next render

  const losing = ['your profile', car && 'your car', hostListing && 'your listing', booking && 'your booking'].filter(Boolean).join(', ');
  const stay = () => navigate(from, { replace: true });
  const signOutAnyway = () => signOut({ force: true });

  async function savePasswordAndSignOut(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    setBusy(true);
    const r = await registerAccount(localStorage, password, { user: user!, car, hostListing, booking });
    setBusy(false);
    if (!r.ok) {
      if (r.reason === 'EXISTS') return setError('Another account on this browser already uses this email. Sign out anyway, then sign in with that account.');
      if (r.reason === 'STORAGE') return setProblem('STORAGE');
      return setError('This browser can’t store a password securely right now. Open the site over https or on localhost.');
    }
    const out = signOut();
    if (!out.ok) setProblem(out.reason);
  }

  return (
    <div className="min-h-dvh bg-surface">
      <Header />
      <main className="mx-auto max-w-[560px] px-6 pb-16 pt-10">
        <div className="flex flex-col gap-6 rounded-card border border-line bg-paper p-5 shadow-panel sm:p-7">
          {problem === 'NOT_REGISTERED' ? (
            <form onSubmit={savePasswordAndSignOut} noValidate className="flex flex-col gap-6">
              <div>
                <h1 className="text-[30px] font-semibold text-ink">Set a password before you sign out</h1>
                <p className="mt-2 text-[16px] text-body">
                  This account was made before sign-in existed, so it has no password. Without one, signing out removes {losing} from this browser,
                  and you can’t sign back in.
                </p>
              </div>
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                hint={`At least ${MIN_PASSWORD} characters. Then sign in with ${user.email}.`}
                value={password}
                error={error || undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" size="lg" disabled={busy}>
                  {busy ? 'Saving…' : 'Save password and sign out'}
                </Button>
                <Button variant="ghost" size="lg" onClick={stay}>
                  Stay signed in
                </Button>
              </div>
              <p className="text-[14px] text-muted">
                Don’t need it?{' '}
                <button type="button" onClick={signOutAnyway} className="font-medium text-ink underline decoration-line-strong decoration-1 underline-offset-4 hover:text-brand">
                  Sign out and remove {losing}
                </button>
              </p>
            </form>
          ) : (
            <>
              <div>
                <h1 className="text-[30px] font-semibold text-ink">Your account couldn’t be saved for next time</h1>
                <p className="mt-2 text-[16px] text-body">
                  This browser’s storage is full, so {losing} can’t be kept while you’re signed out. Signing out now removes them from this browser.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={stay}>
                  Stay signed in
                </Button>
                <Button variant="secondary" size="lg" onClick={signOutAnyway}>
                  Sign out anyway
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
