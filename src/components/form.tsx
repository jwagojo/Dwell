import { useId, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/* Form primitives (spec §4.4, §4.5). Errors replace hints, use role="alert" and link via aria-describedby. */

export const CONTROL =
  'w-full rounded-[10px] border bg-white px-3.5 text-[16px] font-medium text-ink outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/10';
export const controlBorder = (error?: string) => (error ? 'border-amber-ink' : 'border-line-strong');

export function FieldShell({
  id,
  label,
  optional,
  hint,
  hintTone,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  hintTone?: 'green';
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-bold text-ink">
        {label}
        {optional && <span className="font-semibold text-muted"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="text-[13px] font-semibold text-amber-ink">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-msg`} className={`text-[13px] ${hintTone === 'green' ? 'font-semibold text-green-ink' : 'text-muted'}`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

interface BaseFieldProps {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  hintTone?: 'green';
  error?: string;
}

export function TextField({
  label,
  optional,
  hint,
  hintTone,
  error,
  className = '',
  ...rest
}: BaseFieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} optional={optional} hint={hint} hintTone={hintTone} error={error}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={`h-12 ${CONTROL} ${controlBorder(error)} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  optional,
  hint,
  error,
  children,
  className = '',
  ...rest
}: BaseFieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} optional={optional} hint={hint} error={error}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={`h-12 ${CONTROL} ${controlBorder(error)} ${className}`}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  optional,
  hint,
  error,
  className = '',
  ...rest
}: BaseFieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} optional={optional} hint={hint} error={error}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={`min-h-28 py-3 leading-[1.55] ${CONTROL} ${controlBorder(error)} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

/** Radio-like option cards in an auto-fit grid. Selected = 2px brand ring + brand wash. */
export function ChoiceGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  min = 180,
  error,
}: {
  legend: string;
  options: { value: T; label: string; sub?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  min?: number;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-[14px] font-bold text-ink">
        {legend}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="auto-grid"
        style={{ '--min': `${min}px`, '--gap': '10px' } as CSSProperties}
      >
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.value)}
              className={`min-h-12 rounded-xl px-3.5 py-2.5 text-left transition-colors ${
                selected ? 'border-2 border-brand bg-brand-wash' : 'border border-line-strong bg-white hover:border-brand'
              }`}
            >
              <span className="block text-[15px] font-bold text-ink">{o.label}</span>
              {o.sub && <span className="block text-[13px] text-muted">{o.sub}</span>}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-amber-ink">
          {error}
        </p>
      )}
    </div>
  );
}

/** Whole row is a label. Checked = brand wash + brand border. */
export function CheckboxCard({
  checked,
  onChange,
  lead,
  children,
  error,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  lead: string;
  children?: ReactNode;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 ${
          checked ? 'border-brand bg-brand-wash' : error ? 'border-amber-ink bg-white' : 'border-line-strong bg-white'
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-msg` : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
        />
        <span className="text-[15px] text-body">
          <strong className="font-bold text-ink">{lead}</strong> {children}
        </span>
      </label>
      {error && (
        <p id={`${id}-msg`} role="alert" className="text-[13px] font-semibold text-amber-ink">
          {error}
        </p>
      )}
    </div>
  );
}

/** 44px circular +/- buttons around a value. */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  format = (n) => String(n),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
}) {
  const circle =
    'flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-white text-[20px] font-bold text-ink hover:border-brand disabled:text-disabled disabled:hover:border-line-strong';
  return (
    <div role="group" aria-label={label} className="flex items-center gap-4">
      <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} className={circle} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="min-w-14 text-center text-[18px] font-extrabold text-ink" aria-live="polite">
        {format(value)}
      </span>
      <button type="button" aria-label={`Increase ${label.toLowerCase()}`} className={circle} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}
