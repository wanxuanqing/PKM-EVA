import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import pointer from '../src/data/current.json';
import type { Catalog, IVs } from '../src/types';
import {
  statsAt,
  bestStats,
  distribution,
  rankSpreads,
  percentile,
  assessIVs,
  effectiveMax,
  parseIVs,
  goodOverallIV,
  qualifies,
  productKey,
  type Calculation,
} from '../src/lib/calculator';
const data = JSON.parse(readFileSync(`public${pointer.file}`, 'utf8')) as Catalog;
const cpm = data.cpm;
const base = (id: string) => data.species.find((p) => p.id === id)!.baseStats!;
const calc = (
  id = 'dusclops',
  league: Calculation['league'] = 'GL',
  maxLevel = 50,
): Calculation => ({ base: base(id), league, maxLevel, cpm });
describe('CP, HP, and legal half-level selection', () => {
  it('matches the known 100% Bulbasaur CP at level 20', () => {
    const s = statsAt(base('bulbasaur'), [15, 15, 15], 20, cpm);
    expect(s.cp).toBe(637);
    expect(s.hp).toBe(Math.floor((128 + 15) * cpm[38]));
  });
  it('applies separate CP/HP floors and minimums, without rounding attack or defense', () => {
    const s = statsAt({ atk: 1, def: 1, hp: 1 }, [0, 0, 0], 1, cpm);
    expect(s.cp).toBe(10);
    expect(s.hp).toBe(10);
    expect(s.atk).toBe(cpm[0]);
    expect(s.def).toBe(cpm[0]);
  });
  it('finds the highest legal half-level using floored CP', () => {
    const c = calc(),
      v: IVs = [1, 12, 13],
      s = bestStats(c, v)!;
    expect(s.level).toBe(44.5);
    expect(s.cp).toBe(1493);
    expect(statsAt(c.base, v, s.level + 0.5, cpm).cp).toBeGreaterThan(1500);
    const exactCP = statsAt(base('azumarill'), [0, 15, 15], 45.5, cpm).cp;
    expect(exactCP).toBeGreaterThan(0);
    // A CP cap boundary whose unrounded CP is above the integer cap must remain legal.
    let found = false;
    for (const s of distribution(calc('azumarill')).spreads)
      if (s.cp === 1500) {
        expect(bestStats(calc('azumarill'), s.ivs)!.level).toBe(s.level);
        found = true;
        break;
      }
    expect(found).toBe(true);
  });
  it('uses the maximum level when a species cannot approach the cap', () => {
    const s = bestStats(calc('magikarp'), [15, 15, 15])!;
    expect(s.level).toBe(50);
    expect(s.cp).toBeLessThan(500);
  });
  it('excludes ineligible candidates and impossible minimum levels', () => {
    expect(distribution({ ...calc(), eligible: false }).poolSize).toBe(0);
    expect(distribution({ ...calc('mewtwo'), minLevel: 40 }).poolSize).toBe(0);
    expect(distribution({ ...calc(), minLevel: 51 }).poolSize).toBe(0);
  });
  it('respects half-level validation and level 51 Best Buddy', () => {
    expect(effectiveMax(50, true)).toBe(51);
    expect(effectiveMax(40, true)).toBe(41);
    expect(() => effectiveMax(50.5, true)).toThrow();
    expect(() => statsAt(base('duskull'), [1, 2, 3], 44.25, cpm)).toThrow();
    const a = bestStats(calc('dusknoir', 'UL', 50), [1, 12, 13])!,
      b = bestStats(calc('dusknoir', 'UL', 51), [1, 12, 13])!;
    expect(a.level).toBe(50);
    expect(b.level).toBe(50.5);
    expect(b.product).toBeGreaterThan(a.product);
  });
});
describe('ranks, ties and percentile conventions', () => {
  it('reproduces the independently checked Duskull targets without hardcoding in implementation', () => {
    for (const [id, league, rank, ideal, level, cp] of [
      ['dusclops', 'GL', 61, [0, 11, 15], 44.5, 1493],
      ['dusknoir', 'UL', 154, [0, 15, 15], 50, 2475],
    ] as const) {
      const c = calc(id, league),
        d = distribution(c),
        r = assessIVs(c, [1, 12, 13], d);
      expect(d.poolSize).toBe(4096);
      expect(r.rank).toBe(rank);
      expect(d.ideals[0].ivs).toEqual(ideal);
      expect(r.stats?.level).toBe(level);
      expect(r.stats?.cp).toBe(cp);
      expect(r.percentile).toBeCloseTo((100 * (4096 - rank)) / 4095, 10);
      expect(r.idealPercent).toBeCloseTo((r.stats!.product / d.bestProduct) * 100, 10);
    }
  });
  it('ties share rank, all ideals are exposed, and later ranks skip tied entries', () => {
    const s = statsAt(base('dusclops'), [0, 0, 0], 20, cpm);
    const d = rankSpreads([
      { ...s, ivs: [0, 0, 0], product: 100 },
      { ...s, ivs: [0, 0, 1], product: 100 + 1e-9 },
      { ...s, ivs: [0, 0, 2], product: 90 },
    ]);
    expect(d.spreads.map((x) => x.rank)).toEqual([1, 1, 3]);
    expect(d.ideals).toHaveLength(2);
    expect(productKey(100)).toBe(productKey(100 + 1e-9));
    expect(percentile(1, 3)).toBe(100);
    expect(percentile(3, 3)).toBe(0);
    expect(percentile(1, 1)).toBe(100);
  });
  it('keeps theoretical rank and pool unchanged for a copy already over cap', () => {
    const c = calc(),
      d = distribution(c);
    const a = assessIVs(c, [1, 12, 13], d),
      b = assessIVs(c, [1, 12, 13], d, 50);
    expect(b.overCap).toBe(true);
    expect(b.rank).toBe(a.rank);
    expect(b.poolSize).toBe(4096);
  });
  it('uses explicit comparison floors and flags out-of-pool copies', () => {
    const c = { ...calc(), floor: 10 },
      d = distribution(c);
    expect(d.poolSize).toBe(216);
    expect(assessIVs(c, [1, 12, 13], d).rank).toBeNull();
    expect(assessIVs(c, [1, 12, 13], d).inPool).toBe(false);
    const single = { ...calc(), floor: 15 };
    expect(assessIVs(single, [15, 15, 15], distribution(single)).percentile).toBe(100);
  });
  it('ML compares at the selected maximum and exposes real HP ties', () => {
    const c = calc('mewtwo', 'ML', 50),
      d = distribution(c);
    expect(d.ideals.some((x) => x.ivs.join('/') === '15/15/15')).toBe(true);
    expect(d.spreads.every((x) => x.level === 50)).toBe(true);
    expect(d.ideals.every((x) => x.ivs[0] === 15)).toBe(true);
  });
  it('regular and Shadow have identical CP but separate IDs and meta ranks', () => {
    expect(statsAt(base('dusclops'), [1, 12, 13], 44.5, cpm)).toEqual(
      statsAt(base('dusclops_shadow'), [1, 12, 13], 44.5, cpm),
    );
    expect(data.species.find((p) => p.id === 'dusclops')!.rankings.GL?.rank).not.toBe(
      data.species.find((p) => p.id === 'dusclops_shadow')!.rankings.GL?.rank,
    );
  });
});
describe('input and strict user thresholds', () => {
  it.each([
    '16/0/0',
    '-1/12/13',
    '1.2/12/13',
    '1//2/3',
    '1/2',
    '1/2/3/4',
    '',
    '1e1/2/3',
    'NaN/1/1',
  ])('rejects malformed IVs: %s', (input) => expect(parseIVs(input)).toBeNull());
  it('accepts slash, comma, whitespace and surrounding whitespace', () => {
    for (const s of ['1/12/13', ' 1 / 12 / 13 ', '1,12,13', '1 12 13'])
      expect(parseIVs(s)).toEqual([1, 12, 13]);
  });
  it('distinguishes 199 from 200 and 40/45 from 41/45', () => {
    expect(qualifies(199)).toBe(true);
    expect(qualifies(200)).toBe(false);
    expect(qualifies(undefined)).toBe(false);
    expect(goodOverallIV([15, 15, 10])).toBe(false);
    expect(goodOverallIV([15, 15, 11])).toBe(true);
  });
});
