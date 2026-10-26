import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoBounds, LatLng } from '../lib/geo';
import { isCurrentLocation, placeName } from '../data/destinations';
import type { Destination } from '../types/destination';
import DestinationPin from './map/DestinationPin';
import LiveMap from './map/LiveMap';
import { SchematicSearchMap, type MapPin } from './map/MapFallbacks';
import MapMarker from './map/MapMarker';
import PricePin from './map/PricePin';
import ZoomControls from './map/ZoomControls';
import type { MapLibreModule } from './map/useMapLibreMap';

export type { MapPin } from './map/MapFallbacks';

/** Zoom used when the camera goes to a destination: about 2.5 km across on a laptop screen. */
const DESTINATION_ZOOM = 14;
const BROWSING_ZOOM = 13;
/** "Near me" starts one level wider: a driver standing somewhere wants chargers within a short drive, not one block. */
const NEAR_ME_ZOOM = 13;

const zoomFor = (d: Destination) => (isCurrentLocation(d) ? NEAR_ME_ZOOM : DESTINATION_ZOOM);

/** Where the camera was last left. Survives leaving the page (a listing, then back) but not a reload. */
let lastView: { center: LatLng; zoom: number } | null = null;

/** Tell the page which part of the world the map shows, once on start and after every pan, zoom or fly. */
function AreaReporter({ map, onAreaChange }: { map: MapLibreMap; onAreaChange: (area: GeoBounds) => void }) {
  const latest = useRef(onAreaChange);
  latest.current = onAreaChange;
  useEffect(() => {
    const report = () => {
      const b = map.getBounds();
      if (!b) return;
      const c = map.getCenter();
      lastView = { center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() };
      latest.current({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    };
    report();
    map.on('moveend', report);
    return () => {
      map.off('moveend', report);
    };
  }, [map]);
  return null;
}

/**
 * Move the camera when the driver picks a different destination. Panning and zooming by hand never come through here,
 * and neither do changes to the set of listings, so the map stays where the driver put it.
 */
function GoToDestination({ map, destination }: { map: MapLibreMap; destination: Destination | null }) {
  const previousId = useRef(destination?.id ?? null);
  useEffect(() => {
    const id = destination?.id ?? null;
    if (id === previousId.current) return;
    previousId.current = id;
    if (destination) map.flyTo({ center: [destination.lng, destination.lat], zoom: zoomFor(destination), duration: 700 });
  }, [map, destination]);
  return null;
}

const STACKED_LAYOUT = typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches;

/**
 * Search map. Live MapLibre map with price markers and, when there is one, a destination marker. The driver can pan and
 * zoom freely, and `onAreaChange` reports what the map shows so the page can list the chargers in view. Falls back to a
 * clearly labeled schematic when the map cannot load.
 */
export default function MapView({
  destination,
  browseCenter,
  pins,
  selectedId,
  onSelect,
  onAreaChange,
}: {
  /** null while the search box is empty */
  destination: Destination | null;
  /** Where to start when there is no destination and the map has not been moved yet */
  browseCenter: LatLng;
  pins: MapPin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAreaChange: (area: GeoBounds) => void;
}) {
  const start = destination ? { center: destination, zoom: zoomFor(destination) } : (lastView ?? { center: browseCenter, zoom: BROWSING_ZOOM });
  return (
    <LiveMap
      center={start.center}
      zoom={start.zoom}
      cooperativeGestures={STACKED_LAYOUT}
      ariaLabel={destination ? `Map of chargers near ${placeName(destination)}` : 'Map of chargers. Drag the map to search another area.'}
      fallback={(reason) => (
        <SchematicSearchMap
          destination={destination}
          center={start.center}
          pins={pins}
          selectedId={selectedId}
          onSelect={onSelect}
          onAreaChange={onAreaChange}
          reason={reason}
        />
      )}
    >
      {({ map, api }: { map: MapLibreMap; api: MapLibreModule }) => (
        <>
          <AreaReporter map={map} onAreaChange={onAreaChange} />
          <GoToDestination map={map} destination={destination} />
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
