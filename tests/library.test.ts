import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pointer from '../src/data/current.json';
import type { Catalog, CollectionFlags, IVs, Settings } from '../src/types';
import { assessIVs, distribution } from '../src/lib/calculator';
import {
  buildEntryOptions,
  buildPokemonGoSearchString,
  compareLibraryCopies,
  entryDedupeKey,
  evaluateLibraryEntry,
  exportLibraryCsv,
  exportLibraryJson,
  parseLibraryImportJson,
  type LibraryEntry,
} from '../src/lib/library';
import {
  hasAppraisalOverlayFromRgba,
  selectSettledNovelIndices,
  type BandSignature,
} from '../src/lib/frameExtract';

const data = JSON.parse(readFileSync(`public${pointer.file}`, 'utf8')) as Catalog;
const byId = new Map(data.species.map((p) => [p.id, p]));

const baseSettings: Settings = {
  maxLevel: 50,
  bestBuddy: false,
  floor: 0,
  threshold: 95,
  gender: 'unknown',
  eventPaths: false,
};

const baseFlags: CollectionFlags = {
  shiny: false,
  costume: false,
  rare: false,
  sentimental: false,
  maxBattle: false,
  ordinaryExtra: false,
  alreadyTraded: false,
};

function makeEntry(
  id: string,
  speciesId: string,
  ivs: IVs,
  extra: Partial<LibraryEntry> = {},
): LibraryEntry {
  return {
    id,
    speciesId,
    ivs,
    settings: { ...baseSettings, ...(extra.settings ?? {}) },
    flags: { ...baseFlags, ...(extra.flags ?? {}) },
    date: '2026-11-27T00:00:00.000Z',
    version: data.version,
    verdict: 'Review',
    ...extra,
  };
}

function evalAll(entries: LibraryEntry[]) {
  const map = new Map<string, ReturnType<typeof evaluateLibraryEntry>>();
  for (const entry of entries) {
    const { options } = buildEntryOptions(entry, byId, data);
    const calcs: Record<string, ReturnType<typeof assessIVs>> = {};
    for (const o of options) {
      if (!['GL', 'UL', 'ML'].includes(o.role) || !o.species.baseStats) continue;
      const calc = {
        base: o.species.baseStats,
        league: o.role as 'GL' | 'UL' | 'ML',
        maxLevel: entry.settings.maxLevel,
        minLevel: o.species.minLevel,
        floor: entry.settings.floor,
        eligible: o.species.eligible[o.role as 'GL' | 'UL' | 'ML'],
        cpm: data.cpm,
      };
      calcs[o.key] = assessIVs(calc, entry.ivs, distribution(calc), entry.settings.currentLevel);
    }
    map.set(entry.id, evaluateLibraryEntry(entry, byId, data, calcs, true));
  }
  return map;
}

describe('video appraisal-card detection and dwell-end filtering', () => {
  it('distinguishes white appraisal card + orange/pink stat bars from dark storage screens', () => {
    const w = 20;
    const h = 100;
    const appraisal = new Uint8ClampedArray(w * h * 4);
    const darkGrid = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // Dark storage screen
        darkGrid[i] = 35;
        darkGrid[i + 1] = 55;
        darkGrid[i + 2] = 65;
        darkGrid[i + 3] = 255;

        // Appraisal card in lower band (white card + orange bar stripe at y=74..76)
        if (y >= 64 && y <= 92) {
          if (y >= 74 && y <= 76 && x >= 3 && x <= 14) {
            appraisal[i] = 238;
            appraisal[i + 1] = 148;
            appraisal[i + 2] = 48;
          } else {
            appraisal[i] = 248;
            appraisal[i + 1] = 248;
            appraisal[i + 2] = 248;
          }
        } else {
          appraisal[i] = 80;
          appraisal[i + 1] = 110;
          appraisal[i + 2] = 130;
        }
        appraisal[i + 3] = 255;
      }
    }
    expect(hasAppraisalOverlayFromRgba(appraisal, w, h)).toBe(true);
    expect(hasAppraisalOverlayFromRgba(darkGrid, w, h)).toBe(false);
  });

  it('skips non-appraisal dwell runs when appraisalOnly is enabled', () => {
    const sig = (v: number, hasAppraisalCard: boolean): BandSignature => ({
      top: new Uint8Array(20).fill(v),
      bottom: new Uint8Array(20).fill(v),
      hasAppraisalCard,
    });
    const seq = [sig(20, false), sig(20, false), sig(140, true), sig(140, true)];
    expect(selectSettledNovelIndices(seq, 'balanced', 100, { appraisalOnly: true })).toEqual([3]);
  });
});

