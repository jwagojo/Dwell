import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { boundsOfPoints, type GeoBounds, type LatLng } from '../lib/geo';
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

/** Where the camera's center sits, from the map's center, so the target lands in the middle of what `inset` px of covered strip leaves. */
const centerOffset = (inset: number): [number, number] => [-inset / 2, 0];

/** Where the camera was last left. Survives leaving the page (a listing, then back) but not a reload. */
let lastView: { center: LatLng; zoom: number } | null = null;

/** The part of the map the driver can see: all of it, minus the strip on the right that the results panel covers. */
function visibleBounds(map: MapLibreMap, inset: number): GeoBounds | null {
  if (inset <= 0) {
    const b = map.getBounds();
    return b ? { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() } : null;
  }
  const canvas = map.getCanvas();
  const width = Math.max(1, canvas.clientWidth - inset);
  const height = canvas.clientHeight;
  return boundsOfPoints(
    ([[0, 0], [width, 0], [0, height], [width, height]] as const).map(([x, y]) => {
      const p = map.unproject([x, y]);
      return { lat: p.lat, lng: p.lng };
    }),
  );
}

/**
 * Tell the page which part of the world the map shows, once on start and after every pan, zoom or fly. It reports again
 * when the covered strip opens or closes, so the list never counts chargers hidden behind the panel.
 */
function AreaReporter({ map, onAreaChange, inset }: { map: MapLibreMap; onAreaChange: (area: GeoBounds) => void; inset: number }) {
  const latest = useRef(onAreaChange);
  latest.current = onAreaChange;
  useEffect(() => {
    const report = () => {
      const area = visibleBounds(map, inset);
      if (!area) return;
      const c = map.getCenter();
      lastView = { center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() };
      latest.current(area);
    };
    report();
    map.on('moveend', report);
    return () => {
      map.off('moveend', report);
    };
  }, [map, inset]);
  return null;
}

/**
 * Move the camera when the driver picks a different destination. Panning and zooming by hand never come through here,
 * and neither do changes to the set of listings, so the map stays where the driver put it.
 */
function GoToDestination({ map, destination, area, inset }: { map: MapLibreMap; destination: Destination | null; area: GeoBounds | null; inset: number }) {
  // With a search radius, the camera frames the whole circle; it moves again only when the destination or radius changes.
  const key = destination ? `${destination.id}|${area ? [area.south, area.west, area.north, area.east].map((n) => n.toFixed(5)).join(',') : ''}` : null;
  const previousKey = useRef<string | null>(null);
  const first = useRef(true);
  // The target goes in the middle of the part of the map the driver can see, which the chargers panel may cover on the right.
  const insetRef = useRef(inset);
  insetRef.current = inset;
  useEffect(() => {
    if (key === previousKey.current) return;
    previousKey.current = key;
    const initial = first.current;
    first.current = false;
    if (!destination) return;
    const covered = insetRef.current;
    if (area) {
      map.fitBounds([[area.west, area.south], [area.east, area.north]], { padding: { top: 24, bottom: 24, left: 24, right: 24 + covered }, duration: initial ? 0 : 700 });
    } else if (initial) {
      // The map starts centered on the destination across its full width. Slide it over once.
      if (covered > 0) map.easeTo({ center: [destination.lng, destination.lat], zoom: zoomFor(destination), offset: centerOffset(covered), duration: 0 });
    } else {
      map.flyTo({ center: [destination.lng, destination.lat], zoom: zoomFor(destination), offset: centerOffset(covered), duration: 700 });
    }
  }, [map, destination, area, key]);
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
  inset = 0,
  radiusArea = null,
}: {
  /** The square around the destination that the search radius covers. The map fits it when it changes. */
  radiusArea?: GeoBounds | null;
  /** null while the search box is empty */
  destination: Destination | null;
  /** Where to start when there is no destination and the map has not been moved yet */
  browseCenter: LatLng;
  pins: MapPin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAreaChange: (area: GeoBounds) => void;
  /** Pixels on the right edge that something floating over the map covers. Centering and the reported area skip them. */
  inset?: number;
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
          <AreaReporter map={map} onAreaChange={onAreaChange} inset={inset} />
          <GoToDestination map={map} destination={destination} area={radiusArea} inset={inset} />
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
