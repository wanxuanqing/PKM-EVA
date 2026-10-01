import { it, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import pointer from '../src/data/current.json';
import type { Catalog, CollectionFlags, IVs, Settings, Species } from '../src/types';
import { copyGender, reachable, optionsFor, recommendation } from '../src/lib/assessment';
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
  it('distinguishes Nidoran payload IDs and retains fixed genders through Shadow and temporary forms', () => {
    for (const gender of ['male', 'female'] as const) {
      for (const suffix of ['', '_shadow']) {
        const id = `nidoran_${gender}${suffix}`;
        expect(map.get(id)?.gender?.fixed).toBe(gender);
        const targets = paths(id);
        expect(targets.length).toBe(3);
        expect(targets.every((p) => !p.conditional)).toBe(true);
        expect(targets.every((p) => p.species.gender?.fixed === gender)).toBe(true);
      }
    }
    for (const [id, gender] of [
      ['gallade_mega', 'male'],
      ['kangaskhan_mega', 'female'],
      ['latias_mega', 'female'],
      ['latios_mega', 'male'],
      ['mewtwo_mega_x', 'genderless'],
      ['groudon_primal', 'genderless'],
      ['kyogre_primal', 'genderless'],
    ])
      expect(map.get(id)?.gender?.fixed).toBe(gender);
    expect(map.get('charizard_mega_x')?.gender?.allowed).toEqual(['female', 'male']);
  });
  it('maps costume genders explicitly and distinguishes unavailable evidence from either gender', () => {
    expect(map.get('pikachu_libre')?.gender?.fixed).toBe('female');
    for (const id of ['pikachu_flying', 'pikachu_shaymin', 'pikachu_5th_anniversary'])
      expect(map.get(id)?.gender?.allowed).toEqual(['female', 'male']);
    expect(data.species.filter((p) => !p.gender?.allowed?.length).map((p) => p.id)).toEqual([
      'golisopodsh',
    ]);
    expect(map.get('golisopodsh')?.gender?.source).toBe('');
  });
  it('filters every explicitly gender-restricted evolution and marks unknown copies conditional', () => {
    for (const p of data.species)
      for (const edge of p.evolutions.filter((e) => e.gender)) {
        const permitted = edge.gender!;
        const forbidden = permitted === 'male' ? 'female' : 'male';
        expect(paths(p.id, { gender: permitted }).some((r) => r.species.id === edge.to)).toBe(true);
        expect(paths(p.id, { gender: forbidden }).some((r) => r.species.id === edge.to)).toBe(
          false,
        );
        expect(paths(p.id).find((r) => r.species.id === edge.to)?.conditional).toBe(true);
      }
  });
  it('preserves distinct gender battle forms and cosmetic shared records', () => {
    expect(map.get('oinkologne')?.name).toBe('Oinkologne (Male)');
    expect(map.get('oinkologne')?.gender?.fixed).toBe('male');
    expect(map.get('oinkologne_female')?.gender?.fixed).toBe('female');
    expect(map.get('meowstic')?.gender?.fixed).toBe('male');
    expect(map.get('meowstic_female')?.gender?.fixed).toBe('female');
    expect(map.get('indeedee_female')?.gender?.fixed).toBe('female');
    for (const id of ['jellicent', 'frillish', 'pyroar']) {
      expect(map.get(id)?.gender?.fixed).toBeNull();
      expect(map.get(id)?.gender?.sharedAppearance).toBe(true);
    }
    expect(copyGender(map.get('oinkologne_female')!, 'male')).toBe('female');
    expect(copyGender(map.get('mewtwo')!, 'female')).toBe('genderless');
  });
  it('keeps unknown gender branches conditional and filters known copy genders', () => {
    for (const [start, male, female] of [
      ['lechonk', 'oinkologne', 'oinkologne_female'],
      ['espurr', 'meowstic', 'meowstic_female'],
    ]) {
      expect(paths(start, { gender: 'female' }).some((t) => t.species.id === male)).toBe(false);
      expect(paths(start, { gender: 'male' }).some((t) => t.species.id === female)).toBe(false);
      expect(paths(start).find((t) => t.species.id === female)?.conditional).toBe(true);
      expect(
        paths(start, { gender: 'female' }).find((t) => t.species.id === female)?.conditional,
      ).toBe(false);
    }
    expect(paths('frillish', { gender: 'female' }).some((t) => t.species.id === 'jellicent')).toBe(
      true,
    );
  });
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
