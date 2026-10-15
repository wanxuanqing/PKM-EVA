import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import pointer from '../src/data/current.json';
import type { Catalog } from '../src/types';
import { maxPokemon, goodMaxTier } from '../src/lib/maxPokemon';
// @ts-expect-error The source parser runs in Node, outside browser TypeScript.
import { extractMaxRankings } from '../scripts/moves-lib.mjs';
// @ts-expect-error The catalog validator runs in Node, outside browser TypeScript.
import { validateCatalog } from '../scripts/data-lib.mjs';
const data = JSON.parse(readFileSync(`public${pointer.file}`, 'utf8')) as Catalog;
const rawPointer = JSON.parse(readFileSync('data/sources-current.json', 'utf8'));
const bundle = JSON.parse(gunzipSync(readFileSync(rawPointer.file)).toString());
it('preserves the source top five of every type, including types with fewer entries', () => {
  const max = data.maxBattles!;
  expect(max.byType).toHaveLength(18);
  expect(max.byType.some((t) => t.type === 'normal')).toBe(true);
  for (const capture of bundle.maxBattleRankings.captures) {
    const expected = capture.rows.slice(0, 5).filter((r: { tier: string }) => goodMaxTier(r.tier));
    const entries = maxPokemon(data, capture.type);
    expect(entries).toHaveLength(expected.length);
    expect(max.entries.flatMap((e) => e.roles).filter((r) => r.type === capture.type)).toHaveLength(
      Math.min(5, capture.rows.length),
    );
    expect(entries.map((e) => e.roles[0].rank)).toEqual(
      expected.map((r: { order: number }) => r.order),
    );
    for (const row of expected) {
      const entry = entries.find((e) => e.name === row.attacker.name)!;
      expect(entry).toBeDefined();
      expect(entry.roles[0]).toMatchObject({
        tier: row.tier,
        damage: row.dynamax.maxMoveDamage,
        fast: { name: row.qm.name, limited: !!row.qm.isLegacy },
        maxMove: { name: row.cm.name, limited: !!row.cm.isLegacy },
        source: capture.url,
      });
    }
  }
  expect(maxPokemon(data).flatMap((e) => e.roles)).toHaveLength(
    max.entries.flatMap((e) => e.roles).filter((r) => goodMaxTier(r.tier)).length,
  );
  expect(maxPokemon(data).length).toBeGreaterThan(50);
});
it('keeps Dynamax, Gigantamax and cosmetic source variants distinct without changing raid advice', () => {
  const all = maxPokemon(data);
  expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  const machamp = all.filter((e) => e.dex === 68);
  expect(machamp.map((e) => e.mode).sort()).toEqual(['Dynamax', 'Gigantamax']);
  expect(machamp.find((e) => e.mode === 'Gigantamax')?.artwork?.url).not.toMatch(/\/68\.png$/);
  const tox = all.filter((e) => e.dex === 849 && e.mode === 'Dynamax');
  expect(tox).toHaveLength(2);
  expect(new Set(tox.map((e) => e.artwork?.url)).size).toBe(2);
  expect(data.species.find((p) => p.id === 'machamp')?.temporary).toBe(false);
  const original = JSON.stringify(data.maxBattles);
  maxPokemon(data, 'grass');
  expect(JSON.stringify(data.maxBattles)).toBe(original);
});
it('rejects malformed, misidentified or incomplete Max ranking sources', () => {
  const row = {
    order: 1,
    tier: 'S',
    attacker: { id: 812, name: 'Dynamax Rillaboom' },
    qm: { id: 215, name: 'Razor Leaf' },
    cm: { id: 1, name: 'Max Overgrowth' },
    dynamax: { maxMoveDamage: 250 },
  };
  const html = (rows: unknown[], onlyDynamax = true) =>
    `<script>self.__next_f.push(${JSON.stringify([1, '1:' + JSON.stringify(['$', null, null, { allowedType: 'grass', onlyDynamax, initialData: { attackers: rows } }]) + '\n'])})</script>`;
  expect(extractMaxRankings(html([row]), 'grass')).toHaveLength(1);
  expect(() => extractMaxRankings(html([row], false), 'grass')).toThrow('not found');
  expect(() => extractMaxRankings(html([{ ...row, order: 2 }]), 'grass')).toThrow('Incomplete');
  expect(() =>
    extractMaxRankings(html([{ ...row, dynamax: { maxMoveDamage: 0 } }]), 'grass'),
  ).toThrow('Invalid');
  const broken = structuredClone(data);
  broken.maxBattles!.entries[0].roles[0].rank = 6;
  expect(() => validateCatalog(broken, 1608)).toThrow('Invalid Max Battle role');
});

it('retains every A-or-better source role for Useful paths, even below fifth place', () => {
  const actual = data.maxBattles!.usefulEntries!;
  const expected = bundle.maxBattleRankings.captures
    .flatMap(
      (c: { type: string; rows: { order: number; tier: string; attacker: { name: string } }[] }) =>
        c.rows
          .filter((r) => goodMaxTier(r.tier))
          .map((r) => c.type + ':' + r.order + ':' + r.attacker.name),
    )
    .sort();
  expect(
    actual.flatMap((e) => e.roles.map((r) => r.type + ':' + r.rank + ':' + e.name)).sort(),
  ).toEqual(expected);
  expect(actual.every((e) => e.roles.every((r) => goodMaxTier(r.tier)))).toBe(true);
  expect(actual.find((e) => e.name === 'Dynamax Gallade')?.roles).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'psychic', rank: 6, tier: 'S' })]),
  );
  expect(maxPokemon(data, 'psychic').every((e) => e.roles.every((r) => r.rank <= 5))).toBe(true);
});
