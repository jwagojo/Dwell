import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LatLng } from '../../lib/geo';
import { MAP_STYLE_URL } from '../../lib/map';

export type MapLibreModule = typeof import('maplibre-gl');

let modulePromise: Promise<MapLibreModule> | null = null;

/** maplibre-gl is large, so it loads on demand, the first time a map mounts. */
export function loadMapLibre(): Promise<MapLibreModule> {
  modulePromise ??= (async () => {
    const [ns, worker] = await Promise.all([
      import('maplibre-gl'),
      // Vite serves the worker as its own file; MapLibre 6 must be told where it is.
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
    ]);
    const api = ((ns as unknown as { default?: MapLibreModule }).default ?? ns) as MapLibreModule;
    api.setWorkerUrl(worker.default);
    return api;
  })();
  // Allow a retry on the next mount if the chunk failed to load.
  modulePromise.catch(() => {
    modulePromise = null;
  });
  return modulePromise;
}

export type MapStatus = 'loading' | 'ready' | 'unavailable';

export interface MapLibreMapState {
  map: MapLibreMap | null;
  api: MapLibreModule | null;
  status: MapStatus;
  /** Plain-language reason, set when status is "unavailable" */
  reason: string;
}

export interface MapLibreMapOptions {
  center: LatLng;
  zoom: number;
  interactive?: boolean;
  /** Two-finger gestures so a stacked map does not trap page scrolling on phones */
  cooperativeGestures?: boolean;
}

const LOAD_TIMEOUT_MS = 15_000;

/**
 * Creates one MapLibre map inside `containerRef` and tears everything down on unmount.
 * Safe under React StrictMode (effects run twice) because creation is async and guarded by `cancelled`.
 * `options` are read once, at creation. Move the camera through the returned `map` afterwards.
 */
export function useMapLibreMap(containerRef: RefObject<HTMLDivElement | null>, options: MapLibreMapOptions): MapLibreMapState {
  const [state, setState] = useState<MapLibreMapState>({ map: null, api: null, status: 'loading', reason: '' });
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let loaded = false;
    let map: MapLibreMap | null = null;
    let observer: ResizeObserver | null = null;
    let timer = 0;

    const teardown = () => {
      window.clearTimeout(timer);
      observer?.disconnect();
      observer = null;
      map?.remove(); // also releases its event listeners, controls and markers
      map = null;
    };
    const fail = (reason: string, cause?: unknown) => {
      if (cancelled) return;
      cancelled = true;
      console.warn(`[Dwell] Map unavailable: ${reason}`, cause ?? '');
      teardown();
      setState({ map: null, api: null, status: 'unavailable', reason });
    };

    loadMapLibre()
      .then((api) => {
        if (cancelled) return;
        const o = optionsRef.current;
        try {
          map = new api.Map({
            container,
            style: MAP_STYLE_URL,
            center: [o.center.lng, o.center.lat], // MapLibre order: [longitude, latitude]
            zoom: o.zoom,
            attributionControl: false,
            interactive: o.interactive ?? true,
            cooperativeGestures: o.cooperativeGestures ?? false,
          });
        } catch (e) {
          fail('This browser could not start the map (WebGL may be unavailable).', e);
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
          const err = e as { error?: unknown; sourceId?: string; tile?: unknown };
          if (loaded || err.sourceId || err.tile) return;
          fail('The map style could not be loaded.', err.error);
        });

        observer = new ResizeObserver(() => map?.resize());
        observer.observe(container);
        timer = window.setTimeout(() => {
          if (!loaded) fail('The map took too long to load.');
        }, LOAD_TIMEOUT_MS);

        setState({ map, api, status: 'loading', reason: '' });
      })
      .catch((e) => fail('The map library could not be loaded.', e));

    return () => {
      cancelled = true;
      teardown();
    };
  }, [containerRef]);

  return state;
}
