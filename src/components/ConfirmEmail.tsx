import { useState, type FormEvent } from 'react';
import type { DwellBackend } from '../state/backend';
import { TextField } from './form';
import { Button } from './ui';

/**
 * Backend mode: enter the code Cognito emailed after sign-up. Confirming creates the profile (post-confirmation
 * trigger), then `onConfirmed` signs the person in. Used by sign-up and by sign-in for an unconfirmed account.
 */
export default function ConfirmEmail({ backend, email, onConfirmed }: { backend: DwellBackend; email: string; onConfirmed: () => Promise<void> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    setError('');
    const r = await backend.confirm(email, code);
    if (!r.ok && r.code !== 'NOT_AUTHORIZED') {
      setBusy(false);
      return setError(r.message);
    }
    // NOT_AUTHORIZED here means the account is already confirmed, so signing in is the right next step.
    await onConfirmed();
    setBusy(false);
  }

  async function resend() {
    setNotice('');
    setError('');
    const r = await backend.resendCode(email);
    if (r.ok) setNotice(`We sent a new code to ${email}.`);
    else setError(r.message);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div>
        <h1 className="text-[30px] font-semibold text-ink">Check your email</h1>
        <p className="mt-2 text-[16px] text-body">We sent a 6-digit code to {email}. Enter it to confirm your account.</p>
      </div>
      <TextField
        label="Confirmation code"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        error={error || undefined}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
          setError('');
        }}
      />
      {notice && (
        <p role="status" className="text-[14px] text-green-ink">
          {notice}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button type="button" onClick={resend} className="text-[15px] font-medium text-ink underline decoration-line-strong decoration-1 underline-offset-4 hover:text-brand">
          Send a new code
        </button>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Confirming…' : 'Confirm and continue'}
        </Button>
      </div>
    </form>
  );
}
