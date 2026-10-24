import { useEffect, useRef } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
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

const STACKED_LAYOUT = typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches;

/**
 * Search map. Live Mapbox map with price markers and a destination marker; falls back to a clearly labeled
 * schematic when Mapbox is unavailable. Props are the same as the old schematic map.
 */
export default function MapView({
  destination,
  pins,
  selectedId,
  onSelect,
}: {
  destination: Destination;
  pins: MapPin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <LiveMap
      center={destination}
      zoom={13}
      cooperativeGestures={STACKED_LAYOUT}
      ariaLabel={`Map of chargers near ${destination.label}`}
      fallback={(reason) => (
        <SchematicSearchMap destination={destination} pins={pins} selectedId={selectedId} onSelect={onSelect} reason={reason} />
      )}
    >
      {({ map, api }) => (
        <>
          <FitCamera map={map} api={api} destination={destination} pins={pins} />
          <MapMarker map={map} api={api} lat={destination.lat} lng={destination.lng} zIndex={5}>
            <DestinationPin destination={destination} />
          </MapMarker>
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
