import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pointer from '../src/data/current.json';
import type { Catalog, IVs } from '../src/types';
import { statsAt } from '../src/lib/calculator';
import { matchAppraisalSpecies, verifyAppraisalStats } from '../src/lib/appraisalVerify';
import {
  computeResizeDimensions,
  extractUiBandsFromRgba,
  selectSettledNovelIndices,
  signatureDifference,
  type BandSignature,
} from '../src/lib/frameExtract';
import { handleScanAppraisal, runWithModelFallback, validateScanFrames } from '../server';

const data = JSON.parse(readFileSync(`public${pointer.file}`, 'utf8')) as Catalog;
const byId = new Map(data.species.map((p) => [p.id, p]));

describe('matchAppraisalSpecies', () => {
  it('matches regular and shadow forms while avoiding temporary Megas unless hinted', () => {
    const regular = matchAppraisalSpecies(data.species, {
      speciesName: 'Charizard',
      formHints: [],
      isShadow: false,
      gender: 'unknown',
    });
    expect(regular.best?.id).toBe('charizard');
    expect(regular.candidates.length).toBeGreaterThan(1);

    const shadow = matchAppraisalSpecies(data.species, {
      speciesName: 'Duskull',
      formHints: [],
      isShadow: true,
      gender: 'unknown',
    });
    expect(shadow.best?.id).toBe('duskull_shadow');

    const megaY = matchAppraisalSpecies(data.species, {
      speciesName: 'Charizard',
      formHints: ['Mega Y'],
      isShadow: false,
      gender: 'unknown',
    });
    expect(megaY.best?.id).toBe('charizard_mega_y');
  });

  it('respects regional, origin, and gender form hints', () => {
    expect(
      matchAppraisalSpecies(data.species, {
        speciesName: 'Marowak',
        formHints: ['Alola'],
        isShadow: false,
        gender: 'unknown',
      }).best?.id,
    ).toBe('marowak_alolan');

    expect(
      matchAppraisalSpecies(data.species, {
        speciesName: 'Giratina',
        formHints: ['Origin'],
        isShadow: false,
        gender: 'unknown',
      }).best?.id,
    ).toBe('giratina_origin');

    expect(
      matchAppraisalSpecies(data.species, {
        speciesName: 'Oinkologne',
        formHints: [],
        isShadow: false,
        gender: 'female',
      }).best?.id,
    ).toBe('oinkologne_female');
  });
});

describe('verifyAppraisalStats', () => {
  it('verifies exact CP and HP across legal half-levels and prefers whole levels', () => {
    const dusclops = byId.get('dusclops')!;
    const ivs: IVs = [1, 12, 13];
    const at25 = statsAt(dusclops.baseStats!, ivs, 25, data.cpm);
    const verified = verifyAppraisalStats(dusclops, ivs, at25.cp, at25.hp, data.cpm);
    expect(verified.status).toBe('verified');
    expect(verified.inferredLevel).toBe(25);
    expect(verified.hpMatched).toBe(true);
    expect(verified.suggestions).toEqual([]);

    const at44Half = statsAt(dusclops.baseStats!, ivs, 44.5, data.cpm);
    const halfVerified = verifyAppraisalStats(dusclops, ivs, at44Half.cp, at44Half.hp, data.cpm);
    expect(halfVerified.status).toBe('verified');
    expect(halfVerified.inferredLevel).toBe(44.5);
  });

  it('suggests nearby ±1 IV fixes ranked by HP match, Manhattan delta, and uncertainFields', () => {
    const mewtwo = byId.get('mewtwo')!;
    const trueIvs: IVs = [15, 14, 13];
    const trueStats = statsAt(mewtwo.baseStats!, trueIvs, 40, data.cpm);
    // Simulate Gemini misreading Defense IV off by 1 (15/13/13) and flagging defenseIv uncertain
    const offByOne: IVs = [15, 13, 13];
    const result = verifyAppraisalStats(mewtwo, offByOne, trueStats.cp, trueStats.hp, data.cpm, [
      'defenseIv',
    ]);
    expect(result.status).toBe('mismatch');
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeLessThanOrEqual(6);
    expect(result.suggestions[0].ivs).toEqual(trueIvs);
    expect(result.suggestions[0].level).toBe(40);
    expect(result.suggestions[0].hpMatched).toBe(true);
    expect(result.suggestions[0].changes).toEqual(['Def +1']);
  });

  it('expands search to ±2 when no ±1 spread matches the visible CP', () => {
    const mewtwo = byId.get('mewtwo')!;
    const trueIvs: IVs = [15, 15, 15];
    // At max legal level 51, no ±1 spread from [13, 15, 15] can reach the hundo CP.
    const trueStats = statsAt(mewtwo.baseStats!, trueIvs, 51, data.cpm);
    const offByTwo: IVs = [13, 15, 15];
    const result = verifyAppraisalStats(mewtwo, offByTwo, trueStats.cp, trueStats.hp, data.cpm, [
      'attackIv',
    ]);
    expect(result.status).toBe('mismatch');
    expect(result.suggestions.some((s) => s.ivs.join('/') === '15/15/15' && s.level === 51)).toBe(
      true,
    );
  });

  it('marks missing CP as unverified without fabricating suggestions', () => {
    const duskull = byId.get('duskull')!;
    const result = verifyAppraisalStats(duskull, [1, 12, 13], null, null, data.cpm);
    expect(result.status).toBe('unverified');
    expect(result.inferredLevel).toBeNull();
    expect(result.suggestions).toEqual([]);
  });
});

