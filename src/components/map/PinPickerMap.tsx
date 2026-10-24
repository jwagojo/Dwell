import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Map as MapboxMap, Marker, MapMouseEvent } from 'mapbox-gl';
import type { LatLng } from '../../lib/geo';
import LiveMap from './LiveMap';
import type { MapboxModule } from './useMapboxMap';
import ZoomControls from './ZoomControls';

const STACKED_LAYOUT = typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches;

function PinGlyph() {
  return (
    <svg width="36" height="46" viewBox="0 0 36 46" aria-hidden="true" focusable="false" className="drop-shadow-md">
      <path d="M18 45C18 45 33 29.5 33 17.5C33 8.9 26.3 2 18 2C9.7 2 3 8.9 3 17.5C3 29.5 18 45 18 45Z" fill="var(--color-accent)" stroke="var(--color-paper)" strokeWidth="2.5" />
      <circle cx="18" cy="17.5" r="6.5" fill="var(--color-paper)" />
    </svg>
  );
}

/** Draggable marker plus click-to-place. Reports every move through `onMove`; the parent decides what it means. */
function PinLayer({
  map,
  api,
  position,
  onMove,
  recenterToken,
}: {
  map: MapboxMap;
  api: MapboxModule;
  position: LatLng | null;
  onMove: (p: LatLng) => void;
  recenterToken: number;
}) {
  const [element] = useState(() => {
    const el = document.createElement('div');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Charger location pin. Drag it, or click the map, to move it.');
    el.setAttribute('data-testid', 'host-pin');
    el.style.cursor = 'grab';
    return el;
  });
  const markerRef = useRef<Marker | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const positionRef = useRef(position);
  positionRef.current = position;
  const hasPosition = position !== null;

  // Create the draggable marker when there is a position; remove it when there is not.
  useEffect(() => {
    const start = positionRef.current;
    if (!start) return;
    const marker = new api.Marker({ element, draggable: true, anchor: 'bottom' }).setLngLat([start.lng, start.lat]).addTo(map);
    const onDragEnd = () => {
      const ll = marker.getLngLat();
      onMoveRef.current({ lat: ll.lat, lng: ll.lng });
    };
    marker.on('dragend', onDragEnd);
    markerRef.current = marker;
    return () => {
      marker.off('dragend', onDragEnd);
      marker.remove();
      markerRef.current = null;
    };
  }, [map, api, element, hasPosition]);

  // Keep the marker where the parent says it is (address selected, GPS, nudge buttons).
  useEffect(() => {
    if (position) markerRef.current?.setLngLat([position.lng, position.lat]);
  }, [position?.lat, position?.lng]);

  // Click the map to place the pin. Clicks on the pin itself are ignored.
  useEffect(() => {
    const onClick = (e: MapMouseEvent) => {
      const target = e.originalEvent.target as Node | null;
      if (target && element.contains(target)) return;
      onMoveRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };
    map.on('click', onClick);
    const canvas = map.getCanvas();
    canvas.style.cursor = 'crosshair';
    return () => {
      map.off('click', onClick);
      canvas.style.cursor = '';
    };
  }, [map, element]);

  // Move the camera only for external changes (address chosen, GPS). Dragging must not recenter the map.
  useEffect(() => {
    const p = positionRef.current;
    if (p) map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 17), duration: 700 });
  }, [map, recenterToken]);

  return createPortal(<PinGlyph />, element);
}

export default function PinPickerMap({
  position,
  onMove,
  recenterToken,
  fallbackCenter,
}: {
  position: LatLng | null;
  onMove: (p: LatLng) => void;
  /** Change this number to fly the camera to `position` (address selected, GPS). */
  recenterToken: number;
  fallbackCenter: LatLng;
}) {
  return (
    <LiveMap
      center={position ?? fallbackCenter}
      zoom={position ? 17 : 8.5}
      cooperativeGestures={STACKED_LAYOUT}
      ariaLabel="Map for placing the charger pin"
      fallback={(reason) => (
        <div className="flex h-full w-full flex-col justify-center gap-2 bg-surface p-5" data-testid="pin-map-fallback">
          <p className="text-[15px] font-extrabold text-amber-ink">Map unavailable</p>
          <p className="text-[14px] text-body">
            {reason} You can still place the pin with your location or the nudge buttons below, then confirm it.
          </p>
          {position && (
            <p className="text-[14px] font-semibold text-ink">
              Pin: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </p>
          )}
        </div>
      )}
    >
      {({ map, api }) => (
        <>
          <PinLayer map={map} api={api} position={position} onMove={onMove} recenterToken={recenterToken} />
          <ZoomControls map={map} />
        </>
      )}
    </LiveMap>
  );
}
