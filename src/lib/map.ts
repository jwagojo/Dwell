import type { FilterSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Map configuration for MapLibre GL JS. The map needs a style URL, not an access token.
 *
 * Default: OpenFreeMap "positron" (light, OpenStreetMap data). It is free, needs no key or account, and its
 * attribution is included in the style, so keep the attribution control on the map.
 * To use another provider (MapTiler, Stadia, Amazon Location, self-hosted), set VITE_MAP_STYLE_URL to a MapLibre
 * style JSON URL. If that URL carries an API key, the key is visible in the browser bundle, so restrict it by URL.
 */

export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export function resolveMapStyleUrl(raw: string | undefined): string {
  const url = (raw ?? '').trim();
  return url === '' ? DEFAULT_MAP_STYLE_URL : url;
}

export const MAP_STYLE_URL: string = resolveMapStyleUrl(import.meta.env.VITE_MAP_STYLE_URL as string | undefined);

const ROAD_SHIELD_LAYERS = new Set(['highway-shield-non-us', 'highway-shield-us-interstate', 'road_shield_us']);

function guardReferenceLength(filter: unknown): unknown {
  if (!Array.isArray(filter)) return filter;
  if (filter[0] === 'all' || filter[0] === 'any') return filter.map((part, index) => index === 0 ? part : guardReferenceLength(part));
  const property = filter[1];
  if (['<', '<=', '>', '>='].includes(filter[0]) && Array.isArray(property) &&
    property.length === 2 && property[0] === 'get' && property[1] === 'ref_length' && typeof filter[2] === 'number') {
    // Missing/null/non-numeric ref_length cannot produce a usable road shield. Skip the comparison entirely.
    return ['case', ['==', ['typeof', property], 'number'], filter, false];
  }
  return filter;
}

/** Apply before style evaluation in both the main thread and workers; preserve all other provider styling. */
export function normalizeMapStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => ROAD_SHIELD_LAYERS.has(layer.id) && 'filter' in layer && layer.filter
      ? { ...layer, filter: guardReferenceLength(layer.filter) as FilterSpecification }
      : layer),
  };
}
