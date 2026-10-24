/**
 * Round half up at `decimals` places. Decimal-safe: plain Math.round(x * 100) / 100
 * gets 1.005 wrong because 1.005 * 100 is 100.49999999999999 in floating point.
 */
export function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const shifted = Number((value * factor).toPrecision(15));
  return Math.round(shifted) / factor;
}
