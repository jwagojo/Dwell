import { describe, expect, it } from 'vitest';
import { serviceDay } from './time';

describe('serviceDay (America/New_York)', () => {
  it('uses Boston time, not the UTC clock Lambda runs on', () => {
    // 01:30 UTC on Thursday is still Wednesday 21:30 in Boston (EDT).
    expect(serviceDay(Date.parse('2026-10-29T01:30:00Z'))).toEqual({ dayStart: Date.parse('2026-10-28T04:00:00Z'), dayIndex: 2, hour: 21 });
  });

  it('handles both sides of a DST change', () => {
    // Nov 1, 2026: clocks fall back at 2 AM. Midnight was still EDT.
    expect(serviceDay(Date.parse('2026-11-01T15:00:00Z'))).toEqual({ dayStart: Date.parse('2026-11-01T04:00:00Z'), dayIndex: 6, hour: 10 });
    // Monday after: EST, UTC-5.
    expect(serviceDay(Date.parse('2026-11-02T05:00:00Z'))).toEqual({ dayStart: Date.parse('2026-11-02T05:00:00Z'), dayIndex: 0, hour: 0 });
  });
});
