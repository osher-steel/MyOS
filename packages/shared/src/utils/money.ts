export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Splits whole cents in proportion to `weights` so the parts always sum to
 * `total`: floor each share, then hand leftover cents to the largest remainders.
 */
export function splitProportionally(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum === 0) return weights.map(() => 0);

  const exact = weights.map((weight) => (total * weight) / weightSum);
  const parts = exact.map(Math.floor);
  let leftover = total - parts.reduce((sum, part) => sum + part, 0);
  const byRemainder = exact.map((value, i) => [value - parts[i]!, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of byRemainder) {
    if (leftover <= 0) break;
    parts[i]! += 1;
    leftover -= 1;
  }
  return parts;
}
