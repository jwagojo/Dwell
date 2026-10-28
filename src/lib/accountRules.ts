/**
 * Sign-up rules shared by the sign-up form and the Cognito user pool (infra/lib/data-stack.ts imports these), so the
 * form never accepts something Cognito would reject.
 *
 * Passwords follow Cognito's default policy: at least 8 characters with an upper-case letter, a lower-case letter,
 * a number and a symbol. "Letters" are basic Latin (A-Z, a-z), and the symbols are Cognito's list, which also counts
 * a space that is not at the start or end. Phones are US numbers, stored as 10 digits and sent to Cognito in E.164.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;

/** Cognito's special characters: ^ $ * . [ ] { } ( ) ? " ! @ # % & / \ , > < ' : ; | _ ~ ` = + - and inner spaces. */
const SYMBOL_RE = /[\^$*.[\]{}()?"!@#%&/\\,><':;|_~`=+\- ]/;

export interface PasswordCheck {
  ok: boolean;
  /** What is still missing, in plain words ("a number", "a symbol"). Empty when ok. */
  missing: string[];
}

export function checkPassword(password: string): PasswordCheck {
  const missing: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) missing.push(`at least ${PASSWORD_MIN_LENGTH} characters`);
  if (!/[A-Z]/.test(password)) missing.push('an upper-case letter');
  if (!/[a-z]/.test(password)) missing.push('a lower-case letter');
  if (!/[0-9]/.test(password)) missing.push('a number');
  // A space only counts when it is inside the password; Cognito rejects leading and trailing spaces anyway.
  if (!SYMBOL_RE.test(password.trim())) missing.push('a symbol');
  return { ok: missing.length === 0, missing };
}

/** "a number and a symbol" style list for messages. */
const joinAnd = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** The form's message for a password, or null when it passes. */
export function passwordError(password: string): string | null {
  if (password !== password.trim()) return 'Remove the space at the start or end.';
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  const { ok, missing } = checkPassword(password);
  return ok ? null : `Add ${joinAnd(missing)}.`;
}

export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with upper- and lower-case letters, a number and a symbol.`;

/**
 * A US phone number as 10 digits, or null. Accepts any punctuation and a leading country code ("+1 (617) 555-0100").
 */
export function parseUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return /^\d{10}$/.test(ten) ? ten : null;
}

/** The E.164 form Cognito requires for `phone_number`: "+1" and the 10 digits. */
export const toE164Us = (tenDigits: string): string => `+1${tenDigits}`;
