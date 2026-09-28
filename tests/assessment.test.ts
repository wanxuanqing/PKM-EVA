import { it, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import pointer from '../src/data/current.json';
import type { Catalog, CollectionFlags, IVs, Settings, Species } from '../src/types';
import { reachable, optionsFor, recommendation } from '../src/lib/assessment';
import { assessIVs, distribution } from '../src/lib/calculator';
import { searchSpecies } from '../src/lib/search';
const data = JSON.parse(readFileSync(`public${pointer.file}`, 'utf8')) as Catalog;
const map = new Map(data.species.map((p) => [p.id, p]));
const settings: Settings = {
  maxLevel: 50,
  bestBuddy: false,
  floor: 0,
  threshold: 90,
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
const paths = (id: string, s: Partial<Settings> = {}, ivs: IVs = [1, 12, 13]) =>
  reachable(map.get(id)!, map, { ...settings, ...s }, ivs);
describe('catalog and branches', () => {
  it('covers every CSV form with distinct form and Pokédex counts', () => {
    expect(data.species.filter((p) => p.csv)).toHaveLength(1608);
    expect(data.counts.dexSpecies).toBe(953);
    expect(data.audit.missingStats).toEqual([]);
  });
  it('never evolves a regular into Shadow or a Shadow into Mega', () => {
    expect(paths('charmander').every((x) => !x.species.shadow)).toBe(true);
    expect(paths('charmander_shadow').every((x) => x.species.shadow && !x.species.temporary)).toBe(
      true,
    );
    expect(paths('charmander').some((x) => x.species.id === 'charizard_mega_y')).toBe(true);
  });
  it('respects Kirlia gender while preserving both possible targets for unknown gender', () => {
    expect(paths('ralts', { gender: 'female' }).some((t) => t.species.id === 'gallade')).toBe(
      false,
    );
    expect(paths('ralts', { gender: 'male' }).some((t) => t.species.id === 'gallade')).toBe(true);
    expect(paths('ralts').find((t) => t.species.id === 'gallade')?.conditional).toBe(true);
    expect(paths('ralts').some((t) => t.species.id === 'gardevoir')).toBe(true);
  });
  it('separates regional and event-only branches', () => {
    expect(paths('cubone').some((t) => t.species.id === 'marowak_alolan')).toBe(false);
    expect(
      paths('cubone', { eventPaths: true }).find((t) => t.species.id === 'marowak_alolan')
        ?.conditional,
    ).toBe(true);
    expect(paths('slowpoke_galarian').some((t) => t.species.id === 'slowbro')).toBe(false);
    expect(paths('slowpoke_galarian').some((t) => t.species.id === 'slowbro_galarian')).toBe(true);
  });
  it('does not invent Shedinja evolution or ordinary Rockruff’s Dusk branch', () => {
    expect(paths('nincada').some((t) => t.species.id === 'shedinja')).toBe(false);
    expect(paths('rockruff').some((t) => t.species.id === 'lycanroc_dusk')).toBe(false);
  });
  it('handles Tyrogue highest IV and ties', () => {
    expect(
      paths('tyrogue', {}, [15, 10, 5])
        .filter((t) => t.path.length > 1)
        .map((t) => t.species.id),
    ).toEqual(['hitmonlee']);
    expect(
      paths('tyrogue', {}, [15, 15, 5])
        .filter((t) => t.path.length > 1)
        .every((t) => t.conditional),
    ).toBe(true);
  });
  it('allows either Litleo gender and preserves Dusk-capable Rockruff as a separate form', () => {
    expect(paths('litleo', { gender: 'female' }).some((t) => t.species.id === 'pyroar')).toBe(true);
    expect(paths('litleo', { gender: 'male' }).some((t) => t.species.id === 'pyroar')).toBe(true);
    expect(paths('rockruff_dusk').some((t) => t.species.id === 'lycanroc_dusk')).toBe(true);
  });
  it('preserves alternative Eevee and Duskull targets instead of CSV’s single suggestion', () => {
    const options = optionsFor(paths('eevee'));
    expect(options.filter((x) => x.role === 'UL').length).toBeGreaterThan(1);
    expect(
      optionsFor(paths('duskull')).some((x) => x.species.id === 'dusknoir' && x.role === 'GL'),
    ).toBe(true);
  });
  it('fusion preserves the host’s IVs and never applies Zekrom’s to Kyurem', () => {
    expect(paths('kyurem').some((p) => p.species.id === 'kyurem_black')).toBe(true);
    expect(paths('zekrom').some((p) => p.species.id === 'kyurem_black')).toBe(false);
  });
});
describe('search and recommendations', () => {
  it.each([
    ['Mr. Mime', 'mr_mime'],
    ['mr mime', 'mr_mime'],
    ['Nidoran female', 'nidoran_female'],
    ['Nidoran ♀', 'nidoran_female'],
    ['alola marowak', 'marowak_alolan'],
    ['shadow duskull', 'duskull_shadow'],
    ['Flabébé', 'flabebe'],
  ])('finds %s', (q, id) =>
    expect(searchSpecies(data.species, q).some((p) => p.id === id)).toBe(true),
  );
  it('returns meaningful empty results for empty or absent search', () => {
    expect(searchSpecies(data.species, '')).toEqual([]);
    expect(searchSpecies(data.species, 'notapokemon12345')).toEqual([]);
  });
  it('unknown rankings never imply automatic transfer', () => {
    expect(recommendation(map.get('duskull')!, [1, 2, 3], [], flags, settings, true).verdict).toBe(
      'Review',
    );
  });
  it('collection flags and zero/perfect IVs are independent of battle value', () => {
    for (const ivs of [
      [0, 0, 0],
      [15, 15, 15],
    ] as IVs[])
      expect(recommendation(map.get('duskull')!, ivs, [], flags, settings, true).verdict).toBe(
        'Keep',
      );
    expect(
      recommendation(map.get('duskull')!, [1, 2, 3], [], { ...flags, shiny: true }, settings, true)
        .verdict,
    ).toBe('Keep');
  });
  it('useful Shadow never gets a Trade verdict for imperfect IVs', () => {
    const p = map.get('dusclops_shadow')!;
    const c = { base: p.baseStats!, league: 'GL' as const, maxLevel: 50, cpm: data.cpm };
    const r = assessIVs(c, [15, 0, 0], distribution(c));
    const options = optionsFor(paths(p.id))
      .filter((o) => o.role === 'GL')
      .map((o) => ({ ...o, result: r }));
    expect(recommendation(p, [15, 0, 0], options, flags, settings, true).verdict).toBe('Review');
  });
  it('an unverified CSV budget claim does not become strong raid advice', () => {
    const p = {
      ...map.get('abra')!,
      raid: [
        {
          tier: 'budget' as const,
          types: [],
          evidence: 'unverified',
          source: 'input-csv',
          reviewed: '',
        },
      ],
      rankings: {},
      evolutions: [],
    } as Species;
    const options = optionsFor([
      { species: p, path: [p.id], requirements: [], conditional: false },
    ]);
    expect(recommendation(p, [15, 15, 11], options, flags, settings, true).verdict).toBe('Review');
  });
});
