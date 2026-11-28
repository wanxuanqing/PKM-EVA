import type { AppraisalReading } from './appraisalTypes';
import type { IVs, Species } from '../types';
import { statsAt, validIVs } from './calculator';
import { normalize, searchSpecies } from './search';

export type SpeciesMatchResult = {
  best: Species | null;
  candidates: Species[];
};

export type IVSuggestion = {
  ivs: IVs;
  level: number;
  hp: number;
  hpMatched: boolean;
  manhattanDelta: number;
  changes: string[];
};

export type VerificationResult = {
  status: 'verified' | 'mismatch' | 'unverified';
  cp: number | null;
  hp: number | null;
  inferredLevel: number | null;
  matchedLevels: number[];
  hpMatched: boolean;
  reason?: string;
  suggestions: IVSuggestion[];
};

const ALL_HALF_LEVELS: readonly number[] = Array.from({ length: 101 }, (_, i) => 1 + i * 0.5);
const STAT_LABELS = ['Atk', 'Def', 'HP'] as const;

function baseNameKey(name: string): string {
  return normalize(name.replace(/\([^)]*\)/g, ' '));
}

function hintsMentionTemporary(speciesName: string, formHints: string[]): boolean {
  const combined = normalize([speciesName, ...formHints].join(' '));
  return /\b(mega|primal)\b/.test(combined);
}

function candidateMatchesHint(species: Species, normalizedHint: string): boolean {
  if (!normalizedHint) return false;
  const hay = normalize([species.name, species.id, ...species.aliases].join(' '));
  const tokens = normalizedHint.split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => hay.includes(t));
}

export function matchAppraisalSpecies(
  speciesList: Species[],
  reading: Pick<AppraisalReading, 'speciesName' | 'formHints' | 'isShadow' | 'gender'>,
): SpeciesMatchResult {
  const rawName = reading.speciesName?.trim();
  if (!rawName) return { best: null, candidates: [] };

  const formHints = (reading.formHints ?? []).map((h) => h.trim()).filter(Boolean);
  const normalizedHints = formHints.map(normalize).filter(Boolean);
  const nonShadowHints = normalizedHints.filter((h) => h !== 'shadow');
  const shadowRequested =
    reading.isShadow ||
    normalizedHints.some((h) => /\bshadow\b/.test(h)) ||
    /\bshadow\b/i.test(rawName);
  const tempHinted = hintsMentionTemporary(rawName, formHints);
  const cleanedName = rawName.replace(/\bshadow\b/gi, '').trim() || rawName;
  const targetBase = baseNameKey(cleanedName);

  const queries = new Set<string>([
    cleanedName,
    rawName,
    ...(nonShadowHints.length ? [`${cleanedName} ${nonShadowHints.join(' ')}`] : []),
    ...(shadowRequested ? [`${cleanedName} shadow`] : []),
  ]);

  const pool = new Map<string, Species>();
  for (const q of queries) {
    for (const hit of searchSpecies(speciesList, q, 40)) {
      pool.set(hit.id, hit);
    }
  }

  // Pull in sibling forms for the top matched Pokédex numbers so form-switcher pills
  // include Shadow / regional / alternate forms even if the query matched only one variant.
  const matchedDexes = new Set<number>();
  for (const hit of pool.values()) {
    if (baseNameKey(hit.name) === targetBase) matchedDexes.add(hit.dex);
  }
  if (!matchedDexes.size) {
    const first = pool.values().next().value;
    if (first) matchedDexes.add(first.dex);
  }
  for (const p of speciesList) {
    if (matchedDexes.has(p.dex)) pool.set(p.id, p);
  }

  if (!pool.size) return { best: null, candidates: [] };

  const scored = [...pool.values()].map((p) => {
    let score = 0;
    const pBase = baseNameKey(p.name);
    const pNorm = normalize(p.name);
    const qNorm = normalize(cleanedName);

    if (pBase === targetBase) score += 100;
    else if (pNorm === qNorm) score += 95;
    else if (pBase.startsWith(targetBase) || targetBase.startsWith(pBase)) score += 45;
    else if (pNorm.includes(qNorm)) score += 25;

    // Shadow matching
    if (shadowRequested) {
      score += p.shadow ? 60 : -45;
    } else {
      score += p.shadow ? -55 : 25;
    }

    // Temporary (Mega / Primal) avoidance unless explicitly hinted
    if (tempHinted) {
      score += p.temporary ? 50 : -15;
    } else if (p.temporary) {
      score -= 80;
    }

    // Form hint matching
    for (const hint of nonShadowHints) {
      if (candidateMatchesHint(p, hint)) score += 45;
      else score -= 12;
    }

    // If no form hints were given, prefer the standard base form (or its direct _shadow form)
    const idWithoutShadow = p.id.replace(/_shadow$/, '');
    if (!nonShadowHints.length) {
      if (!idWithoutShadow.includes('_')) score += 20;
      else score -= 8;
    }

    // Respect explicit gender on gender-distinct battle forms (e.g., Meowstic, Oinkologne, Nidoran)
    if (reading.gender === 'male' || reading.gender === 'female') {
      if (p.gender?.fixed === reading.gender) score += 18;
      else if (p.gender?.fixed && p.gender.fixed !== reading.gender) score -= 22;
    }

    return { species: p, score };
  });

  scored.sort((a, b) => b.score - a.score || a.species.name.localeCompare(b.species.name));

  // Keep best match + relevant form candidates (same dex or high-scoring alternatives)
  const best = scored[0]?.species ?? null;
  const candidates = scored
    .filter((item, idx) => idx === 0 || (best && item.species.dex === best.dex) || item.score >= 80)
    .slice(0, 8)
    .map((item) => item.species);

  return { best, candidates };
}

