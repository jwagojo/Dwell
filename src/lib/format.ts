export const money = (n: number) => `$${n.toFixed(2)}`;

/** 0..23 (or beyond, wrapping) to "10 AM", "12 PM", "12 AM". */
export function fmtHour(h: number): string {
  const hh = ((Math.round(h) % 24) + 24) % 24;
  const suffix = hh < 12 ? 'AM' : 'PM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12} ${suffix}`;
}

export const fmtRange = (start: number, hours: number, sep = ' to ') => `${fmtHour(start)}${sep}${fmtHour(start + hours)}`;

export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function fmtDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem} min`;
  return rem === 0 ? `${h} h` : `${h} h ${rem} m`;
}

export const todayMidnight = (): number => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-08" -> "August 2026". Anything that is not a YYYY-MM month is returned unchanged. */
export function formatDataMonth(period: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : period;
}

/** Dollars per kWh as text for an input: at least 2 and at most 4 decimals (0.3 -> "0.30", 0.3048 -> "0.3048"). */
export function formatRateInput(rate: number): string {
  const [whole, frac = ''] = String(Number(rate.toFixed(4))).split('.');
  return `${whole}.${frac.padEnd(2, '0')}`;
}
