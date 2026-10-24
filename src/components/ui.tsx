import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { routeStyle } from '../data/transit';
import { House, Info, Plug, Walk, Warn } from './Icons';

/* ---------- Buttons (spec §4.2) ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'link';
type Size = 'nav' | 'md' | 'lg' | 'xl';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark disabled:bg-disabled disabled:hover:bg-disabled rounded-xl font-extrabold',
  secondary: 'bg-white border border-line-strong text-ink hover:border-brand rounded-[10px] font-bold',
  ghost: 'text-ink hover:bg-surface rounded-[10px] font-semibold',
  link: 'text-brand hover:bg-surface rounded-[10px] font-semibold',
};
const SIZE: Record<Size, string> = {
  nav: 'h-11 px-4 text-[15px]',
  md: 'h-12 px-5 text-[16px]',
  lg: 'h-[52px] px-6 text-[17px]',
  xl: 'h-14 px-7 text-[17px]',
};

export const btn = (variant: Variant = 'primary', size: Size = 'md', extra = '') =>
  `inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${VARIANT[variant]} ${SIZE[size]} ${extra}`;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}
export function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={btn(variant, size, className)} {...rest} />;
}

/** A router link styled as a button. Never nest a <button> inside a link. */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={btn(variant, size, className)} {...rest} />;
}

/* ---------- Layout helpers ---------- */

export function AutoGrid({
  min = 260,
  gap = 16,
  className = '',
  children,
}: {
  min?: number;
  gap?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`auto-grid ${className}`} style={{ '--min': `${min}px`, '--gap': `${gap}px` } as CSSProperties}>
      {children}
    </div>
  );
}

/* ---------- Pills and segmented controls (spec §4.3) ---------- */

export function Pill({
  selected,
  onClick,
  children,
  className = '',
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`h-10 rounded-full border px-3 text-[14px] font-semibold transition-colors ${
        selected ? 'border-ink bg-ink text-white' : 'border-pill bg-white text-ink hover:border-brand'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className = '',
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-[13px] font-bold text-muted">{label}</span>
      {options.map((o) => (
        <Pill key={String(o.value)} selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </Pill>
      ))}
    </div>
  );
}

/* ---------- Badges and chips (spec §4.6) ---------- */

export function RouteBadge({ route }: { route: string }) {
  const { bg, text } = routeStyle(route);
  return (
    <span className="rounded-md px-2 py-1 text-[13px] font-bold" style={{ background: bg, color: text }}>
      {route}
    </span>
  );
}

export function RouteBadges({ routes, max = 5 }: { routes: string[]; max?: number }) {
  const shown = routes.slice(0, max);
  const extra = routes.length - shown.length;
  return (
    <>
      {shown.map((r) => (
        <RouteBadge key={r} route={r} />
      ))}
      {extra > 0 && <span className="rounded-md bg-chip px-2 py-1 text-[13px] font-bold text-ink">+{extra}</span>}
    </>
  );
}

export function WalkChip({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-chip px-2 py-1 text-[13px] font-bold text-ink">
      <Walk size={14} />
      {minutes} min walk
    </span>
  );
}

export function GreenPill({ score }: { score: number }) {
  return (
    <span className="rounded-full bg-green-bg px-2.5 py-1 text-[13px] font-extrabold text-green-ink">
      Green {score.toFixed(2)}
    </span>
  );
}

export function LevelTag({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-white px-2 py-1 text-[12px] font-bold text-ink">{children}</span>;
}

export function NewBadge() {
  return <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-[12px] font-extrabold text-brand">New listing</span>;
}

export function StatusDot({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'muted' }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[14px] font-bold ${tone === 'green' ? 'text-green' : 'text-muted'}`}>
      <span className={`h-2 w-2 rounded-full ${tone === 'green' ? 'bg-green' : 'bg-disabled'}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function PaidPill({ amount }: { amount: string }) {
  return <span className="rounded-full bg-green-bg px-2.5 py-1 text-[13px] font-bold text-green-ink">Paid {amount}</span>;
}

/* ---------- Notes (spec §4.7) ---------- */

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[10px] bg-surface p-3 text-[14px] text-body">
      <span className="mt-0.5 text-muted">
        <Info size={18} />
      </span>
      <p>{children}</p>
    </div>
  );
}

export function WarnNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg bg-amber-bg p-2.5 text-[13px] font-semibold text-amber-ink ${className}`}>
      <span className="mt-0.5 shrink-0">
        <Warn size={16} />
      </span>
      <p>{children}</p>
    </div>
  );
}

export function FitNote({ tone, children }: { tone: 'green' | 'amber'; children: ReactNode }) {
  const cls = tone === 'green' ? 'bg-green-bg text-green-ink' : 'bg-amber-bg text-amber-ink';
  return (
    <div className={`flex items-start gap-2 rounded-[10px] p-3 text-[14px] font-semibold ${cls}`}>
      <span className="mt-0.5 shrink-0">{tone === 'green' ? <Plug size={16} /> : <Warn size={16} />}</span>
      <p>{children}</p>
    </div>
  );
}

/* ---------- Stat tile (spec §4.11) ---------- */

export function StatTile({
  label,
  value,
  tone = 'surface',
  big = false,
}: {
  label: string;
  value: ReactNode;
  tone?: 'surface' | 'green' | 'amber';
  big?: boolean;
}) {
  const bg = { surface: 'bg-surface', green: 'bg-green-bg', amber: 'bg-amber-bg' }[tone];
  const fg = { surface: 'text-ink', green: 'text-green-ink', amber: 'text-amber-ink' }[tone];
  return (
    <div className={`rounded-xl p-3.5 ${bg}`}>
      <div className={`text-[12px] font-bold ${tone === 'surface' ? 'text-muted' : fg}`}>{label}</div>
      <div className={`mt-0.5 font-extrabold ${fg} ${big ? 'text-[22px]' : 'text-[18px]'}`}>{value}</div>
    </div>
  );
}

/* ---------- Photo (host photo or labeled placeholder, spec §2.1) ---------- */

const PHOTO_TONES = ['#E7E1D6', '#DCE6EE', '#E3E8DC', '#EDE3DE', '#E6E4EE', '#E9E6DA'];

export function Photo({
  src,
  index = 0,
  label,
  className = '',
  children,
}: {
  src?: string;
  index?: number;
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  // A hotlinked photo can disappear. Fall back to the labeled placeholder instead of a broken image.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = !!src && src !== failedSrc;
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: PHOTO_TONES[index % PHOTO_TONES.length] }}
      role="img"
      aria-label={label ?? 'Host photo'}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src!)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-black/30">
          <House size={30} />
          {label && <span className="px-2 text-center text-[12px] font-bold text-body">[HOST PHOTO] {label}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
