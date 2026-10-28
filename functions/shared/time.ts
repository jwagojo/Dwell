/**
 * Dwell serves Massachusetts, and bookings are "today, whole hours" in local time. Lambda clocks run in UTC, so every
 * day and hour decision on the server uses America/New_York explicitly.
 */
export const SERVICE_TIME_ZONE = 'America/New_York';
export const HOUR_MS = 3_600_000;

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SERVICE_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  weekday: 'short',
});

const WEEKDAY_MON0: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function zoned(ms: number) {
  const p: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(ms))) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAY_MON0[p.weekday],
  };
}

/** Milliseconds the zone is ahead of UTC at `ms` (negative in Boston). */
function offsetAt(ms: number): number {
  const z = zoned(ms);
  return Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second) - Math.floor(ms / 1000) * 1000;
}

export interface ServiceDay {
  /** Local midnight, epoch ms */
  dayStart: number;
  /** Monday = 0 */
  dayIndex: number;
  /** Local hour 0..23 */
  hour: number;
}

/** Today in Boston at `nowMs`: the app's `dayStart`, `dayIndex` and the current hour. */
export function serviceDay(nowMs: number): ServiceDay {
  const z = zoned(nowMs);
  const midnightAsUtc = Date.UTC(z.year, z.month - 1, z.day);
  // Two passes: the offset at midnight can differ from the offset now on a DST change day.
  let dayStart = midnightAsUtc - offsetAt(nowMs);
  dayStart = midnightAsUtc - offsetAt(dayStart);
  return { dayStart, dayIndex: z.weekday, hour: z.hour };
}
