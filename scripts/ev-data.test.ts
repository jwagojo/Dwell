import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evSpecToCar } from '../functions/shared/cars';
import { CAR_KW_MAX, CAR_KW_MIN } from '../src/engines/constants';
import { EV_DATA_CACHE, toEvSpecItems, usPlug, type EvDataVehicle } from './ev-data';

const vehicle = (over: Partial<EvDataVehicle> = {}): EvDataVehicle => ({
  unique_code: 'tesla:model_y:2024:long_range',
  make: { name: 'Tesla' },
  model: { name: 'Model Y' },
  year: 2024,
  trim: { name: 'Long Range' },
  markets: ['US'],
  charge_ports: [{ connector: 'nacs' }],
  charging: { ac: { max_power_kw: 11 } },
  ...over,
});

describe('usPlug', () => {
  it.each([
    [['nacs'], 'NACS'],
    [['ccs1'], 'J1772'],
    [['chademo', 'type1'], 'J1772'],
    [['ccs2'], 'J1772'],
    [['type2'], 'J1772'],
    [['gbt'], null],
    [[], null],
  ])('%j -> %s', (kinds, plug) => {
    expect(usPlug(kinds.map((connector) => ({ connector })))).toBe(plug);
  });
});

describe('toEvSpecItems', () => {
  it('keeps US cars with a usable plug and AC speed, with year and trim', () => {
    const { items, skipped } = toEvSpecItems([vehicle(), vehicle({ unique_code: 'x:eu', markets: ['DE'] })]);
    expect(skipped).toEqual([]);
    expect(items).toEqual([{ evId: 'tesla:model_y:2024:long_range', make: 'Tesla', model: 'Model Y', year: 2024, trim: 'Long Range', variant: undefined, max_ac_kw: 11, plug_type: 'NACS', source: 'OPEN_EV_DATA' }]);
    expect(evSpecToCar(items[0]).name).toBe('2024 Tesla Model Y Long Range');
  });

  it('skips duplicates, missing speeds, out-of-range speeds and unusable plugs, with a reason', () => {
    const { items, skipped } = toEvSpecItems([
      vehicle(),
      vehicle(),
      vehicle({ unique_code: 'a', charging: {} }),
      vehicle({ unique_code: 'b', charging: { ac: { max_power_kw: 48 } } }),
      vehicle({ unique_code: 'c', charge_ports: [{ connector: 'gbt' }] }),
    ]);
    expect(items).toHaveLength(1);
    expect(skipped.map((s) => s.reason)).toEqual(['missing or duplicate id', 'no AC charging speed', 'AC speed outside 3 to 22 kW', 'no plug usable in the US']);
  });

  // Runs only after `npm run seed` has downloaded the pinned release.
  it.runIf(fs.existsSync(EV_DATA_CACHE))('turns the pinned release into rows the API accepts', () => {
    const { vehicles } = JSON.parse(fs.readFileSync(EV_DATA_CACHE, 'utf8')) as { vehicles: EvDataVehicle[] };
    const { items } = toEvSpecItems(vehicles);
    expect(items.length).toBeGreaterThan(600);
    expect(new Set(items.map((i) => i.evId)).size).toBe(items.length);
    for (const i of items) {
      expect(i.max_ac_kw).toBeGreaterThanOrEqual(CAR_KW_MIN);
      expect(i.max_ac_kw).toBeLessThanOrEqual(CAR_KW_MAX);
      expect(['J1772', 'NACS']).toContain(i.plug_type);
    }
    // Spot checks against known US cars.
    const leaf = items.find((i) => i.make === 'Nissan' && i.model === 'LEAF');
    expect(leaf).toMatchObject({ max_ac_kw: 6.6, plug_type: 'J1772' });
    expect(items.find((i) => i.make === 'Tesla' && i.model === 'Model 3')?.plug_type).toBe('NACS');
    expect(items.find((i) => i.model === 'IONIQ 5')?.plug_type).toBe('J1772');
  });
});
