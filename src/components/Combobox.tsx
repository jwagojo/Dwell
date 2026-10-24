import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CONTROL, controlBorder } from './form';

/**
 * Accessible autocomplete (ARIA 1.2 combobox with a listbox popup).
 * - Remote search is debounced, needs `minChars`, and cancels the previous request when the text changes.
 * - `localOptions` are instant (for example T stations) and shown even before `minChars`.
 * - Shows loading, empty and error states, announced through a polite live region.
 * The parent owns the text (`value`) and decides what a selection means.
 */

export interface ComboOption<T> {
  id: string;
  primary: string;
  secondary?: string;
  badge?: string;
  payload: T;
}

export type ComboSearchResult<T> = { ok: true; options: ComboOption<T>[] } | { ok: false; message: string; aborted?: boolean };
export type ComboSearch<T> = (query: string, signal: AbortSignal) => Promise<ComboSearchResult<T>>;

interface ComboboxProps<T> {
  label: string;
  value: string;
  onInputChange: (text: string) => void;
  onSelect: (option: ComboOption<T>) => void;
  search: ComboSearch<T>;
  localOptions?: (query: string) => ComboOption<T>[];
  minChars?: number;
  debounceMs?: number;
  placeholder?: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  disabled?: boolean;
  emptyText?: string;
  onBlur?: () => void;
  inputId?: string;
  /** Visual overrides, used where the field sits inside another card (the landing search) */
  labelClassName?: string;
  inputClassName?: string;
  /** Extra text under the list when the remote search is unavailable */
  unavailableNote?: string;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function Combobox<T>({
  label,
  value,
  onInputChange,
  onSelect,
  search,
  localOptions,
  minChars = 3,
  debounceMs = 300,
  placeholder,
  hint,
  error,
  optional,
  disabled,
  emptyText = 'No matching addresses. Check the spelling, or try the street and town.',
  onBlur,
  inputId,
  labelClassName,
  inputClassName,
  unavailableNote,
}: ComboboxProps<T>) {
  const autoId = useId();
  const id = inputId ?? autoId;
  const listId = `${id}-list`;
  const msgId = `${id}-msg`;

  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<ComboOption<T>[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [active, setActive] = useState(-1);
  const typed = useRef(false); // true only for text the user typed, not text the parent set after a selection
  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef(search);
  searchRef.current = search;

  const query = value.trim();
  const local = useMemo(() => (query ? (localOptions?.(query) ?? []) : []), [localOptions, query]);
  const options = useMemo(() => [...local, ...remote], [local, remote]);

  useEffect(() => {
    if (!typed.current) return;
    setActive(-1);
    setRemote([]);
    if (query.length < minChars) {
      setStatus('idle');
      return;
    }
    setStatus('loading');
    const timer = window.setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      const result = await searchRef.current(query, controller.signal);
      if (controller.signal.aborted) return; // a newer search replaced this one
      if (result.ok) {
        setRemote(result.options);
        setStatus('done');
      } else if (!result.aborted) {
        setErrorMsg(result.message);
        setStatus('error');
      }
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort(); // cancel the stale in-flight request
    };
  }, [query, minChars, debounceMs]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function choose(option: ComboOption<T>) {
    typed.current = false;
    abortRef.current?.abort();
    setOpen(false);
    setRemote([]);
    setStatus('idle');
    setActive(-1);
    onSelect(option);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (options.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % options.length : (i <= 0 ? options.length : i) - 1));
    } else if (e.key === 'Enter' && open && active >= 0 && options[active]) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  const tooShort = query.length > 0 && query.length < minChars;
  const showEmpty = status === 'done' && options.length === 0;
  const panelVisible =
    open && !disabled && query.length > 0 && (options.length > 0 || status !== 'idle' || (tooShort && local.length === 0));

  const announce =
    status === 'loading'
      ? 'Searching'
      : status === 'error'
        ? errorMsg
        : showEmpty
          ? emptyText
          : options.length > 0 && open
            ? `${options.length} suggestion${options.length === 1 ? '' : 's'} available. Use the up and down arrow keys.`
            : '';

  return (
    <div
      className="relative flex flex-col gap-1.5"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setActive(-1);
          onBlur?.();
        }
      }}
    >
      <label htmlFor={id} className={labelClassName ?? 'text-[14px] font-medium text-ink'}>
        {label}
        {optional && <span className="font-medium text-muted"> (optional)</span>}
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={panelVisible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? msgId : undefined}
        aria-busy={status === 'loading'}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          typed.current = true;
          setOpen(true);
          onInputChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={inputClassName ?? `h-12 ${CONTROL} ${controlBorder(error)}`}
      />

      {panelVisible && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 min-w-[260px] overflow-y-auto rounded-card border border-line bg-paper py-1 shadow-panel">
          {options.length > 0 && (
            <ul id={listId} role="listbox" aria-label={label} className="m-0 list-none p-0">
              {options.map((o, i) => (
                <li
                  key={`${o.id}-${i}`}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 ${i === active ? 'bg-brand-wash' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium text-ink">{o.primary}</span>
                    {o.secondary && <span className="block truncate text-[13px] text-muted">{o.secondary}</span>}
                  </span>
                  {o.badge && <span className="shrink-0 text-[12px] font-medium text-muted">{o.badge}</span>}
                </li>
              ))}
            </ul>
          )}
          {options.length === 0 && <span id={listId} role="listbox" aria-label={label} className="hidden" />}
          {status === 'loading' && <p className="px-3.5 py-2.5 text-[14px] font-medium text-muted">Searching…</p>}
          {showEmpty && <p className="px-3.5 py-2.5 text-[14px] text-body">{emptyText}</p>}
          {status === 'error' && (
            <p className="px-3.5 py-2.5 text-[14px] font-medium text-amber-ink">
              {errorMsg}
              {unavailableNote ? ` ${unavailableNote}` : ''}
            </p>
          )}
          {tooShort && local.length === 0 && <p className="px-3.5 py-2.5 text-[14px] text-muted">Type at least {minChars} characters to search.</p>}
        </div>
      )}

      {error ? (
        <p id={msgId} role="alert" className="text-[13px] font-medium text-amber-ink">
          {error}
        </p>
      ) : (
        hint && (
          <p id={msgId} className="text-[13px] text-muted">
            {hint}
          </p>
        )
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>
    </div>
  );
}
