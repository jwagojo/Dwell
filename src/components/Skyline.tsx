/**
 * A faint city skyline for the bottom of a hero. Decorative only: hidden from assistive tech, ignores the pointer,
 * and sits behind the content. Two layers (far, near) in the brand green at very low opacity, so the page stays
 * quiet and text on top keeps its contrast. The shapes are generic towers with a few Boston-flavored touches
 * (a domed State House, a church steeple, a slanted glass tower), not a survey of any real skyline.
 */

const W = 1600;
const H = 240;

type Top = 'flat' | 'antenna' | 'step' | 'spire' | 'slant';
/** [left edge, width, height, roof] */
type Tower = readonly [number, number, number, Top?];

const FAR: Tower[] = [
  [0, 70, 110], [70, 50, 150, 'step'], [120, 60, 95], [180, 46, 172, 'antenna'], [226, 80, 120], [306, 55, 90],
  [361, 60, 140, 'step'], [421, 40, 188, 'spire'], [461, 70, 115], [531, 55, 100], [586, 85, 150, 'step'],
  [671, 50, 125], [721, 66, 204, 'slant'], [787, 60, 110], [847, 80, 138, 'antenna'], [927, 45, 95],
  [972, 70, 168, 'step'], [1042, 55, 120], [1097, 75, 148, 'spire'], [1172, 50, 105], [1222, 70, 158, 'step'],
  [1292, 60, 115], [1352, 80, 174, 'antenna'], [1432, 50, 100], [1482, 65, 142, 'step'], [1547, 53, 120],
];

const NEAR: Tower[] = [
  [0, 96, 58], [96, 60, 82, 'step'], [156, 70, 54], [226, 50, 96, 'antenna'], [276, 84, 64], [360, 60, 86],
  [420, 74, 58], [494, 40, 104, 'spire'], [534, 90, 62], [624, 64, 80, 'step'], [688, 78, 56],
  [850, 62, 90, 'step'], [912, 84, 60], [996, 56, 100, 'antenna'], [1052, 90, 58], [1142, 66, 84],
  [1208, 80, 56], [1288, 58, 96, 'step'], [1346, 86, 62], [1432, 60, 88], [1492, 108, 56],
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

/** The State House: a wide hall with a dome and lantern. Sits in the near layer. */
const STATE_HOUSE = (() => {
  const x = 746;
  const w = 100;
  const y = H - 54;
  const cx = x + w / 2;
  return `M${x} ${H}V${y}H${x + w}V${H}Z M${cx - 24} ${y}A24 24 0 0 1 ${cx + 24} ${y}Z M${cx - 4} ${y - 24}h8v-10h-8Z M${cx - 1} ${y - 34}h2v-8h-2Z`;
})();

const FAR_PATH = FAR.map(towerPath).join('');
const NEAR_PATH = NEAR.map(towerPath).join('') + STATE_HOUSE;

export default function Skyline({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none select-none ${className}`}
    >
      <path d={FAR_PATH} fill="var(--color-accent)" fillOpacity="0.055" />
      <path d={NEAR_PATH} fill="var(--color-accent)" fillOpacity="0.085" />
    </svg>
  );
}