describe('unified library cross-copy comparison, deduplication, and export', () => {
  it('ranks cross-copy leaders and flags only unprotected fully-outranked copies', () => {
    const bestDuskull = makeEntry('best', 'duskull', [1, 12, 13], {
      cp: 412,
      cpStatus: 'verified',
    });
    const weakDuskull = makeEntry('weak', 'duskull', [14, 1, 2], { cp: 389, cpStatus: 'verified' });
    const shinyWeak = makeEntry('shiny', 'duskull', [14, 1, 2], {
      cp: 390,
      cpStatus: 'verified',
      flags: { ...baseFlags, shiny: true },
    });
    const entries = [bestDuskull, weakDuskull, shinyWeak];
    const evaluated = evalAll(entries);
    const comparisons = compareLibraryCopies(entries, evaluated);

    expect(comparisons.get('best')!.leaderRoles.length).toBeGreaterThan(0);
    expect(comparisons.get('best')!.isFullyOutranked).toBe(false);

    expect(comparisons.get('weak')!.outrankedBy.length).toBeGreaterThan(0);
    expect(comparisons.get('weak')!.isFullyOutranked).toBe(true);

    // Shiny copy is protected and must never be marked fully outranked for transfer
    expect(comparisons.get('shiny')!.isFullyOutranked).toBe(false);
  });

  it('deduplicates identical scan signatures while distinguishing Shiny or different CP', () => {
    const a = makeEntry('1', 'duskull', [1, 12, 13], { cp: 412, hp: 60 });
    const b = makeEntry('2', 'duskull', [1, 12, 13], { cp: 412, hp: 60 });
    const c = makeEntry('3', 'duskull', [1, 12, 13], {
      cp: 412,
      hp: 60,
      flags: { ...baseFlags, shiny: true },
    });
    expect(entryDedupeKey(a)).toBe(entryDedupeKey(b));
    expect(entryDedupeKey(a)).not.toBe(entryDedupeKey(c));
  });

  it('generates safe Pokémon GO transfer search strings excluding protected copies', () => {
    const weak = makeEntry('1', 'duskull', [14, 1, 2], { cp: 389 });
    const shiny = makeEntry('2', 'duskull', [14, 1, 2], {
      cp: 400,
      flags: { ...baseFlags, shiny: true },
    });
    const shadow = makeEntry('3', 'duskull_shadow', [14, 1, 2], { cp: 401 });
    const query = buildPokemonGoSearchString([weak, shiny, shadow], byId, 'transfer');
    expect(query).toContain('355');
    expect(query).toContain('cp389');
    expect(query).not.toContain('cp400');
    expect(query).not.toContain('cp401');
    expect(query).toContain('!shiny&!shadow&!4*&!costume&!favorite');
  });

  it('round-trips JSON backup and exports CSV rows cleanly', () => {
    const entries = [makeEntry('e1', 'duskull', [1, 12, 13], { cp: 412, cpStatus: 'verified' })];
    const json = exportLibraryJson(entries);
    const parsed = parseLibraryImportJson(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].speciesId).toBe('duskull');
    expect(parsed[0].ivs).toEqual([1, 12, 13]);

    const evaluated = evalAll(entries);
    const comparisons = compareLibraryCopies(entries, evaluated);
    const csv = exportLibraryCsv(entries, evaluated, comparisons, byId);
    expect(csv).toContain('Species,Form ID,Dex #');
    expect(csv).toContain('Duskull,duskull,355,1,12,13');
  });
});
