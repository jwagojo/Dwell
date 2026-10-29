import { useMemo } from 'react';
import type { Car } from '../types/listing';
import { SelectField } from './form';

/**
 * Make → Model → Version picker over the car list (Open EV Data from the API, or the 8 seeded cars). Each version
 * carries its own AC speed, so the price follows the exact trim the driver picks. The driver is never asked about
 * adapters: hosts provide them.
 */

export const makeOf = (c: Car) => c.make ?? c.name.split(' ')[0];
export const modelOf = (c: Car) => c.model ?? c.name.split(' ').slice(1).join(' ');
const kw = (c: Car) => (c.maxAcKw === null ? 'speed unknown' : `${c.maxAcKw} kW`);
export const versionLabel = (c: Car) => [c.year ?? (c.make ? '' : 'Any year'), c.version, `· ${kw(c)}`].filter(Boolean).join(' ');

/** Newest year first, then by version name. */
const newestFirst = (a: Car, b: Car) => (b.year ?? 0) - (a.year ?? 0) || (a.version ?? '').localeCompare(b.version ?? '');

export default function CarPicker({ cars, value, onChange }: { cars: Car[]; value: Car; onChange: (car: Car) => void }) {
  // A saved car that is not in the list (typed in by hand, or chosen before the list changed) stays selectable.
  const all = useMemo(() => (cars.some((c) => c.id === value.id) ? cars : [value, ...cars]), [cars, value]);
  const current = all.find((c) => c.id === value.id) ?? value;
  const make = makeOf(current);
  const model = modelOf(current);

  const makes = useMemo(() => [...new Set(all.map(makeOf))].sort((a, b) => a.localeCompare(b)), [all]);
  const models = useMemo(() => [...new Set(all.filter((c) => makeOf(c) === make).map(modelOf))].sort((a, b) => a.localeCompare(b)), [all, make]);
  const versions = useMemo(() => all.filter((c) => makeOf(c) === make && modelOf(c) === model).sort(newestFirst), [all, make, model]);

  /** Picking a make or model jumps to its newest version, so the price always has a car behind it. */
  const firstOf = (m: string, md?: string) => all.filter((c) => makeOf(c) === m && (md === undefined || modelOf(c) === md)).sort((a, b) => modelOf(a).localeCompare(modelOf(b)) || newestFirst(a, b))[0];

  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-3 border-0 p-0">
      <legend className="sr-only">Your car</legend>
      <div className="min-w-[140px] flex-1">
        <SelectField
          label="Car make"
          value={make}
          onChange={(e) => {
            const next = firstOf(e.target.value);
            if (next) onChange(next);
          }}
        >
          {makes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="min-w-[150px] flex-1">
        <SelectField
          label="Model"
          value={model}
          onChange={(e) => {
            const next = firstOf(make, e.target.value);
            if (next) onChange(next);
          }}
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="min-w-[200px] flex-[2]">
        <SelectField
          label="Year and trim"
          value={current.id}
          onChange={(e) => {
            const next = versions.find((c) => c.id === e.target.value);
            if (next) onChange(next);
          }}
        >
          {versions.map((c) => (
            <option key={c.id} value={c.id}>
              {versionLabel(c)}
            </option>
          ))}
        </SelectField>
      </div>
    </fieldset>
  );
}
