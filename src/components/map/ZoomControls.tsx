import type { Map as MapLibreMap } from 'maplibre-gl';

/** Zoom buttons for a MapLibre map. bottom-10 keeps them clear of the map attribution. */
export default function ZoomControls({ map }: { map: MapLibreMap }) {
  const cls =
    'flex h-11 w-11 items-center justify-center rounded-full border border-pill bg-paper text-[20px] font-medium text-ink shadow-pin hover:border-brand';
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
