import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import pointer from '../src/data/current.json';
import type { Catalog } from '../src/types';
// @ts-expect-error Source extraction runs in Node, outside browser TypeScript.
import { extractPokemonMoves } from '../scripts/moves-lib.mjs';
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
    expect(chandelure.raid[0].moveSets?.map((r) => r.type).sort()).toEqual(['fire', 'ghost']);
    expect(chandelure.raid[0].moves).toContain('ghost: Hex + Shadow Ball');
    expect(chandelure.raid[0].source).toBe('https://db.pokemongohub.net/pokemon/609');
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
