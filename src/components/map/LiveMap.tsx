import 'maplibre-gl/dist/maplibre-gl.css';
import { useRef, type ReactNode } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LatLng } from '../../lib/geo';
import { useMapLibreMap, type MapLibreModule } from './useMapLibreMap';

export interface LiveMapContext {
  map: MapLibreMap;
  api: MapLibreModule;
}

/**
 * A MapLibre map that fills its parent. While the map starts it shows a loading state; if the
 * map cannot load, it renders `fallback(reason)` instead. Children render once the map object exists.
 */
export default function LiveMap({
  center,
  zoom,
  interactive = true,
  cooperativeGestures = false,
  ariaLabel,
  fallback,
  children,
}: {
  center: LatLng;
  zoom: number;
  interactive?: boolean;
  cooperativeGestures?: boolean;
  ariaLabel: string;
  fallback: (reason: string) => ReactNode;
  children?: (ctx: LiveMapContext) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, api, status, reason } = useMapLibreMap(containerRef, { center, zoom, interactive, cooperativeGestures });

  if (status === 'unavailable') return <>{fallback(reason)}</>;

  return (
    <div className="relative h-full w-full">
      {/* The inner div is the map container: MapLibre sets its own position, so it must not carry ours. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" role="group" aria-label={ariaLabel} />
      </div>
      {status === 'loading' && (
        <div role="status" className="absolute inset-0 z-10 flex items-center justify-center bg-map-loading text-[14px] font-medium text-muted">
          Loading map…
        </div>
      )}
      {map && api && children?.({ map, api })}
    </div>
  );
}
