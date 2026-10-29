import { describe, expect, it } from 'vitest';
import { buildRoutesUrl, buildStopsUrl, parseRoutes, parseStops } from './mbta';
import { buildOpenMeteoUrl, localDate, parseOpenMeteo, windowIrradiance } from './openMeteo';

describe('Open-Meteo helpers', () => {
  const json = {
    hourly: {
      time: ['2026-10-28T22:00', '2026-10-28T23:00', '2026-10-29T00:00', '2026-10-29T01:00', '2026-10-29T12:00'],
      shortwave_radiation: [0, 0, 0, 0, 610],
    },
  };

  it('asks for yesterday to tomorrow in Boston time', () => {
    const url = new URL(buildOpenMeteoUrl(42.36551, -71.10381));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ latitude: '42.366', longitude: '-71.104', hourly: 'shortwave_radiation', timezone: 'America/New_York', past_days: '1', forecast_days: '2' });
  });

  it('takes the booked hours, wrapping past midnight, and reports a gap as unavailable', () => {
    const s = parseOpenMeteo(json)!;
    expect(windowIrradiance(s, '2026-10-28', 22, 4)).toEqual([0, 0, 0, 0]);
    expect(windowIrradiance(s, '2026-10-29', 12, 1)).toEqual([610]);
    expect(windowIrradiance(s, '2026-10-29', 12, 2)).toBeNull();
  });

  it('rejects malformed responses and drops implausible values', () => {
    expect(parseOpenMeteo({ hourly: { time: ['x'], shortwave_radiation: [1, 2] } })).toBeNull();
    expect(parseOpenMeteo('nope')).toBeNull();
    expect(parseOpenMeteo({ hourly: { time: ['2026-10-28T12:00', '2026-10-28T13:00'], shortwave_radiation: [-5, 400] } })?.size).toBe(1);
  });

  it('dates instants in Boston, not UTC', () => {
    expect(localDate(Date.parse('2026-10-29T02:00:00Z'))).toBe('2026-10-28');
  });
});

describe('MBTA helpers', () => {
  it('builds the stop and route queries', () => {
    expect(decodeURIComponent(buildStopsUrl(42.3654, -71.1031))).toContain('filter[radius]=0.004');
    expect(decodeURIComponent(buildRoutesUrl(['70070', '102']))).toContain('filter[stop]=70070,102');
  });

  it('keeps stops and stations, nearest first, and drops entrances', () => {
    const stops = parseStops({ data: [{ id: '102', attributes: { name: 'Mass Ave @ Prospect', location_type: 0 } }, { id: 'node-1', attributes: { location_type: 3 } }, { id: 'place-cntsq', attributes: { name: 'Central', location_type: 1 } }] });
    expect(stops).toEqual({ stopIds: ['102', 'place-cntsq'], nearestName: 'Mass Ave @ Prospect' });
  });

  it('labels routes like the app badges, rail first, buses in number order', () => {
    const routes = parseRoutes({
      data: [
        { id: '91', attributes: { type: 3, short_name: '91' } },
        { id: 'Green-B', attributes: { type: 0, long_name: 'Green Line B' } },
        { id: '1', attributes: { type: 3, short_name: '1' } },
        { id: 'Red', attributes: { type: 1, long_name: 'Red Line' } },
        { id: 'CR-Fitchburg', attributes: { type: 2, long_name: 'Fitchburg Line' } },
        { id: 'Green-C', attributes: { type: 0, long_name: 'Green Line C' } },
        { id: 'Boat-F1', attributes: { type: 4, long_name: 'Hingham Ferry' } },
        { id: 'CT2', attributes: { type: 3, short_name: 'CT2' } },
      ],
    });
    expect(routes).toEqual(['Red Line', 'Green Line', 'Commuter Rail', '1', '91', 'CT2']);
  });
});
