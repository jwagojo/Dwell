/**
 * A faint city scene for the bottom of a hero. Decorative only: hidden from assistive tech, ignores the pointer,
 * and sits behind the content. Layers from far to near, all in the brand green at very low opacity, so the page
 * stays quiet and text on top keeps its contrast:
 *   haze towers, towers, a cable-stayed bridge, nearer towers (with a domed State House), an elevated train,
 *   and street level (triple-deckers, trees, street lamps, an EV parked at a charger).
 * The shapes are generic with a few Boston touches, not a survey of any real place.
 *
 * Every fill path is wound clockwise on purpose. SVG's default fill rule cancels overlapping shapes that wind in
 * opposite directions, which would punch holes where a trunk meets a canopy or a spire meets a roof.
 * Paths that need see-through windows use the even-odd rule instead and contain no overlaps.
 */

const W = 1600;
const H = 240;

type Top = 'flat' | 'antenna' | 'step' | 'spire' | 'slant';
/** [left edge, width, height, roof] */
type Tower = readonly [number, number, number, Top?];

const HAZE: Tower[] = [
  [60, 90, 170], [150, 70, 205, 'step'], [300, 100, 190], [480, 80, 215, 'antenna'], [640, 110, 180, 'step'],
  [820, 90, 225], [980, 100, 195, 'step'], [1150, 85, 210, 'antenna'], [1300, 95, 185], [1450, 80, 200, 'step'],
];

const FAR: Tower[] = [
  [0, 70, 110], [70, 50, 150, 'step'], [120, 60, 95], [180, 46, 172, 'antenna'], [226, 80, 120], [306, 55, 90],
  [361, 60, 140, 'step'], [421, 40, 188, 'spire'], [461, 70, 115], [531, 55, 100], [586, 85, 150, 'step'],
  [671, 50, 125], [721, 66, 204, 'slant'], [787, 60, 110], [847, 80, 138, 'antenna'], [927, 45, 95],
  [972, 70, 168, 'step'], [1042, 55, 120], [1097, 75, 148, 'spire'], [1172, 50, 105], [1222, 70, 158, 'step'],
  [1292, 60, 115], [1352, 80, 174, 'antenna'], [1432, 50, 100], [1482, 65, 142, 'step'], [1547, 53, 120],
];

/** Nearer towers. The gaps between them are street level: houses, trees and the parked EV go there. */
const NEAR: Tower[] = [
  [0, 96, 58], [96, 60, 82, 'step'], [156, 70, 54], [226, 44, 96, 'antenna'],
  [394, 64, 86, 'step'], [458, 40, 104, 'spire'], [498, 62, 62],
  [650, 50, 80, 'step'], [700, 46, 56],
  [850, 62, 90, 'step'], [912, 48, 60],
  [1070, 56, 100, 'antenna'], [1126, 60, 58], [1186, 40, 84],
  [1336, 66, 96, 'step'], [1402, 60, 62], [1462, 60, 88], [1522, 78, 56],
];

function towerPath([x, w, h, top = 'flat']: Tower): string {
  const y = H - h;
  const mid = x + w / 2;
  let d = `M${x} ${H}V${y}`;
  if (top === 'slant') d += `L${x + w} ${y + 22}`;
  else if (top === 'step') d += `H${x + w * 0.2}V${y - 14}H${x + w * 0.8}V${y}H${x + w}`;
  else d += `H${x + w}`;
  d += `V${H}Z`;
  if (top === 'antenna') d += `M${mid - 1.5} ${y}V${y - 26}H${mid + 1.5}V${y}Z`;
  if (top === 'spire') d += `M${mid - 5} ${y}L${mid} ${y - 40}L${mid + 5} ${y}Z`;
  return d;
}

/** The State House: a wide hall with a dome and lantern. */
const STATE_HOUSE = (() => {
  const x = 746;
  const w = 100;
  const y = H - 54;
  const cx = x + w / 2;
  return `M${x} ${H}V${y}H${x + w}V${H}Z M${cx - 24} ${y}A24 24 0 0 1 ${cx + 24} ${y}Z M${cx - 4} ${y - 24}h8v-10h-8Z M${cx - 1} ${y - 34}h2v-8h-2Z`;
})();

/* ----- Bridge: a deck, two piers, an A-frame pylon and fanned cables (the cables are strokes) ----- */
const BRIDGE_DECK_Y = 130;
const BRIDGE_PYLON_X = 1217;
const BRIDGE_FILL =
  `M1050 ${BRIDGE_DECK_Y}H1390V${BRIDGE_DECK_Y + 6}H1050Z ` +
  `M1056 ${BRIDGE_DECK_Y + 6}V${H}H1062V${BRIDGE_DECK_Y + 6}Z M1378 ${BRIDGE_DECK_Y + 6}V${H}H1384V${BRIDGE_DECK_Y + 6}Z ` +
  `M1196 ${BRIDGE_DECK_Y}L1214 30H1220L1238 ${BRIDGE_DECK_Y}H1232L1217 46L1202 ${BRIDGE_DECK_Y}Z`;
