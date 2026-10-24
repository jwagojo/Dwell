import type { AvailabilityWindow } from '../types/listing';

/** Monday = 0 ... Sunday = 6 */
export const todayIndex = (): number => (new Date().getDay() + 6) % 7;

/**
 * True when a booking from `startHour` for `hours` on `dayIndex` sits entirely inside one availability window.
 * Windows are strict: the host cannot free the spot mid-booking. A window with end <= start runs overnight.
 */
export function isOpenFor(windows: AvailabilityWindow[], dayIndex: number, startHour: number, hours: number): boolean {
  const bookingEnd = startHour + hours;
  return windows.some((w) => {
    const overnight = w.end <= w.start;
    return w.days.some((d) => {
      if (d === dayIndex && startHour >= w.start && bookingEnd <= (overnight ? w.end + 24 : w.end)) return true;
      // The early-morning tail of yesterday's overnight window
      return overnight && (d + 1) % 7 === dayIndex && bookingEnd <= w.end;
    });
  });
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LABELS = DAY_NAMES;

export function summarizeDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const key = sorted.join(',');
  if (key === '0,1,2,3,4,5,6') return 'Every day';
  if (key === '0,1,2,3,4') return 'Weekdays';
  if (key === '5,6') return 'Weekends';
  if (sorted.length === 0) return 'No days';
  return sorted.map((d) => DAY_NAMES[d]).join(', ');
}
