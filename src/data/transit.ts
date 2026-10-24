export type LineKey = 'red' | 'green' | 'orange' | 'cr';

export interface LineStyle {
  label: string;
  badgeBg: string;
  badgeText: string;
  stroke: string;
}

export const LINE_STYLES: Record<LineKey, LineStyle> = {
  red: { label: 'Red Line', badgeBg: '#FBE4E4', badgeText: '#9B1C1C', stroke: '#D3302F' },
  green: { label: 'Green Line', badgeBg: '#E1F2E7', badgeText: '#0B5A2B', stroke: '#00843D' },
  orange: { label: 'Orange Line', badgeBg: '#FDEBDD', badgeText: '#8A3D05', stroke: '#E8730C' },
  cr: { label: 'Commuter Rail', badgeBg: '#F3E8F4', badgeText: '#6B2A72', stroke: '#8B4A93' },
};

export const BUS_STYLE = { badgeBg: '#F0F1F4', badgeText: '#12151C' };

/** Resolve a route label ("Red Line", "CT1", "47") to its badge colors. */
export function routeStyle(route: string): { bg: string; text: string } {
  const line = (Object.keys(LINE_STYLES) as LineKey[]).find((k) => LINE_STYLES[k].label === route);
  if (line) return { bg: LINE_STYLES[line].badgeBg, text: LINE_STYLES[line].badgeText };
  return { bg: BUS_STYLE.badgeBg, text: BUS_STYLE.badgeText };
}

export const MAP_PALETTE = {
  land: '#EEF0EA',
  parks: '#D7E8D0',
  water: '#BFD9F0',
  streets: '#FFFFFF',
  place: '#7A8190',
  station: '#586070',
  waterLabel: '#3C6A92',
  farBank: '#E6E8E2',
} as const;
