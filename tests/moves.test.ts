import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import pointer from '../src/data/current.json';
import type { Catalog } from '../src/types';
import {
  extractPokemonMoves,
  extractTypeRankings,
  matchRaidForm,
  goodRaidTier,
  // @ts-expect-error Source extraction runs in Node, outside browser TypeScript.
} from '../scripts/moves-lib.mjs';
const data = JSON.parse(readFileSync(`public${pointer.file}`, 'utf8')) as Catalog;
const rawPointer = JSON.parse(readFileSync('data/sources-current.json', 'utf8'));
const bundle = JSON.parse(gunzipSync(readFileSync(rawPointer.file)).toString());
describe('verified moves datasheet', () => {
  it('matches every qualifying PvP moveset against the pinned raw ranking, including move flags', () => {
    const gm = JSON.parse(bundle.pvpoke.files['src/data/gamemaster.json']);
    for (const [league, cap] of [
      ['GL', 1500],
      ['UL', 2500],
      ['ML', 10000],
    ] as const) {
      const rankings = JSON.parse(
        bundle.pvpoke.files[`src/data/rankings/all/overall/rankings-${cap}.json`],
      );
      for (const p of data.species.filter(
        (p) => p.eligible[league] && (p.rankings[league]?.rank ?? 999) < 200,
      )) {
        const source = rankings.find((r: { speciesId: string }) => r.speciesId === p.id);
        const form = gm.pokemon.find((r: { speciesId: string }) => r.speciesId === p.id);
        expect(p.rankings[league]!.moves).toEqual(
          source.moveset.map((id: string) => ({
            name: gm.moves.find((m: { moveId: string }) => m.moveId === id).name,
            elite: (form.eliteMoves ?? []).includes(id),
            legacy: (form.legacyMoves ?? []).includes(id),
          })),
        );
      }
    }
  });
  it('adds good raid roles without promoting weak or excluded Normal roles', () => {
    const chandelure = data.species.find((p) => p.id === 'chandelure')!;
    expect(chandelure.raid[0].moveSets?.map((r) => r.type).sort()).toEqual(['ghost']);
    expect(chandelure.raid[0].moves).toContain('ghost: Hex + Shadow Ball');
    expect(chandelure.raid[0].source).toBe(
      'https://db.pokemongohub.net/pokemon-list/best-per-type/ghost',
    );
    for (const id of ['arcanine', 'regigigas', 'regigigas_shadow']) {
      const raid = data.species.find((p) => p.id === id)!.raid[0];
      expect(raid.source).toBe('input-csv');
      expect(raid.moveReview?.reason).toContain('No role meets');
      expect(raid.moves?.length ?? 0).toBe(0);
    }
    expect(
      data.species
        .find((p) => p.id === 'blastoise_mega')!
        .raid[0].moveSets?.some((r) => r.charged.name === 'Hydro Cannon' && r.charged.limited),
    ).toBe(true);
  });
  it('exports matching CSV/JSON rows tied to the same app catalog', () => {
    const sheet = JSON.parse(readFileSync(`public${data.movesheet!.json}`, 'utf8'));
    const csv = parse(readFileSync(`public${data.movesheet!.csv}`, 'utf8'), {
      columns: true,
    }) as Record<string, string>[];
    expect(sheet.catalogVersion).toBe(data.version);
    expect(sheet.pvpokeCommit).toBe(bundle.pvpoke.commit);
    expect(csv.length).toBe(sheet.rows.length);
    const normal = sheet.rows.filter(
      (r: { role: string; attackingType: string }) =>
        r.role === 'Raid' && r.attackingType === 'normal',
    );
    expect(normal.length).toBeGreaterThan(0);
    expect(normal.every((r: { includedInApp: boolean }) => !r.includedInApp)).toBe(true);
    expect(
      sheet.rows.filter(
        (r: { role: string; includedInApp: boolean }) => r.role !== 'Raid' && r.includedInApp,
      ).length,
    ).toBe(data.movesheet!.pvp);
    expect(
      csv.find((r) => r.id === 'chandelure' && r.role === 'Raid' && r.attackingType === 'ghost')
        ?.fastMove,
    ).toBe('Hex');
  });
  it('rejects mismatched forms and malformed source cards while preserving access markers', () => {
    const html =
      '<h1>Shadow Example</h1><article><header><h4 class="MovesetCardV2_title_test">Fast + Charged</h4><a href="/pokemon-list/best-per-type/fire">A</a></header><a href="/move/1">Fast</a><a href="/move/2">Charged *</a><p>Shadow Example ranks #12</p></article>';
    expect(extractPokemonMoves(html, 'Example (Shadow)').roles[0].moves[1]).toMatchObject({
      name: 'Charged',
      limited: true,
    });
    expect(() => extractPokemonMoves(html, 'Example')).toThrow('Form mismatch');
    expect(() =>
      extractPokemonMoves(html.replace('<a href="/move/2">Charged *</a>', ''), 'Shadow Example'),
    ).toThrow('invalid moveset');
  });
});

