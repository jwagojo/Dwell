import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { LatLng } from '../../lib/geo';
import { MAPBOX_TOKEN, MAP_STYLE, describeTokenProblem, hasMapboxToken, mapboxTokenStatus } from '../../lib/mapbox';

export type MapboxModule = typeof import('mapbox-gl');

let modulePromise: Promise<MapboxModule> | null = null;

/** mapbox-gl is large, so it loads on demand and only when a token exists. */
export function loadMapbox(): Promise<MapboxModule> {
  modulePromise ??= import('mapbox-gl').then((ns) => ((ns as unknown as { default?: MapboxModule }).default ?? ns) as MapboxModule);
  // Allow a retry on the next mount if the chunk failed to load.
  modulePromise.catch(() => {
    modulePromise = null;
  });
  return modulePromise;
}

export type MapStatus = 'loading' | 'ready' | 'unavailable';

export interface MapboxMapState {
  map: MapboxMap | null;
  api: MapboxModule | null;
  status: MapStatus;
  /** Plain-language reason, set when status is "unavailable" */
  reason: string;
}

export interface MapboxMapOptions {
  center: LatLng;
  zoom: number;
  interactive?: boolean;
  /** Two-finger gestures so a stacked map does not trap page scrolling on phones */
  cooperativeGestures?: boolean;
}

const LOAD_TIMEOUT_MS = 15_000;

/**
 * Creates one Mapbox map inside `containerRef` and tears everything down on unmount.
 * Safe under React StrictMode (effects run twice) because creation is async and guarded by `cancelled`.
 * `options` are read once, at creation. Move the camera through the returned `map` afterwards.
 */
export function useMapboxMap(containerRef: RefObject<HTMLDivElement | null>, options: MapboxMapOptions): MapboxMapState {
  const [state, setState] = useState<MapboxMapState>(() =>
    hasMapboxToken
      ? { map: null, api: null, status: 'loading', reason: '' }
      : { map: null, api: null, status: 'unavailable', reason: describeTokenProblem(mapboxTokenStatus) },
  );
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!hasMapboxToken) return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let loaded = false;
    let map: MapboxMap | null = null;
    let observer: ResizeObserver | null = null;
    let timer = 0;

    const teardown = () => {
      window.clearTimeout(timer);
      observer?.disconnect();
      observer = null;
      map?.remove(); // also releases its event listeners, controls and markers
      map = null;
    };
    const fail = (reason: string) => {
      if (cancelled) return;
      cancelled = true;
      teardown();
      setState({ map: null, api: null, status: 'unavailable', reason });
    };

    loadMapbox()
      .then((api) => {
        if (cancelled) return;
        const o = optionsRef.current;
        try {
          map = new api.Map({
            container,
            style: MAP_STYLE,
            center: [o.center.lng, o.center.lat], // Mapbox order: [longitude, latitude]
            zoom: o.zoom,
            accessToken: MAPBOX_TOKEN,
            attributionControl: false,
            interactive: o.interactive ?? true,
            cooperativeGestures: o.cooperativeGestures ?? false,
          });
        } catch {
          fail('This browser could not start the map (WebGL may be unavailable).');
          return;
        }
        map.addControl(new api.AttributionControl({ compact: true }), 'bottom-right');

        map.on('load', () => {
          loaded = true;
          window.clearTimeout(timer);
          if (!cancelled) setState((s) => ({ ...s, status: 'ready' }));
        });
        map.on('error', (e) => {
          // Tile and source errors after load are not fatal. Style-level failures before load are.
          const err = e as { error?: { status?: number }; sourceId?: string; tile?: unknown };
          if (loaded || err.sourceId || err.tile) return;
          const status = err.error?.status;
          fail(
            status === 401
              ? 'Mapbox rejected the token (401).'
              : status === 403
                ? 'Mapbox blocked this site (403). Check the token’s URL restrictions.'
                : 'The map style could not be loaded.',
          );
        });

        observer = new ResizeObserver(() => map?.resize());
        observer.observe(container);
        timer = window.setTimeout(() => {
          if (!loaded) fail('The map took too long to load.');
        }, LOAD_TIMEOUT_MS);

        setState({ map, api, status: 'loading', reason: '' });
      })
      .catch(() => fail('The map library could not be loaded.'));

    return () => {
      cancelled = true;
      teardown();
    };
  }, [containerRef]);

  return state;
}
