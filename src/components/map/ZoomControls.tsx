import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Zoom buttons for a MapLibre map. bottom-10 keeps them clear of the map attribution. A page that floats something over
 * the right side of the map sets --map-inset-right on a parent, and the buttons stay beside it instead of under it.
 */
export default function ZoomControls({ map }: { map: MapLibreMap }) {
  const cls =
    'flex h-11 w-11 items-center justify-center rounded-full border border-pill bg-paper text-[20px] font-medium text-ink shadow-pin hover:border-brand';
  return (
    <div className="absolute bottom-10 z-20 flex flex-col gap-2" style={{ right: 'calc(0.75rem + var(--map-inset-right, 0px))' }}>
      <button type="button" aria-label="Zoom in" className={cls} onClick={() => map.zoomIn()}>
        +
      </button>
      <button type="button" aria-label="Zoom out" className={cls} onClick={() => map.zoomOut()}>
        −
      </button>
    </div>
  );
}
