import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import pointer from '../src/data/current.json';
import type { Catalog, CollectionFlags, Settings } from '../src/types';
import { maxPokemon, usefulMaxEntries } from '../src/lib/maxPokemon';
import { reachable, optionsFor, recommendation } from '../src/lib/assessment';
// @ts-expect-error Node source parser runs outside browser TypeScript.
import { extractMaxSupport, extractMaxCapabilities } from '../scripts/max-support-lib.mjs';
// @ts-expect-error Node validator runs outside browser TypeScript.
import { hash, validateCatalog } from '../scripts/data-lib.mjs';
const data = JSON.parse(readFileSync('public' + pointer.file, 'utf8')) as Catalog;
const raw = JSON.parse(readFileSync('data/sources-current.json', 'utf8'));
const bundle = JSON.parse(gunzipSync(readFileSync(raw.file)).toString());
const settings: Settings = {
  maxLevel: 50,
  bestBuddy: false,
  floor: 0,
  threshold: 95,
  gender: 'unknown',
  eventPaths: false,
};
const flags: CollectionFlags = {
  shiny: false,
  costume: false,
  rare: false,
  sentimental: false,
  maxBattle: false,
  ordinaryExtra: false,
  alreadyTraded: false,
};
const byId = new Map(data.species.map((p) => [p.id, p]));
const paths = (id: string) =>
  optionsFor(reachable(byId.get(id)!, byId, settings, [1, 2, 3]), data.maxBattles).filter(
    (o) => o.role === 'Max',
  );
it('captures complete source tables and preserves separate S/A support tiers and moves', () => {
  expect(bundle.maxSupportCaptures.map((c: { role: string }) => c.role).sort()).toEqual([
    'Defender',
    'Healer',
  ]);
  for (const c of bundle.maxSupportCaptures) {
    expect(hash(c.html)).toBe(c.sha256);
    expect(extractMaxSupport(c.html, c.role)).toEqual({ rows: c.rows, updated: c.updated });
    for (const entry of data.maxBattles!.supportEntries!)
      for (const support of entry.support!.filter((r) => r.role === c.role)) {
        const row = c.rows.find(
          (r: { dex: number; name: string }) => r.dex === entry.dex && entry.name.includes(r.name),
        );
        expect(row).toBeDefined();
        expect(support).toMatchObject({
          tier: row.tier,
          source: c.url,
          retrieved: c.retrieved,
          updated: c.updated,
          resistances: row.resistances,
        });
        expect(support.fastMoves.map((m) => m.name)).toEqual(row.fastMoves);
        expect(['SS', 'S+', 'S', 'A+', 'A']).toContain(support.tier);
      }
  }
  const defenders = maxPokemon(data, 'All', 'Defender');
  expect(defenders).toHaveLength(9);
  expect(
    defenders
      .filter((e) => e.support![0].tier === 'S')
      .map((e) => e.name)
      .sort(),
  ).toEqual(['Crowned Shield Zamazenta', 'Dynamax Registeel']);
  const metagross = defenders.find((e) => e.dex === 376)!;
  expect(metagross.support![0].fastMoves).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Shadow Claw', verified: true, limited: true }),
    ]),
  );
  expect(maxPokemon(data, 'All', 'Healer')).toHaveLength(12);
  const blissey = maxPokemon(data, 'All', 'Healer').find((e) => e.dex === 242)!;
  expect(blissey.support![0]).toMatchObject({ role: 'Healer', tier: 'S', fastMoves: [] });
  expect(defenders.some((e) => e.dex === 242)).toBe(false);
});
it('merges attack and support once per form and never mutates the catalog', () => {
  const before = JSON.stringify(data.maxBattles);
  const all = maxPokemon(data, 'All', 'All');
  expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  const crown = all.find((e) => e.name === 'Crowned Shield Zamazenta')!;
  expect(crown.roles.length).toBeGreaterThan(0);
  expect(crown.support).toEqual(
    expect.arrayContaining([expect.objectContaining({ role: 'Defender', tier: 'S' })]),
  );
  expect(maxPokemon(data, 'All', 'Attacker').every((e) => !e.support?.length)).toBe(true);
  expect(
    maxPokemon(data, 'All', 'Healer').every(
      (e) => !e.roles.length && e.support?.every((r) => r.role === 'Healer'),
    ),
  ).toBe(true);
  expect(JSON.stringify(data.maxBattles)).toBe(before);
  expect(maxPokemon({ ...data, maxBattles: undefined }, 'All', 'Healer')).toEqual([]);
});
it('includes healer and defender evolutions without borrowing unavailable Max forms', () => {
  expect(paths('happiny').find((o) => o.max?.name === 'Dynamax Blissey')?.max?.support).toEqual(
    expect.arrayContaining([expect.objectContaining({ role: 'Healer', tier: 'S' })]),
  );
  expect(paths('happiny').find((o) => o.max?.name === 'Dynamax Blissey')?.path).toEqual([
    'happiny',
    'chansey',
    'blissey',
  ]);
  expect(paths('beldum').find((o) => o.max?.name === 'Dynamax Metagross')?.max?.support).toEqual(
    expect.arrayContaining([expect.objectContaining({ role: 'Defender', tier: 'A' })]),
  );
  expect(paths('wailmer').find((o) => o.max?.name === 'Dynamax Wailord')?.max?.support).toEqual(
    expect.arrayContaining([expect.objectContaining({ role: 'Healer', tier: 'A' })]),
  );
  expect(paths('wailmer').some((o) => o.max?.mode === 'Gigantamax')).toBe(false);
  expect(paths('beldum_shadow')).toEqual([]);
  expect(paths('metagross_mega')).toEqual([]);
  expect(
    maxPokemon(data, 'All', 'Healer')
      .filter((e) => e.dex === 131)
      .map((e) => e.mode)
      .sort(),
  ).toEqual(['Dynamax', 'Gigantamax']);
  expect(
    usefulMaxEntries(data.maxBattles).every(
      (e) =>
        e.roles.every((r) => ['SS', 'S+', 'S', 'A+', 'A'].includes(r.tier)) &&
        e.support!.every((r) => ['SS', 'S+', 'S', 'A+', 'A'].includes(r.tier)),
    ),
  ).toBe(true);
});
it('treats support as a conditional useful role without applying an attack IV cutoff', () => {
  const options = paths('wailmer').filter((o) => o.max?.support?.some((r) => r.role === 'Healer'));
  expect(options.length).toBeGreaterThan(0);
  for (const ivs of [
    [1, 2, 3],
    [15, 15, 14],
  ] as [number, number, number][]) {
    expect(
      recommendation(
        byId.get('wailmer')!,
        ivs,
        options,
        { ...flags, ordinaryExtra: true },
        settings,
        true,
      ),
    ).toMatchObject({ verdict: 'Review', title: 'Check this copy’s Max capability.' });
  }
});
it('rejects wrong or incomplete support sources and below-cutoff catalog roles', () => {
  const capture = bundle.maxSupportCaptures[0];
  expect(() => extractMaxSupport(capture.html, 'Healer')).toThrow('Wrong');
  expect(() =>
    extractMaxSupport('<h1>Max Defenders Tier List</h1><h2>S Tier</h2>', 'Defender'),
  ).toThrow('Incomplete');
  const broken = structuredClone(data);
  broken.maxBattles!.supportEntries![0].support![0].tier = 'B';
  expect(() => validateCatalog(broken, 1608)).toThrow('Invalid Max support role');
});

