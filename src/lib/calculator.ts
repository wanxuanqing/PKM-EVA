import type {
  BaseStats,
  IVs,
  League,
  BattleStats,
  RankedSpread,
  Distribution,
  IVResult,
} from '../types';

export const CALCULATOR_VERSION = '1.0.0';
export const CAPS: Record<League, number> = { GL: 1500, UL: 2500, ML: Infinity };
export type Calculation = {
  base: BaseStats;
  league: League;
  maxLevel: number;
  minLevel?: number;
  floor?: number;
  eligible?: boolean;
  cpm: readonly number[];
};
export function validIVs(ivs: readonly number[]): ivs is IVs {
  return ivs.length === 3 && ivs.every((n) => Number.isInteger(n) && n >= 0 && n <= 15);
}
export function parseIVs(value: string): IVs | null {
  const parts = value.trim().split(/\s*[/,\s]\s*/);
  if (parts.length !== 3 || parts.some((p) => !/^\d{1,2}$/.test(p))) return null;
  const nums = parts.map(Number);
  return validIVs(nums) ? nums : null;
}
export function validLevel(level: number): boolean {
  return Number.isFinite(level) && level >= 1 && level <= 51 && Number.isInteger(level * 2);
}
export function effectiveMax(maxLevel: number, bestBuddy: boolean): number {
  if (!validLevel(maxLevel) || maxLevel > 50)
    throw new Error('Maximum level must be a half-level from 1 to 50.');
  return maxLevel + (bestBuddy ? 1 : 0);
}
export function statsAt(
  base: BaseStats,
  ivs: IVs,
  level: number,
  cpm: readonly number[],
): BattleStats {
  if (
    !validIVs(ivs) ||
    !validLevel(level) ||
    !Object.values(base).every((n) => Number.isFinite(n) && n > 0)
  )
    throw new Error('Invalid stats, IVs, or level.');
  const m = cpm[(level - 1) * 2];
  if (!(m > 0 && m < 1)) throw new Error('Missing CP multiplier for this level.');
  const atk = (base.atk + ivs[0]) * m;
  const def = (base.def + ivs[1]) * m;
  const hp = Math.max(10, Math.floor((base.hp + ivs[2]) * m));
  const cp = Math.max(
    10,
    Math.floor(
      ((base.atk + ivs[0]) * Math.sqrt(base.def + ivs[1]) * Math.sqrt(base.hp + ivs[2]) * m * m) /
        10,
    ),
  );
  return { level, cp, atk, def, hp, product: atk * def * hp };
}
function validate(c: Calculation) {
  if (!validLevel(c.maxLevel) || !validLevel(c.minLevel ?? 1))
    throw new Error('Invalid level setting.');
  if (!Number.isInteger(c.floor ?? 0) || (c.floor ?? 0) < 0 || (c.floor ?? 0) > 15)
    throw new Error('Invalid IV comparison floor.');
}
export function bestStats(c: Calculation, ivs: IVs): BattleStats | null {
  validate(c);
  if (c.eligible === false || (c.minLevel ?? 1) > c.maxLevel) return null;
  if (c.league === 'ML') return statsAt(c.base, ivs, c.maxLevel, c.cpm);
  // Binary search on floored CP: raw CP may exceed the cap by <1 and still be legal.
  let lo = ((c.minLevel ?? 1) - 1) * 2;
  let hi = (c.maxLevel - 1) * 2;
  if (statsAt(c.base, ivs, lo / 2 + 1, c.cpm).cp > CAPS[c.league]) return null;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (statsAt(c.base, ivs, mid / 2 + 1, c.cpm).cp <= CAPS[c.league]) lo = mid;
    else hi = mid - 1;
  }
  return statsAt(c.base, ivs, lo / 2 + 1, c.cpm);
}
// Transitive tie buckets at 1e-6 absolute stat product, far below displayed precision.
// Integer keys avoid sort-order-dependent pairwise floating-point epsilon comparisons.
export const productKey = (product: number) => Math.round(product * 1e6);
export function rankSpreads(spreads: Omit<RankedSpread, 'rank' | 'key'>[]): Distribution {
  const sorted = spreads
    .map((s) => ({ ...s, rank: 0, key: productKey(s.product) }))
    .sort(
      (a, b) => b.key - a.key || a.ivs[0] - b.ivs[0] || a.ivs[1] - b.ivs[1] || a.ivs[2] - b.ivs[2],
    );
  for (let i = 0; i < sorted.length; i++)
    sorted[i].rank = i > 0 && sorted[i].key === sorted[i - 1].key ? sorted[i - 1].rank : i + 1;
  return {
    spreads: sorted,
    ideals: sorted.filter((s) => s.rank === 1),
    bestProduct: sorted[0]?.product ?? 0,
    poolSize: sorted.length,
  };
}
export function distribution(c: Calculation): Distribution {
  validate(c);
  const spreads: Omit<RankedSpread, 'rank' | 'key'>[] = [];
  for (let a = c.floor ?? 0; a <= 15; a++)
    for (let d = c.floor ?? 0; d <= 15; d++)
      for (let h = c.floor ?? 0; h <= 15; h++) {
        const ivs: IVs = [a, d, h];
        const stats = bestStats(c, ivs);
        if (stats) spreads.push({ ...stats, ivs });
      }
  return rankSpreads(spreads);
}
export function percentile(rank: number, poolSize: number): number {
  if (poolSize < 1 || rank < 1 || rank > poolSize)
    throw new Error('Invalid rank or comparison pool.');
  return poolSize === 1 ? 100 : (100 * (poolSize - rank)) / (poolSize - 1);
}
export function assessIVs(
  c: Calculation,
  ivs: IVs,
  dist: Distribution,
  currentLevel?: number,
): IVResult {
  if (!validIVs(ivs)) throw new Error('IVs must be integers from 0 to 15.');
  const stats = bestStats(c, ivs);
  const spread = dist.spreads.find((s) => s.ivs.every((v, i) => v === ivs[i]));
  const currentCP =
    currentLevel === undefined ? null : statsAt(c.base, ivs, currentLevel, c.cpm).cp;
  return {
    stats,
    rank: spread?.rank ?? null,
    percentile: spread ? percentile(spread.rank, dist.poolSize) : null,
    idealPercent: stats && dist.bestProduct ? (100 * stats.product) / dist.bestProduct : null,
    poolSize: dist.poolSize,
    ideals: dist.ideals,
    inPool: !!spread,
    overCap: currentCP !== null && currentCP > CAPS[c.league],
    aboveMax: currentLevel !== undefined && currentLevel > c.maxLevel,
    currentCP,
    reason: !stats
      ? 'No eligible level for this form and league within these settings.'
      : !spread
        ? 'This copy is outside the selected IV-floor comparison pool.'
        : undefined,
  };
}
export const overallIV = (ivs: IVs) => (ivs.reduce((a, b) => a + b, 0) / 45) * 100;
export const goodOverallIV = (ivs: IVs) => ivs.reduce((a, b) => a + b, 0) >= 41;
export const qualifies = (rank?: number) =>
  rank !== undefined && Number.isInteger(rank) && rank > 0 && rank < 200;
