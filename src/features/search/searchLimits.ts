import type { Evaluation } from './evaluateListing';

/** Optional budget and walking limits from the Filters tray. null means unlimited. */
export interface SearchLimits {
  maxTotalUsd: number | null;
  budgetExclusive: boolean;
  maxWalkMinutes: number | null;
}

export const NO_SEARCH_LIMITS: SearchLimits = { maxTotalUsd: null, budgetExclusive: false, maxWalkMinutes: null };

/** Uses the fee-inclusive booking total and fails closed when walking distance is unknown. */
export function matchesSearchLimits(e: Evaluation, limits: SearchLimits): boolean {
  if (limits.maxTotalUsd !== null && (limits.budgetExclusive ? e.total >= limits.maxTotalUsd : e.total > limits.maxTotalUsd)) return false;
  return limits.maxWalkMinutes === null || (e.walkMinutes !== null && e.walkMinutes <= limits.maxWalkMinutes);
}
