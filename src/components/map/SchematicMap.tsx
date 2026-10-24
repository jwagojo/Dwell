import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MAP_PALETTE, LINE_STYLES } from '../../data/transit';
import { STATIONS } from '../../data/stations';
import type { LatLng } from '../../lib/geo';

/* Schematic map. Geometry is hand-drawn from approximate coordinates and is NOT survey-accurate. It is only the
   labeled fallback shown when the live Mapbox map cannot start (no token, blocked token, WebGL, network). */

const M_PER_DEG_LAT = 111_195;
const VISIBLE_METERS_TALL = 4500;

type Pt = [number, number]; // [lat, lng]

const RIVER: Pt[] = [[42.366, -71.14], [42.3665, -71.125], [42.3655, -71.117], [42.36, -71.113], [42.354, -71.109], [42.351, -71.106], [42.351, -71.1], [42.3535, -71.093], [42.3555, -71.089], [42.3585, -71.083], [42.36, -71.076], [42.362, -71.07], [42.3665, -71.065]];
const RED: Pt[] = [[42.3954, -71.1425], [42.3967, -71.122], [42.3884, -71.1191], [42.3734, -71.119], [42.3654, -71.1031], [42.3624, -71.0862], [42.3612, -71.0706], [42.3564, -71.0624], [42.3523, -71.0552], [42.321, -71.0524]];
const ORANGE: Pt[] = [[42.3664, -71.062], [42.3564, -71.0624], [42.3473, -71.0752], [42.3005, -71.1137]];
const GREEN: Pt[] = [[42.3664, -71.062], [42.3564, -71.0624], [42.3473, -71.0752]];
const COMMUTER: Pt[] = [[42.3664, -71.062], [42.379, -71.085], [42.3884, -71.1191], [42.382, -71.15]];
const MASS_AVE: Pt[] = [[42.3734, -71.119], [42.3654, -71.1031], [42.3601, -71.0942], [42.3547, -71.0905]];
const PARKS: { c: Pt; rx: number; ry: number }[] = [
  { c: [42.3775, -71.12], rx: 26, ry: 18 },
  { c: [42.355, -71.0655], rx: 40, ry: 28 },
  { c: [42.36, -71.115], rx: 22, ry: 16 },
];
const PLACES: { name: string; at: Pt }[] = [
  { name: 'Cambridgeport', at: [42.3585, -71.1065] },
  { name: 'East Cambridge', at: [42.3708, -71.0805] },
  { name: 'Back Bay', at: [42.3503, -71.0825] },
  { name: 'Allston', at: [42.3555, -71.135] },
];

export type Project = (p: LatLng) => { x: number; y: number };

function makeProject(center: LatLng, w: number, h: number, zoom: number): Project {
  const pxPerM = (h / VISIBLE_METERS_TALL) * zoom;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  return (p) => ({
    x: w / 2 + (p.lng - center.lng) * mPerDegLng * pxPerM,
    y: h / 2 - (p.lat - center.lat) * M_PER_DEG_LAT * pxPerM,
  });
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** The drawn map with a render-prop for overlays. Fills its parent. */
export function SchematicMap({
  center,
  zoom = 1,
  showLabels = true,
  children,
}: {
  center: LatLng;
  zoom?: number;
  showLabels?: boolean;
  children?: (ctx: { project: Project; w: number; h: number }) => ReactNode;
}) {
  const [ref, { w, h }] = useElementSize<HTMLDivElement>();
  const project = makeProject(center, w, h, zoom);
  const pts = (line: Pt[]) => line.map(([lat, lng]) => { const { x, y } = project({ lat, lng }); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
  const riverWidth = Math.min(Math.max(40 * zoom, 28), 64);

  const riverPts = RIVER.map(([lat, lng]) => project({ lat, lng }));
  const farBank = riverPts.length
    ? `M ${riverPts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} L ${riverPts[riverPts.length - 1].x} ${h + 2000} L ${riverPts[0].x} ${h + 2000} Z`
    : '';

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden" style={{ background: MAP_PALETTE.land }}>
      {w > 0 && (
        <svg width={w} height={h} className="absolute inset-0" aria-hidden="true" focusable="false">
          <path d={farBank} fill={MAP_PALETTE.farBank} />
          {PARKS.map((p, i) => {
            const c = project({ lat: p.c[0], lng: p.c[1] });
            return <ellipse key={i} cx={c.x} cy={c.y} rx={p.rx * zoom} ry={p.ry * zoom} fill={MAP_PALETTE.parks} />;
          })}
          <polyline points={pts(RIVER)} fill="none" stroke={MAP_PALETTE.water} strokeWidth={riverWidth} strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={pts(MASS_AVE)} fill="none" stroke={MAP_PALETTE.streets} strokeWidth={7} strokeLinecap="round" />
          <polyline points={pts(COMMUTER)} fill="none" stroke={LINE_STYLES.cr.stroke} strokeWidth={3} strokeDasharray="7 6" />
          <polyline points={pts(GREEN)} fill="none" stroke={LINE_STYLES.green.stroke} strokeWidth={4} strokeLinecap="round" />
          <polyline points={pts(ORANGE)} fill="none" stroke={LINE_STYLES.orange.stroke} strokeWidth={4} strokeLinecap="round" />
          <polyline points={pts(RED)} fill="none" stroke={LINE_STYLES.red.stroke} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          {showLabels &&
            PLACES.map((p) => {
              const c = project({ lat: p.at[0], lng: p.at[1] });
              return (
                <text key={p.name} x={c.x} y={c.y} textAnchor="middle" fontSize={12} fontWeight={600} fill={MAP_PALETTE.place}>
                  {p.name}
                </text>
              );
            })}
          {showLabels && (() => {
            const c = project({ lat: 42.3555, lng: -71.1095 });
            return (
              <text x={c.x} y={c.y} textAnchor="middle" fontSize={12} fontStyle="italic" fontWeight={600} fill={MAP_PALETTE.waterLabel}>
                Charles River
              </text>
            );
          })()}
          {STATIONS.map((s) => {
            const c = project(s);
            const color = LINE_STYLES[s.primary].stroke;
            return (
              <g key={s.id}>
                <circle cx={c.x} cy={c.y} r={6} fill="var(--color-paper)" stroke={color} strokeWidth={3} />
                {showLabels && (
                  <text
                    x={c.x + 11}
                    y={c.y + 4}
                    fontSize={12}
                    fontWeight={700}
                    fill={MAP_PALETTE.station}
                    stroke="var(--color-paper)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {s.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {w > 0 && children?.({ project, w, h })}
    </div>
  );
}