function parseUncertainStatIndices(uncertainFields: string[] = []): Set<number> {
  const set = new Set<number>();
  for (const field of uncertainFields) {
    const f = field.toLowerCase();
    if (f.includes('attack') || f === 'atk') set.add(0);
    if (f.includes('defense') || f === 'def') set.add(1);
    if (f === 'hpiv' || f === 'hp_iv' || f.includes('hp iv') || f.includes('stamina')) set.add(2);
  }
  return set;
}

function pickPreferredLevel(
  levels: { level: number; hp: number }[],
  minLevel: number,
  targetHp: number | null,
): { level: number; hp: number; hpMatched: boolean } {
  const ranked = [...levels].sort((a, b) => {
    const aHp = targetHp !== null && a.hp === targetHp ? 1 : 0;
    const bHp = targetHp !== null && b.hp === targetHp ? 1 : 0;
    if (bHp !== aHp) return bHp - aHp;
    const aWhole = Number.isInteger(a.level) ? 1 : 0;
    const bWhole = Number.isInteger(b.level) ? 1 : 0;
    if (bWhole !== aWhole) return bWhole - aWhole;
    const aMin = a.level >= minLevel ? 1 : 0;
    const bMin = b.level >= minLevel ? 1 : 0;
    if (bMin !== aMin) return bMin - aMin;
    return a.level - b.level;
  });
  const chosen = ranked[0];
  return {
    level: chosen.level,
    hp: chosen.hp,
    hpMatched: targetHp !== null && chosen.hp === targetHp,
  };
}

function findMatchingLevels(
  species: Species,
  ivs: IVs,
  cp: number,
  cpm: readonly number[],
): { level: number; hp: number }[] {
  if (!species.baseStats) return [];
  const matches: { level: number; hp: number }[] = [];
  for (const level of ALL_HALF_LEVELS) {
    const stats = statsAt(species.baseStats, ivs, level, cpm);
    if (stats.cp === cp) matches.push({ level, hp: stats.hp });
  }
  return matches;
}

