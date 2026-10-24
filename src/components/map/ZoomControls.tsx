import type { Map as MapboxMap } from 'mapbox-gl';

/** Zoom buttons for a Mapbox map. bottom-10 keeps them clear of Mapbox's attribution. */
export default function ZoomControls({ map }: { map: MapboxMap }) {
  const cls =
    'flex h-11 w-11 items-center justify-center rounded-full border border-pill bg-paper text-[20px] font-bold text-ink shadow-pin hover:border-brand';
  return (
    <div className="absolute bottom-10 right-3 z-20 flex flex-col gap-2">
      <button type="button" aria-label="Zoom in" className={cls} onClick={() => map.zoomIn()}>
        +
      </button>
      <button type="button" aria-label="Zoom out" className={cls} onClick={() => map.zoomOut()}>
        −
      </button>
    </div>
  );
}
