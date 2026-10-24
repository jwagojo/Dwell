import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCAL_RATE } from './constants';
import { centsToDollars, isPlausibleCents, isValidDataMonth, resolveRate } from './rate';
import { formatDataMonth, formatRateInput } from '../lib/format';

describe('centsToDollars (EIA reports cents per kWh)', () => {
  it('divides by 100 without floating-point noise', () => {
    expect(centsToDollars(30.48)).toBe(0.3048);
    expect(centsToDollars(28.1)).toBe(0.281);
    expect(centsToDollars(31.25)).toBe(0.3125);
    expect(centsToDollars(30)).toBe(0.3);
    expect(centsToDollars(5)).toBe(0.05);
  });
});

describe('resolveRate', () => {
  it('uses a valid EIA record: dollars per kWh, with the data month kept', () => {
    expect(resolveRate({ centsPerKwh: 30.48, period: '2026-08' })).toEqual({
      local_rate: 0.3048,
      source: 'EIA',
      dataMonth: '2026-08',
      overridable: true,
    });
  });

  it('falls back to the documented $0.30/kWh estimate when there is no record', () => {
    expect(resolveRate(null)).toEqual({ local_rate: DEFAULT_LOCAL_RATE, source: 'DEFAULT_0_30', dataMonth: null, overridable: true });
    expect(DEFAULT_LOCAL_RATE).toBe(0.3);
  });

  it.each([
    ['a zero price', { centsPerKwh: 0, period: '2026-08' }],
    ['a negative price', { centsPerKwh: -4, period: '2026-08' }],
    ['NaN', { centsPerKwh: Number.NaN, period: '2026-08' }],
    ['a value that is dollars mistaken for cents (0.30)', { centsPerKwh: 0.3, period: '2026-08' }],
    ['an implausibly large price', { centsPerKwh: 3048, period: '2026-08' }],
    ['a malformed month', { centsPerKwh: 30.48, period: '2026-8' }],
    ['an impossible month', { centsPerKwh: 30.48, period: '2026-13' }],
  ])('falls back on %s', (_name, record) => {
    expect(resolveRate(record)).toMatchObject({ source: 'DEFAULT_0_30', local_rate: 0.3, dataMonth: null });
  });
});

describe('validators', () => {
  it('accepts only YYYY-MM months', () => {
    expect(isValidDataMonth('2026-08')).toBe(true);
    expect(isValidDataMonth('2026-12')).toBe(true);
    for (const bad of ['2026-00', '2026-13', '2026', '26-08', '2026-8', '', null, 202608]) expect(isValidDataMonth(bad)).toBe(false);
  });
  it('accepts cents that convert to $0.05 to $1.00 per kWh', () => {
    expect(isPlausibleCents(5)).toBe(true);
    expect(isPlausibleCents(100)).toBe(true);
    expect(isPlausibleCents(4.99)).toBe(false);
    expect(isPlausibleCents(100.01)).toBe(false);
    expect(isPlausibleCents('30.48')).toBe(false);
  });
});

describe('display formatting', () => {
  it('shows the data month as a name', () => {
    expect(formatDataMonth('2026-08')).toBe('August 2026');
    expect(formatDataMonth('2026-01')).toBe('January 2026');
    expect(formatDataMonth('2026-12')).toBe('December 2026');
    expect(formatDataMonth('soon')).toBe('soon');
  });
  it('keeps 2 to 4 decimals in the rate input', () => {
    expect(formatRateInput(0.3)).toBe('0.30');
    expect(formatRateInput(0.3048)).toBe('0.3048');
    expect(formatRateInput(0.312)).toBe('0.312');
    expect(formatRateInput(0.31)).toBe('0.31');
  });
});
