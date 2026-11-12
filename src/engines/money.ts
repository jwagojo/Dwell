/**
 * Round half up at `decimals` places. Decimal-safe: plain Math.round(x * 100) / 100
 * gets 1.005 wrong because 1.005 * 100 is 100.49999999999999 in floating point.
 */
export function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const shifted = Number((value * factor).toPrecision(15));
  return Math.round(shifted) / factor;
}

/**
 * Round up at `decimals` places, decimal-safe the same way. Used where rounding down would under-collect, so the
 * price stays an upper bound on the host's electricity cost (Correctness Property 1, tasks.md 5.2).
 */
export function roundUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const shifted = Number((value * factor).toPrecision(15));
  return Math.ceil(shifted) / factor;
}