describe('complete SS/S/A raid coverage', () => {
  it('matches every qualifying full-list row to an exact form, tier, rank and flagged moves', () => {
    const rules = JSON.parse(readFileSync('data/manual-rules.json', 'utf8'));
    expect(bundle.raidTypeRankings).toHaveLength(17);
    let count = 0;
    for (const capture of bundle.raidTypeRankings) {
      expect(capture.type).not.toBe('normal');
      expect(goodRaidTier(capture.rows.at(-1).tier)).toBe(false);
      for (const row of capture.rows.filter((r: { tier: string }) => goodRaidTier(r.tier))) {
        const p = matchRaidForm(row, data.species, rules.raidAliases);
        expect(p, row.attacker.name).toBeDefined();
        const set = p.raid
          .flatMap((r: { moveSets: unknown[] }) => r.moveSets ?? [])
          .find((m: { type: string }) => m.type === capture.type);
        expect(set, `${p.id} ${capture.type}`).toMatchObject({
          tier: row.tier,
          rank: row.order,
          fast: { name: row.qm.name, limited: !!row.qm.isLegacy },
          charged: { name: row.cm.name, limited: !!row.cm.isLegacy },
          source: capture.url,
        });
        count++;
      }
    }
    expect(count).toBe(bundle.movesAudit.qualifyingRoles);
    expect(bundle.movesAudit.unmapped).toEqual([]);
    expect(data.species.flatMap((p) => p.raid.flatMap((r) => r.moveSets ?? []))).toHaveLength(
      count,
    );
    const rillaboom = data.species.find((p) => p.id === 'rillaboom')!;
    expect(rillaboom.raid[0].moveSets![0]).toMatchObject({
      tier: 'S',
      charged: { name: 'Frenzy Plant', limited: true },
    });
  });
  it('adds raid-only Shadows with the correct regular-form stats and gender', () => {
    for (const id of ['overqwil', 'mr_rime', 'sirfetchd', 'thundurus_therian']) {
      const base = data.species.find((p) => p.id === id)!;
      const shadow = data.species.find((p) => p.id === id + '_shadow')!;
      expect(shadow.shadow).toBe(true);
      expect(shadow.baseStats).toEqual(base.baseStats);
      expect(shadow.gender?.allowed).toEqual(base.gender?.allowed);
      expect(shadow.eligible).toEqual({ GL: false, UL: false, ML: false });
      expect(shadow.raid.some((r) => r.moveSets?.length)).toBe(true);
    }
  });
  it('extracts complete embedded tables beyond page one and rejects truncated qualifying tiers', () => {
    const attacker = { id: 812, name: 'Rillaboom', type1: 'grass', type2: 'none', form: null };
    const row = {
      attacker,
      qm: { id: 215, name: 'Razor Leaf', type: 'grass' },
      cm: { id: 296, name: 'Frenzy Plant', type: 'grass', isLegacy: 1 },
    };
    const html = (rows: unknown[]) =>
      `<script>self.__next_f.push(${JSON.stringify([1, '1:' + JSON.stringify(['$', null, null, { allowedType: 'grass', initialData: { attackers: rows } }]) + '\n'])})</script>`;
    const rows = [
      { ...row, order: 1, tier: 'SS' },
      { ...row, order: 60, tier: 'A' },
      { ...row, order: 100, tier: 'B' },
    ];
    expect(extractTypeRankings(html(rows), 'grass')).toHaveLength(3);
    expect(() => extractTypeRankings(html(rows.slice(0, 2)), 'grass')).toThrow('Incomplete');
    expect(() => extractTypeRankings('<h1>New schema</h1>', 'grass')).toThrow('not found');
    expect(
      matchRaidForm({ ...rows[0], attacker: { ...attacker, form: 'Shadow' } }, data.species, {}),
    ).toBeUndefined();
  });
});
