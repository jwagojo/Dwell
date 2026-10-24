import { useEffect, useRef, useState } from 'react';
import { SEARCH_RADIUS_M } from '../../features/search/evaluateListing';
import { boundsAround, type GeoBounds, type LatLng } from '../../lib/geo';
import { LINE_STYLES } from '../../data/transit';
import type { Destination } from '../../types/destination';
import DestinationPin from './DestinationPin';
import PricePin from './PricePin';
import { SchematicMap } from './SchematicMap';

/* Labeled schematic fallbacks, shown when the live Mapbox map cannot start. Listings stay usable. */

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  price: number;
  title: string;
}

function FallbackBanner({ reason }: { reason: string }) {
  return (
    <div
      role="status"
      className="absolute left-3 top-3 z-30 max-w-[calc(100%-1.5rem)] rounded-card bg-paper px-3 py-2 text-[13px] font-medium text-amber-ink shadow-pin"
      data-testid="map-fallback-banner"
    >
      Schematic map, not a live map. {reason}
    </div>
  );
}

export function SchematicSearchMap({
  destination,
  center,
  pins,
  selectedId,
  onSelect,
  onAreaChange,
  reason,
}: {
  /** null while the search box is empty */
  destination: Destination | null;
  center: LatLng;
  pins: MapPin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The schematic cannot be dragged, so it reports a fixed area around its center */
  onAreaChange: (area: GeoBounds) => void;
  reason: string;
}) {
  const [zoom, setZoom] = useState(1);
  const latest = useRef(onAreaChange);
  latest.current = onAreaChange;
  useEffect(() => {
    latest.current(boundsAround(center, SEARCH_RADIUS_M));
  }, [center.lat, center.lng]);
  const zoomBtn =
    'flex h-11 w-11 items-center justify-center rounded-full border border-pill bg-paper text-[20px] font-medium text-ink shadow-pin hover:border-brand';
  return (
    <div className="relative h-full w-full" data-testid="map-fallback">
      <SchematicMap center={center} zoom={zoom}>
        {({ project }) => (
          <>
            {destination &&
              (() => {
                const { x, y } = project(destination);
                return (
                  <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
                    <DestinationPin destination={destination} />
                  </div>
                );
              })()}
            {pins.map((p) => {
              const { x, y } = project(p);
              return (
                <PricePin
                  key={p.id}
                  x={x}
                  y={y}
                  price={p.price}
                  selected={p.id === selectedId}
                  label={`${p.title}, $${p.price.toFixed(2)} per hour`}
                  onClick={() => onSelect(p.id)}
                />
              );
            })}
          </>
        )}
      </SchematicMap>
      <FallbackBanner reason={reason} />
      <div className="absolute bottom-3 right-3 z-30 flex flex-col gap-2">
        <button type="button" aria-label="Zoom in" className={zoomBtn} onClick={() => setZoom((z) => Math.min(z * 1.35, 3))}>
          +
        </button>
        <button type="button" aria-label="Zoom out" className={zoomBtn} onClick={() => setZoom((z) => Math.max(z / 1.35, 0.7))}>
          −
        </button>
      </div>
      <div className="absolute bottom-3 left-3 z-30 flex flex-col gap-1.5 rounded-card bg-paper px-3 py-2 text-[12px] font-medium text-body shadow-pin">
        {(['red', 'green', 'orange', 'cr'] as const).map((k) => (
          <span key={k} className="flex items-center gap-2">
            <span
              className="inline-block h-1 w-5 rounded"
              style={
                k === 'cr'
                  ? { backgroundImage: `repeating-linear-gradient(90deg, ${LINE_STYLES[k].stroke} 0 5px, transparent 5px 8px)` }
                  : { background: LINE_STYLES[k].stroke }
              }
              aria-hidden="true"
            />
            {LINE_STYLES[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SchematicPreview({
  center,
  zoom,
  pins,
}: {
  center: { lat: number; lng: number };
  zoom: number;
  pins: { id: string; lat: number; lng: number; price: number; selected: boolean }[];
}) {
  return (
    <div className="relative h-full w-full" data-testid="map-fallback">
      <SchematicMap center={center} zoom={zoom} showLabels={false}>
        {({ project }) =>
          pins.map((p) => {
            const { x, y } = project(p);
            return <PricePin key={p.id} x={x} y={y} price={p.price} selected={p.selected} label="" static />;
          })
        }
      </SchematicMap>
      <span className="absolute left-3 top-3 z-30 rounded-card bg-paper px-2 py-1 text-[12px] font-medium text-amber-ink shadow-pin" data-testid="map-fallback-banner">
        Schematic preview, not a live map
      </span>
    </div>
  );
}
