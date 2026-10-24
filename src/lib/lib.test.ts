import { describe, expect, it } from 'vitest';
import { estimateWalk, haversineDistanceMeters, offsetMeters } from './geo';
import { classifyMapboxToken } from './mapbox';
import { isMassachusettsZip, stripHouseNumber } from './massachusetts';

describe('classifyMapboxToken', () => {
  it('accepts only public pk. tokens', () => {
    expect(classifyMapboxToken('pk.eyJ1IjoiYSJ9.abc')).toBe('ok');
    expect(classifyMapboxToken('  pk.abc  ')).toBe('ok');
  });
  it('refuses secret tokens', () => {
    expect(classifyMapboxToken('sk.eyJ1IjoiYSJ9.abc')).toBe('secret');
  });
  it('treats empty, missing and the .env.example placeholder as unusable', () => {
    expect(classifyMapboxToken('')).toBe('missing');
    expect(classifyMapboxToken(undefined)).toBe('missing');
    expect(classifyMapboxToken('your-mapbox-public-token-here')).toBe('invalid');
  });
});

describe('isMassachusettsZip', () => {
  it('accepts Massachusetts ZIP codes, including ones not in the sample table', () => {
    for (const z of ['01854', '02139', '01001', '02791', '01201', '05501']) expect(isMassachusettsZip(z)).toBe(true);
  });
  it('rejects everything else', () => {
    for (const z of ['02800', '03101', '10001', '1854', '0185', '018540', 'abcde', '']) expect(isMassachusettsZip(z)).toBe(false);
  });
});

describe('stripHouseNumber', () => {
  it('keeps the street name only', () => {
    expect(stripHouseNumber('12 Pearl St')).toBe('Pearl St');
    expect(stripHouseNumber('1-3 University Avenue')).toBe('University Avenue');
    expect(stripHouseNumber('221B Baker Street')).toBe('Baker Street');
    expect(stripHouseNumber('Pearl St')).toBe('Pearl St');
  });
});

describe('geo', () => {
  it('measures one degree of latitude as about 111.2 km', () => {
    expect(haversineDistanceMeters({ lat: 42, lng: -71 }, { lat: 43, lng: -71 })).toBeCloseTo(111_195, -1);
  });
  it('is zero for the same point and symmetric', () => {
    const a = { lat: 42.36, lng: -71.1 };
    const b = { lat: 42.37, lng: -71.09 };
    expect(haversineDistanceMeters(a, a)).toBe(0);
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(haversineDistanceMeters(b, a), 6);
  });
  it('moves a pin by the requested metres (north and east)', () => {
    const p = { lat: 42.36, lng: -71.1 };
    expect(haversineDistanceMeters(p, offsetMeters(p, 5, 0))).toBeCloseTo(5, 1);
    expect(haversineDistanceMeters(p, offsetMeters(p, 0, 5))).toBeCloseTo(5, 1);
    expect(offsetMeters(p, 5, 0).lat).toBeGreaterThan(p.lat);
    expect(offsetMeters(p, 0, 5).lng).toBeGreaterThan(p.lng);
  });
  it('estimates walking time in whole minutes, at least one', () => {
    expect(estimateWalk(632).minutes).toBe(10);
    expect(estimateWalk(1).minutes).toBe(1);
  });
});
