/* Colours here are CSS custom properties from tokens.css, never literals. They are used in inline styles and SVG
   presentation attributes, where the browser resolves var() at paint time. */

export type LineKey = 'red' | 'green' | 'orange' | 'cr';

export interface LineStyle {
  label: string;
  badgeBg: string;
  badgeText: string;
  stroke: string;
}

export const LINE_STYLES: Record<LineKey, LineStyle> = {
  red: { label: 'Red Line', badgeBg: 'var(--color-line-red-bg)', badgeText: 'var(--color-line-red-ink)', stroke: 'var(--color-line-red)' },
  green: { label: 'Green Line', badgeBg: 'var(--color-line-green-bg)', badgeText: 'var(--color-line-green-ink)', stroke: 'var(--color-line-green)' },
  orange: { label: 'Orange Line', badgeBg: 'var(--color-line-orange-bg)', badgeText: 'var(--color-line-orange-ink)', stroke: 'var(--color-line-orange)' },
  cr: { label: 'Commuter Rail', badgeBg: 'var(--color-line-rail-bg)', badgeText: 'var(--color-line-rail-ink)', stroke: 'var(--color-line-rail)' },
};

export const BUS_STYLE = { badgeBg: 'var(--color-paper-3)', badgeText: 'var(--color-ink)' };

/** Resolve a route label ("Red Line", "CT1", "47") to its badge colors. */
export function routeStyle(route: string): { bg: string; text: string } {
  const line = (Object.keys(LINE_STYLES) as LineKey[]).find((k) => LINE_STYLES[k].label === route);
  if (line) return { bg: LINE_STYLES[line].badgeBg, text: LINE_STYLES[line].badgeText };
  return { bg: BUS_STYLE.badgeBg, text: BUS_STYLE.badgeText };
}

export const MAP_PALETTE = {
  land: 'var(--color-map-land)',
  parks: 'var(--color-map-park)',
  water: 'var(--color-map-water)',
  streets: 'var(--color-map-street)',
  place: 'var(--color-map-place)',
  station: 'var(--color-muted)',
  waterLabel: 'var(--color-map-water-ink)',
  farBank: 'var(--color-map-far)',
} as const;
