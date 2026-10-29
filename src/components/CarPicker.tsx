import { useMemo, useState, type FormEvent } from 'react';
import { OTHER_CAR_ID } from '../data/evFallbackSeed';
import { CAR_KW_MAX, CAR_KW_MIN } from '../engines/constants';
import type { Plug } from '../engines/plug';
import type { Car } from '../types/listing';
import { ChoiceGroup, SelectField, TextField } from './form';
import { Button } from './ui';

/**
 * Make → Model → Version picker over the car list (Open EV Data from the API, or the 8 seeded cars), plus "My car
 * isn't listed" for typing a car in by hand (Req 1.9). Each version carries its own AC speed, so the price follows the
 * exact trim. An unknown speed is priced at the charger's full power (Req 1.10). The driver is never asked about
 * adapters: hosts provide them.
 */

export const isManualCar = (c: Car) => c.id === OTHER_CAR_ID;
export const makeOf = (c: Car) => c.make ?? c.name.split(' ')[0];
export const modelOf = (c: Car) => c.model ?? c.name.split(' ').slice(1).join(' ');
const kw = (c: Car) => (c.maxAcKw === null ? 'speed unknown' : `${c.maxAcKw} kW`);
export const versionLabel = (c: Car) =>
  isManualCar(c) ? `Entered by you · ${kw(c)}` : [c.year ?? (c.make ? '' : 'Any year'), c.version, `· ${kw(c)}`].filter(Boolean).join(' ');

/** Newest year first, then by version name. */
const newestFirst = (a: Car, b: Car) => (b.year ?? 0) - (a.year ?? 0) || (a.version ?? '').localeCompare(b.version ?? '');

const NOT_LISTED = '__not_listed__';

export type ManualCarInput = { name: string; kw: string; unknownKw: boolean; plug: Plug };

/** The typed-in car, or the field and message to show. Same limits the API applies (save-me). */
export function manualCar(input: ManualCarInput): { ok: true; car: Car } | { ok: false; field: 'name' | 'kw'; message: string } {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60) return { ok: false, field: 'name', message: 'Enter your car’s make and model.' };
  if (input.unknownKw) return { ok: true, car: { id: OTHER_CAR_ID, name, maxAcKw: null, plug: input.plug } };
  const n = Number(input.kw);
  if (input.kw.trim() === '' || !Number.isFinite(n) || n < CAR_KW_MIN || n > CAR_KW_MAX) {
    return { ok: false, field: 'kw', message: `Enter a speed from ${CAR_KW_MIN} to ${CAR_KW_MAX} kW, or choose “I don’t know”.` };
  }
  return { ok: true, car: { id: OTHER_CAR_ID, name, maxAcKw: Math.round(n * 10) / 10, plug: input.plug } };
}

function ManualCarForm({ initial, onSave, onCancel }: { initial: Car | null; onSave: (car: Car) => void; onCancel: () => void }) {
  const [form, setForm] = useState<ManualCarInput>({
    name: initial?.name ?? '',
    kw: initial?.maxAcKw != null ? String(initial.maxAcKw) : '',
    unknownKw: initial ? initial.maxAcKw === null : false,
    plug: initial?.plug ?? 'J1772',
  });
  const [error, setError] = useState<{ field: 'name' | 'kw'; message: string } | null>(null);
  const set = <K extends keyof ManualCarInput>(k: K, v: ManualCarInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError(null);
  };
  function save(e: FormEvent) {
    e.preventDefault();
    const r = manualCar(form);
    if (r.ok) onSave(r.car);
    else setError(r);
  }
  return (
    <form onSubmit={save} noValidate className="flex w-full flex-col gap-4 rounded-card border border-line bg-surface p-4" aria-label="Enter your car">
      <TextField label="Make and model" placeholder="For example: Kia EV6" value={form.name} error={error?.field === 'name' ? error.message : undefined} onChange={(e) => set('name', e.target.value)} />
      <ChoiceGroup<Plug>
        legend="Charging plug"
        value={form.plug}
        onChange={(v) => set('plug', v)}
        options={[
          { value: 'J1772', label: 'J1772 (most cars)' },
          { value: 'NACS', label: 'NACS (Tesla style)' },
        ]}
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[180px] flex-1">
          <TextField
            label="Max AC charging speed (kW)"
            inputMode="decimal"
            hint="In your car’s manual, often 7.2 or 11."
            disabled={form.unknownKw}
            value={form.unknownKw ? '' : form.kw}
            error={error?.field === 'kw' ? error.message : undefined}
            onChange={(e) => set('kw', e.target.value)}
          />
        </div>
        <label className="flex h-12 items-center gap-2 text-[15px] text-body">
          <input type="checkbox" checked={form.unknownKw} onChange={(e) => set('unknownKw', e.target.checked)} className="h-5 w-5" />
          I don’t know
        </label>
      </div>
      {form.unknownKw && <p className="text-[14px] text-muted">We’ll price each charger at its full speed, the most your car could draw.</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit">Use this car</Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function CarPicker({ cars, value, onChange }: { cars: Car[]; value: Car; onChange: (car: Car) => void }) {
  const [entering, setEntering] = useState(false);
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

  if (entering) {
    return (
      <ManualCarForm
        initial={isManualCar(value) ? value : null}
        onCancel={() => setEntering(false)}
        onSave={(car) => {
          setEntering(false);
          onChange(car);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-3 border-0 p-0">
        <legend className="sr-only">Your car</legend>
        <div className="min-w-[140px] flex-1">
          <SelectField
            label="Car make"
            value={make}
            onChange={(e) => {
              if (e.target.value === NOT_LISTED) return setEntering(true);
              const next = firstOf(e.target.value);
              if (next) onChange(next);
            }}
          >
            {makes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={NOT_LISTED}>My car isn’t listed…</option>
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
      {isManualCar(value) && (
        <button type="button" onClick={() => setEntering(true)} className="w-fit text-[14px] font-medium text-ink underline decoration-line-strong decoration-1 underline-offset-4 hover:text-brand">
          Edit the car you entered
        </button>
      )}
    </div>
  );
}