const BRIDGE_CABLES = [1090, 1118, 1146, 1174, 1260, 1288, 1316, 1344]
  .map((x) => `M${BRIDGE_PYLON_X} 42L${x} ${BRIDGE_DECK_Y}`)
  .join('');

/* ----- Elevated train: a beam on posts and three cars with window cut-outs (even-odd) ----- */
const TRACK_Y = 158;
const TRACK =
  `M240 ${TRACK_Y}H640V${TRACK_Y + 6}H240Z ` +
  Array.from({ length: 7 }, (_, i) => `M${250 + i * 62} ${TRACK_Y + 6}V${H}H${255 + i * 62}V${TRACK_Y + 6}Z`).join(' ');

function trainCar(x: number, lead: boolean): string {
  const top = TRACK_Y - 20;
  const body = lead ? `M${x + 12} ${top}H${x + 62}V${TRACK_Y}H${x}V${top + 12}Z` : `M${x} ${top}H${x + 62}V${TRACK_Y}H${x}Z`;
  const windows = Array.from({ length: 5 }, (_, i) => `M${x + 8 + i * 10} ${top + 4}h7v6h-7Z`).join('');
  return `${body}${windows}`;
}
const TRAIN = [300, 365, 430].map((x, i) => trainCar(x, i === 0)).join(' ');

/* ----- Street level ----- */

/** A triple-decker: gabled roof, three floors of windows (even-odd holes). */
function house(x: number): string {
  const body = `M${x} ${H}V${H - 44}L${x + 17} ${H - 56}L${x + 34} ${H - 44}V${H}Z`;
  const windows = [0, 1, 2]
    .flatMap((r) => [x + 7, x + 21].map((wx) => `M${wx} ${H - 40 + r * 12}h6v7h-6Z`))
    .join('');
  return body + windows;
}
const chimney = (x: number) => `M${x + 22} ${H - 50}V${H - 62}H${x + 27}V${H - 48}Z`;
const HOUSE_XS = [274, 312, 350, 962, 1000, 1038];

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0Z`;
const tree = (x: number, r: number) => `${circle(x, H - r - 16, r)}M${x - 1.5} ${H}V${H - 18}H${x + 1.5}V${H}Z`;

const lamp = (x: number) =>
  `M${x} ${H}V${H - 58}Q${x} ${H - 66} ${x + 10} ${H - 66}H${x + 16}V${H - 63}H${x + 10}Q${x + 3} ${H - 63} ${x + 3} ${H - 56}V${H}Z`;

/** A small EV in profile, parked beside a charger post. */
function car(x: number): string {
  const y = H - 7;
  const body =
    `M${x} ${y}V${H - 14}Q${x + 4} ${H - 17} ${x + 12} ${H - 18}L${x + 20} ${H - 27}Q${x + 22} ${H - 29} ${x + 26} ${H - 29}` +
    `H${x + 38}Q${x + 42} ${H - 29} ${x + 45} ${H - 26}L${x + 52} ${H - 18}Q${x + 58} ${H - 17} ${x + 60} ${H - 13}V${y}Z`;
  return `${body}${circle(x + 15, y, 7)}${circle(x + 46, y, 7)}`;
}
const charger = (x: number) => `M${x} ${H}V${H - 30}Q${x} ${H - 33} ${x + 3} ${H - 33}H${x + 4}Q${x + 7} ${H - 33} ${x + 7} ${H - 30}V${H}Z`;

const HOUSES = HOUSE_XS.map(house).join(' ');
const STREET =
  HOUSE_XS.map(chimney).join('') +
  [tree(572, 13), tree(602, 16), tree(634, 12), tree(1322, 12)].join('') +
  [lamp(552), lamp(1204), lamp(1086)].join('') +
  car(1236) +
  charger(1302);

const FAR_PATH = FAR.map(towerPath).join('');
const HAZE_PATH = HAZE.map(towerPath).join('');
const NEAR_PATH = NEAR.map(towerPath).join('') + STATE_HOUSE;

export default function Skyline({ className = '' }: { className?: string }) {
  const green = 'var(--color-accent)';
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none select-none ${className}`}
    >
      <path d={HAZE_PATH} fill={green} fillOpacity="0.035" />
      <path d={FAR_PATH} fill={green} fillOpacity="0.055" />
      <path d={BRIDGE_FILL} fill={green} fillOpacity="0.06" />
      <path d={BRIDGE_CABLES} fill="none" stroke={green} strokeOpacity="0.06" strokeWidth="1.4" />
      <path d={NEAR_PATH} fill={green} fillOpacity="0.085" />
      <path d={`${TRACK} ${TRAIN}`} fill={green} fillOpacity="0.1" fillRule="evenodd" />
      <path d={HOUSES} fill={green} fillOpacity="0.11" fillRule="evenodd" />
      <path d={STREET} fill={green} fillOpacity="0.11" />
    </svg>
  );
}
