import { Bolt } from '../Icons';

/**
 * Price pill for a listing. With x/y it positions itself over a schematic map; without them it is an inline
 * element meant to live inside a Mapbox marker.
 */
export default function PricePin({
  price,
  selected,
  label,
  onClick,
  x,
  y,
  static: isStatic = false,
}: {
  price: number;
  selected: boolean;
  label: string;
  onClick?: () => void;
  x?: number;
  y?: number;
  static?: boolean;
}) {
  const positioned = x !== undefined && y !== undefined;
  const cls = `flex h-8 items-center gap-1 rounded-full border-2 border-white px-2.5 text-[14px] font-extrabold text-white shadow-pin transition-transform ${
    positioned ? 'absolute -translate-x-1/2 -translate-y-1/2' : ''
  } ${selected ? 'scale-110 bg-brand' : 'bg-ink hover:scale-[1.06]'} ${positioned ? (selected ? 'z-20' : 'z-10') : ''}`;
  const style = positioned ? { left: x, top: y } : undefined;
  const content = (
    <>
      <Bolt size={13} />${price.toFixed(2)}
    </>
  );
  if (isStatic) {
    return (
      <span className={cls} style={style}>
        {content}
      </span>
    );
  }
  return (
    <button type="button" className={cls} style={style} aria-label={label} aria-pressed={selected} onClick={onClick}>
      {content}
    </button>
  );
}
