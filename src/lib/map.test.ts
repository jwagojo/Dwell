import { featureFilter, type StyleSpecification, type FilterSpecification } from '@maplibre/maplibre-gl-style-spec';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeMapStyle } from './map';

afterEach(() => vi.restoreAllMocks());

function style(layerId: string): StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: layerId, type: 'symbol', source: 'roads', filter: ['all', ['<=', ['get', 'ref_length'], 6], ['==', ['geometry-type'], 'LineString']] }] };
}

describe('provider road-shield filters', () => {
  it.each(['highway-shield-non-us', 'highway-shield-us-interstate', 'road_shield_us'])('handles missing properties in %s without MapLibre evaluation warnings', (id) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = normalizeMapStyle(style(id)).layers[0];
    const filter = featureFilter(('filter' in layer ? layer.filter : undefined) as FilterSpecification, `layers[${id}].filter`);
    for (const properties of [{}, { ref_length: null }, { ref_length: '3' }, { ref_length: true }]) {
      expect(filter.filter({ zoom: 14 }, { type: 2, properties })).toBe(false);
    }
    expect(filter.filter({ zoom: 14 }, { type: 2, properties: { ref_length: 3 } })).toBe(true);
    expect(filter.filter({ zoom: 14 }, { type: 2, properties: { ref_length: 7 } })).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('preserves provider styling, avoids mutating the source, and can be applied twice', () => {
    const original = style('highway-shield-non-us');
    const before = JSON.stringify(original);
    const result = normalizeMapStyle(original);
    expect(JSON.stringify(original)).toBe(before);
    expect(normalizeMapStyle(result)).toEqual(result);
    const other = style('unrelated-layer');
    expect(normalizeMapStyle(other)).toEqual(other);
  });
});
