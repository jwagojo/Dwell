import type { LatLng } from '../../lib/geo';
import LiveMap from './LiveMap';
import { SchematicPreview } from './MapFallbacks';
import MapMarker from './MapMarker';
import PricePin from './PricePin';

export interface PreviewPin {
  id: string;
  lat: number;
  lng: number;
  price: number;
  selected: boolean;
}

/** Non-interactive MapLibre preview with price markers (the landing hero). Falls back to a labeled schematic. */
export default function MapPreview({
  center,
  zoom = 13.4,
  pins,
  ariaLabel = 'Preview map of chargers near Central Square',
}: {
  center: LatLng;
  zoom?: number;
  pins: PreviewPin[];
  ariaLabel?: string;
}) {
  return (
    <LiveMap
      center={center}
      zoom={zoom}
      interactive={false}
      ariaLabel={ariaLabel}
      fallback={() => <SchematicPreview center={center} zoom={zoom >= 13 ? 1.25 : 1} pins={pins} />}
    >
      {({ map, api }) =>
        pins.map((p) => (
          <MapMarker key={p.id} map={map} api={api} lat={p.lat} lng={p.lng} zIndex={p.selected ? 20 : 10}>
            <PricePin price={p.price} selected={p.selected} label="" static />
          </MapMarker>
        ))
      }
    </LiveMap>
  );
}