it('retains the low-tier Substitute placeholder without accepting an unidentified useful form', () => {
  const row = (dex: number, name: string) =>
    '<table><tbody><tr><td><a href="https://db.pokemongohub.net/pokemon/' +
    dex +
    '">' +
    name +
    '</a></td><td><ul><li>Tackle</li></ul></td></tr></tbody></table>';
  const html =
    '<h1>Max Defenders Tier List</h1><h2>S Tier</h2>' +
    row(379, 'Registeel') +
    '<h2>A Tier</h2>' +
    row(131, 'Lapras') +
    '<h2>E Tier</h2>' +
    row(0, 'Substitute');
  expect(extractMaxSupport(html, 'Defender').rows.at(-1)).toMatchObject({
    dex: 0,
    name: 'Substitute',
    tier: 'E',
    placeholder: true,
    fastMoves: ['Tackle'],
  });
  expect(
    extractMaxSupport(html + row(0, 'Substitute'), 'Defender').rows.filter(
      (r: { placeholder?: boolean }) => r.placeholder,
    ),
  ).toHaveLength(2);
  expect(() => extractMaxSupport(html + row(379, 'Registeel'), 'Defender')).toThrow('duplicate');
  expect(() =>
    extractMaxSupport(html.replace('<h2>E Tier</h2>', '<h2>A Tier</h2>'), 'Defender'),
  ).toThrow('Unidentified');
  expect(() => extractMaxSupport(html.replace('Substitute', 'Unknown'), 'Defender')).toThrow(
    'Unidentified',
  );
});

it('requires an explicit Max label as capability evidence for source-only support forms', () => {
  const html =
    '<h1>Max Attackers Tier List</h1><a class="pokemon-link-renderer" href="https://db.pokemongohub.net/pokemon/809"><span class="name">Melmetal</span><span class="label">Dynamax</span></a><a class="pokemon-link-renderer" href="https://db.pokemongohub.net/pokemon/483"><span class="name">Dialga</span></a>';
  expect(extractMaxCapabilities(html)).toEqual([
    { id: 809, name: 'Dynamax Melmetal', form: 'Dynamax' },
  ]);
  expect(() => extractMaxCapabilities(html.replace('Dynamax', 'Ordinary'))).toThrow(
    'Missing explicit',
  );
  expect(hash(bundle.maxCapabilityCapture.html)).toBe(bundle.maxCapabilityCapture.sha256);
  expect(extractMaxCapabilities(bundle.maxCapabilityCapture.html)).toEqual(
    bundle.maxCapabilityCapture.forms,
  );
});
