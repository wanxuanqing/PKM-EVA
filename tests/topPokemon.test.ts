import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import pointer from '../src/data/current.json';
import type { Catalog } from '../src/types';
import { topPokemon, raidTiers } from '../src/lib/topPokemon';
const data = JSON.parse(readFileSync(`public${pointer.file}`, 'utf8')) as Catalog;
it('returns the first 50 eligible ranked forms in each league without changing the catalog', () => {
  const original = data.species.map((p) => p.id);
  for (const league of ['GL', 'UL', 'ML'] as const) {
    const entries = topPokemon(data, league);
    expect(entries).toHaveLength(50);
    expect(new Set(entries.map((e) => e.species.id)).size).toBe(50);
    const ranks = entries.map((e) => e.species.rankings[league]!.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(entries.every((e) => e.species.eligible[league])).toBe(true);
    expect(entries.every((e) => e.species.rankings[league]!.moves.length >= 2)).toBe(true);
  }
  expect(data.species.map((p) => p.id)).toEqual(original);
});
it('keeps raid forms unique, uses qualified non-Normal roles and preserves limited moves', () => {
  const entries = topPokemon(data, 'Raid');
  expect(entries).toHaveLength(50);
  expect(new Set(entries.map((e) => e.species.id)).size).toBe(50);
  for (const entry of entries)
    for (const set of entry.sets) {
      expect(set.type).not.toBe('normal');
      expect(raidTiers).toContain(set.tier);
      expect(entry.species.raid.flatMap((r) => r.moveSets ?? [])).toContain(set);
    }
  const tiers = entries.map((e) => raidTiers.indexOf(e.sets[0].tier));
  expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  const fire = topPokemon(data, 'Raid', 'fire');
  expect(fire.length).toBeGreaterThan(0);
  expect(fire.every((e) => e.sets.every((s) => s.type === 'fire'))).toBe(true);
  expect(topPokemon(data, 'Raid', 'normal')).toEqual([]);
});
