import { useEffect, useRef } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { DEFAULT_DESTINATION } from '../data/destinations';
import type { GeoBounds } from '../lib/geo';
import type { Destination } from '../types/destination';
import DestinationPin from './map/DestinationPin';
import LiveMap from './map/LiveMap';
import { SchematicSearchMap, type MapPin } from './map/MapFallbacks';
import MapMarker from './map/MapMarker';
import PricePin from './map/PricePin';
import ZoomControls from './map/ZoomControls';
import type { MapboxModule } from './map/useMapboxMap';

export type { MapPin } from './map/MapFallbacks';

/** Fit the camera to the destination and every visible listing when the destination or the set of listings changes. */
function FitCamera({ map, api, destination, pins }: { map: MapboxMap; api: MapboxModule; destination: Destination; pins: MapPin[] }) {
  const first = useRef(true);
  const idKey = pins
    .map((p) => p.id)
    .sort()
    .join('|');
  useEffect(() => {
    const bounds = new api.LngLatBounds([destination.lng, destination.lat], [destination.lng, destination.lat]);
    pins.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: first.current ? 0 : 500 });
    first.current = false;
    // Prices and selection change often; they must not move the camera.
  }, [map, api, destination.lat, destination.lng, idKey]);
  return null;
}

/** Reports the visible area once on mount and again every time the map stops moving (drag, zoom, resize, fit). */
function BoundsReporter({ map, onChange }: { map: MapboxMap; onChange: (bounds: GeoBounds) => void }) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const report = () => {
      const b = map.getBounds();
      if (!b) return;
      onChangeRef.current({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    };
    report();
    map.on('moveend', report);
    return () => {
      map.off('moveend', report);
    };
  }, [map]);
  return null;
}

const STACKED_LAYOUT = typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches;

/**
 * Search map. Live Mapbox map with price markers and, when a destination is set, a destination marker; falls back
 * to a clearly labeled schematic when Mapbox is unavailable.
 *
 * With a destination the camera fits it and the listings around it. With none (`destination` is null) the camera is
 * left to the user, and `onBoundsChange` reports the visible area so the page can load chargers for wherever the map is.
 */
export default function MapView({
  destination,
  pins,
  selectedId,
  onSelect,
  onBoundsChange,
}: {
  destination: Destination | null;
  pins: MapPin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange?: (bounds: GeoBounds) => void;
}) {
  // Only read when the map is created (or for the schematic fallback). Later moves go through the map itself.
  const start = destination ?? DEFAULT_DESTINATION;
  return (
    <LiveMap
      center={start}
      zoom={13}
      cooperativeGestures={STACKED_LAYOUT}
      ariaLabel={destination ? `Map of chargers near ${destination.label}` : 'Map of chargers'}
      fallback={(reason) => (
        <SchematicSearchMap
          center={start}
          destination={destination}
          pins={pins}
          selectedId={selectedId}
          onSelect={onSelect}
          reason={reason}
        />
      )}
    >
      {({ map, api }) => (
        <>
          {onBoundsChange && <BoundsReporter map={map} onChange={onBoundsChange} />}
          {destination && <FitCamera map={map} api={api} destination={destination} pins={pins} />}
          {destination && (
            <MapMarker map={map} api={api} lat={destination.lat} lng={destination.lng} zIndex={5}>
              <DestinationPin destination={destination} />
            </MapMarker>
          )}
          {pins.map((p) => (
            <MapMarker key={p.id} map={map} api={api} lat={p.lat} lng={p.lng} zIndex={p.id === selectedId ? 20 : 10}>
              <PricePin
                price={p.price}
                selected={p.id === selectedId}
                label={`${p.title}, $${p.price.toFixed(2)} per hour`}
                onClick={() => onSelect(p.id)}
              />
            </MapMarker>
          ))}
          <ZoomControls map={map} />
        </>
      )}
    </LiveMap>
  );
}