describe('frameExtract helpers', () => {
  it('crops the top 4% OS status bar and resizes within 1280px max dimension', () => {
    const cropped = computeResizeDimensions(1170, 2532, true);
    expect(cropped.cropY).toBe(Math.round(2532 * 0.04));
    expect(cropped.dstH).toBe(1280);
    expect(cropped.dstW).toBeLessThan(cropped.dstH);

    const uncropped = computeResizeDimensions(600, 1000, false);
    expect(uncropped.cropY).toBe(0);
    expect(uncropped.dstW).toBe(600);
    expect(uncropped.dstH).toBe(1000);
  });

  it('ignores animated center pixels while detecting top/bottom UI band changes', () => {
    const w = 10;
    const h = 100;
    const makeFrame = (topVal: number, midVal: number, botVal: number) => {
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        const v = y < 20 ? topVal : y < 62 ? midVal : botVal;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          rgba[i] = v;
          rgba[i + 1] = v;
          rgba[i + 2] = v;
          rgba[i + 3] = 255;
        }
      }
      return extractUiBandsFromRgba(rgba, w, h);
    };
    const idle1 = makeFrame(200, 40, 240);
    const idle2 = makeFrame(200, 220, 240); // center 3D model animated wildly
    const nextPokemon = makeFrame(120, 40, 180);

    expect(signatureDifference(idle1, idle2)).toBe(0);
    expect(signatureDifference(idle1, nextPokemon)).toBeGreaterThan(0.2);
  });

  it('selects dwell-end settled novel keyframes, skips mid-swipe frames, and caps at 500', () => {
    const sig = (v: number): BandSignature => ({
      top: new Uint8Array(20).fill(v),
      bottom: new Uint8Array(20).fill(v),
      hasAppraisalCard: true,
    });
    // Settled A (0,1,2 -> picks dwell-end 2), mid-swipe (3), settled B (4,5 -> picks dwell-end 5)
    const sequence = [sig(20), sig(21), sig(20), sig(90), sig(180), sig(181)];
    const selected = selectSettledNovelIndices(sequence, 'balanced');
    expect(selected).toEqual([2, 5]);

    // Cap at 500 even with 560 distinct settled pairs
    const many: BandSignature[] = [];
    for (let i = 0; i < 560; i++) {
      const v = (i * 53) % 255;
      many.push(sig(v), sig(v));
    }
    const capped = selectSettledNovelIndices(many, 'more');
    expect(capped.length).toBe(500);
  });
});

