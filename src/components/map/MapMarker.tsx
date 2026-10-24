import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Map as MapboxMap, Marker } from 'mapbox-gl';
import type { MapboxModule } from './useMapboxMap';

/**
 * One Mapbox marker whose content is ordinary React, rendered through a portal.
 * Mount adds the marker, unmount removes it, and a new lat/lng moves it. Coordinates are plain lat/lng here;
 * the [longitude, latitude] order Mapbox wants is handled in this file only.
 */
export default function MapMarker({
  map,
  api,
  lat,
  lng,
  zIndex = 0,
  children,
}: {
  map: MapboxMap;
  api: MapboxModule;
  lat: number;
  lng: number;
  zIndex?: number;
  children: ReactNode;
}) {
  const [element] = useState(() => document.createElement('div'));
  const markerRef = useRef<Marker | null>(null);
  const positionRef = useRef({ lat, lng });
  positionRef.current = { lat, lng };

  useEffect(() => {
    const marker = new api.Marker({ element, anchor: 'center' })
      .setLngLat([positionRef.current.lng, positionRef.current.lat])
      .addTo(map);
    markerRef.current = marker;
    return () => {
      marker.remove();
      markerRef.current = null;
    };
  }, [map, api, element]);

  useEffect(() => {
    markerRef.current?.setLngLat([lng, lat]);
  }, [lat, lng]);

  useEffect(() => {
    element.style.zIndex = String(zIndex);
  }, [element, zIndex]);

  return createPortal(children, element);
}