function searchNearbySpreads(
  species: Species,
  originIvs: IVs,
  cp: number,
  targetHp: number | null,
  cpm: readonly number[],
  uncertainIndices: Set<number>,
  radius: number,
): IVSuggestion[] {
  type ScoredSuggestion = IVSuggestion & {
    nonUncertainChanged: number;
    uncertainChanged: number;
    isWholeLevel: boolean;
  };
  const found: ScoredSuggestion[] = [];

  for (let da = -radius; da <= radius; da++) {
    const a = originIvs[0] + da;
    if (a < 0 || a > 15) continue;
    for (let dd = -radius; dd <= radius; dd++) {
      const d = originIvs[1] + dd;
      if (d < 0 || d > 15) continue;
      for (let dh = -radius; dh <= radius; dh++) {
        if (da === 0 && dd === 0 && dh === 0) continue;
        const h = originIvs[2] + dh;
        if (h < 0 || h > 15) continue;

        const candidateIvs: IVs = [a, d, h];
        const matches = findMatchingLevels(species, candidateIvs, cp, cpm);
        if (!matches.length) continue;

        const best = pickPreferredLevel(matches, species.minLevel, targetHp);
        const deltas = [da, dd, dh] as const;
        const changes: string[] = [];
        let nonUncertainChanged = 0;
        let uncertainChanged = 0;

        for (let i = 0; i < 3; i++) {
          if (deltas[i] === 0) continue;
          const sign = deltas[i] > 0 ? '+' : '';
          changes.push(`${STAT_LABELS[i]} ${sign}${deltas[i]}`);
          if (uncertainIndices.has(i)) uncertainChanged++;
          else nonUncertainChanged++;
        }

        found.push({
          ivs: candidateIvs,
          level: best.level,
          hp: best.hp,
          hpMatched: best.hpMatched,
          manhattanDelta: Math.abs(da) + Math.abs(dd) + Math.abs(dh),
          changes,
          nonUncertainChanged,
          uncertainChanged,
          isWholeLevel: Number.isInteger(best.level),
        });
      }
    }
  }

  found.sort(
    (a, b) =>
      Number(b.hpMatched) - Number(a.hpMatched) ||
      a.manhattanDelta - b.manhattanDelta ||
      a.nonUncertainChanged - b.nonUncertainChanged ||
      b.uncertainChanged - a.uncertainChanged ||
      Number(b.isWholeLevel) - Number(a.isWholeLevel) ||
      a.level - b.level ||
      a.ivs[0] - b.ivs[0] ||
      a.ivs[1] - b.ivs[1] ||
      a.ivs[2] - b.ivs[2],
  );

  return found
    .slice(0, 6)
    .map(({ nonUncertainChanged: _, uncertainChanged: __, isWholeLevel: ___, ...rest }) => rest);
}

export function verifyAppraisalStats(
  species: Species | null,
  ivs: IVs | null,
  cp: number | null,
  hp: number | null,
  cpm: readonly number[],
  uncertainFields: string[] = [],
): VerificationResult {
  const validHp = hp !== null && Number.isInteger(hp) && hp >= 10 ? hp : null;

  if (!species || !species.baseStats) {
    return {
      status: 'unverified',
      cp,
      hp: validHp,
      inferredLevel: null,
      matchedLevels: [],
      hpMatched: false,
      reason: 'Base stats unavailable for this form.',
      suggestions: [],
    };
  }
  if (!ivs || !validIVs(ivs)) {
    return {
      status: 'unverified',
      cp,
      hp: validHp,
      inferredLevel: null,
      matchedLevels: [],
      hpMatched: false,
      reason: 'IV bars were not completely readable.',
      suggestions: [],
    };
  }
  if (cp === null || !Number.isInteger(cp) || cp < 10) {
    return {
      status: 'unverified',
      cp: null,
      hp: validHp,
      inferredLevel: null,
      matchedLevels: [],
      hpMatched: false,
      reason: 'CP was not visible in this frame.',
      suggestions: [],
    };
  }

  const exactMatches = findMatchingLevels(species, ivs, cp, cpm);
  const exactHpMatches =
    validHp !== null ? exactMatches.filter((m) => m.hp === validHp) : exactMatches;

  if (exactHpMatches.length > 0) {
    const preferred = pickPreferredLevel(exactHpMatches, species.minLevel, validHp);
    return {
      status: 'verified',
      cp,
      hp: validHp,
      inferredLevel: preferred.level,
      matchedLevels: exactHpMatches.map((m) => m.level),
      hpMatched: validHp !== null,
      suggestions: [],
    };
  }

  const uncertainIndices = parseUncertainStatIndices(uncertainFields);
  let suggestions = searchNearbySpreads(species, ivs, cp, validHp, cpm, uncertainIndices, 1);
  if (!suggestions.length) {
    suggestions = searchNearbySpreads(species, ivs, cp, validHp, cpm, uncertainIndices, 2);
  }

  const reason =
    exactMatches.length > 0 && validHp !== null
      ? `CP ${cp} matched at Lv ${pickPreferredLevel(exactMatches, species.minLevel, null).level}, but HP ${validHp} did not match these IVs.`
      : `CP ${cp} is not possible for ${species.name} with ${ivs.join('/')} IVs at any legal half-level (1–51).`;

  return {
    status: 'mismatch',
    cp,
    hp: validHp,
    inferredLevel: null,
    matchedLevels: [],
    hpMatched: false,
    reason,
    suggestions,
  };
}