describe('server /api/scan-appraisal endpoint', () => {
  it('validates frame payloads and rejects more than 6 frames', () => {
    expect(validateScanFrames({ frames: [] }).error).toContain('at least one');
    const tooMany = Array.from({ length: 7 }, (_, i) => ({
      id: `f${i}`,
      imageBase64: 'AAAAAAAAAAAAAAAAAAAA',
      mimeType: 'image/jpeg',
    }));
    expect(validateScanFrames({ frames: tooMany }).error).toContain('maximum 6');
    expect(
      validateScanFrames({
        frames: [{ id: 'f1', imageBase64: 'AAAAAAAAAAAAAAAAAAAA', mimeType: 'video/mp4' }],
      }).error,
    ).toContain('unsupported mimeType');
  });

  it('propagates real API errors cleanly and returns structured readings when valid', async () => {
    const mockScanner = async (frames: { id: string }[]) => {
      if (frames[0].id === 'fail') {
        const err = new Error('Upstream quota exceeded') as Error & { status?: number };
        err.status = 429;
        throw err;
      }
      return frames.map((f) => ({
        id: f.id,
        readable: true,
        reason: null,
        speciesName: 'Duskull',
        formHints: [],
        attackIv: 1,
        defenseIv: 12,
        hpIv: 13,
        cp: 500,
        hp: 60,
        gender: 'male' as const,
        isShadow: false,
        isShiny: false,
        isCostume: false,
        isTraded: false,
        isMaxBattle: false,
        confidence: 'high' as const,
        uncertainFields: [],
      }));
    };

    const okRes = await handleScanAppraisal(
      { frames: [{ id: 'f1', imageBase64: 'AAAAAAAAAAAAAAAAAAAA', mimeType: 'image/jpeg' }] },
      mockScanner,
    );
    expect(okRes.status).toBe(200);
    expect(okRes.body).toEqual({
      results: [expect.objectContaining({ id: 'f1', speciesName: 'Duskull' })],
    });

    const errRes = await handleScanAppraisal(
      { frames: [{ id: 'fail', imageBase64: 'AAAAAAAAAAAAAAAAAAAA', mimeType: 'image/jpeg' }] },
      mockScanner,
    );
    expect(errRes.status).toBe(429);
    expect(errRes.body).toEqual({ error: 'Upstream quota exceeded' });

    const jsonErrRes = await handleScanAppraisal(
      { frames: [{ id: 'f1', imageBase64: 'AAAAAAAAAAAAAAAAAAAA', mimeType: 'image/jpeg' }] },
      async () => {
        throw new Error(
          JSON.stringify({
            error: {
              code: 503,
              message: 'This model is currently experiencing high demand.',
              status: 'UNAVAILABLE',
            },
          }),
        );
      },
    );
    expect(jsonErrRes.status).toBe(503);
    expect(jsonErrRes.body).toEqual({
      error: 'This model is currently experiencing high demand.',
    });

    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const missingKey = await handleScanAppraisal({
        frames: [{ id: 'f1', imageBase64: 'AAAAAAAAAAAAAAAAAAAA', mimeType: 'image/jpeg' }],
      });
      expect(missingKey.status).toBe(503);
      expect(missingKey.body).toEqual({
        error: 'GEMINI_API_KEY is not configured on the server.',
      });
    } finally {
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    }
  });

  it('falls back from gemini-4-hydrogen to gemini-3.8-flash on 503 but fails fast on auth errors', async () => {
    const calls: string[] = [];
    const fallback = await runWithModelFallback(
      ['gemini-4-hydrogen', 'gemini-3.8-flash'],
      async (model) => {
        calls.push(model);
        if (model === 'gemini-4-hydrogen') {
          throw new Error(
            JSON.stringify({
              error: { code: 503, message: 'High demand', status: 'UNAVAILABLE' },
            }),
          );
        }
        return 'ok-from-backup';
      },
      { retriesPerModel: 1, delayMs: 0 },
    );
    expect(fallback).toEqual({ result: 'ok-from-backup', modelUsed: 'gemini-3.8-flash' });
    expect(calls).toEqual(['gemini-4-hydrogen', 'gemini-4-hydrogen', 'gemini-3.8-flash']);

    const authCalls: string[] = [];
    await expect(
      runWithModelFallback(
        ['gemini-4-hydrogen', 'gemini-3.8-flash'],
        async (model) => {
          authCalls.push(model);
          const err = new Error('API key not valid') as Error & { status?: number };
          err.status = 403;
          throw err;
        },
        { retriesPerModel: 1, delayMs: 0 },
      ),
    ).rejects.toThrow('API key not valid');
    expect(authCalls).toEqual(['gemini-4-hydrogen']);
  });
});
