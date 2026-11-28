import type { Catalog, CollectionFlags, IVResult, IVs, Option, Settings, Species } from '../types';
import { overallIV, validIVs, validLevel } from './calculator';
import {
  copyGender,
  optionsFor,
  reachable,
  recommendation,
  type Recommendation,
} from './assessment';
import { verifyAppraisalStats, type IVSuggestion } from './appraisalVerify';
import { gymTier } from './gym';

export type TriageStatus = 'undecided' | 'keep' | 'trade' | 'transfer';

export type LibraryEntry = {
  id: string;
  speciesId: string;
  ivs: IVs;
  settings: Settings;
  flags: CollectionFlags;
  date: string;
  version: string;
  verdict: string;
  // Optional scanner & triage metadata (no thumbnails stored)
  cp?: number | null;
  hp?: number | null;
  cpStatus?: 'verified' | 'mismatch' | 'unverified';
  cpReason?: string;
  suggestions?: IVSuggestion[];
  candidateIds?: string[];
  uncertainFields?: string[];
  triage?: TriageStatus;
  note?: string;
  sourceName?: string;
  timestampSec?: number;
};

export type RoleSummary = {
  roleKey: string;
  role: Option['role'];
  targetId: string;
  targetName: string;
  label: string;
  meetsPreference: boolean;
  blocked: boolean;
  sortMetric: number;
};

export type EvaluatedLibraryEntry = {
  entryId: string;
  species: Species | null;
  options: Option[];
  verdict: Recommendation | null;
  overall: number;
  roles: RoleSummary[];
  ready: boolean;
  protectedCopy: boolean;
};

export type OutrankedNote = {
  roleKey: string;
  targetName: string;
  role: Option['role'];
  winnerId: string;
  winnerLabel: string;
  selfMetric: string;
  winnerMetric: string;
};

export type LibraryComparison = {
  leaderRoles: RoleSummary[];
  outrankedBy: OutrankedNote[];
  isFullyOutranked: boolean;
};

export const MAX_LIBRARY_ENTRIES = 2500;

export function isProtectedCopy(entry: LibraryEntry): boolean {
  const f = entry.flags;
  return (
    f.shiny ||
    f.costume ||
    f.rare ||
    f.sentimental ||
    f.maxBattle ||
    entry.ivs.every((v) => v === 15) ||
    entry.ivs.every((v) => v === 0)
  );
}

export function entryDedupeKey(
  entry: Pick<LibraryEntry, 'speciesId' | 'ivs' | 'cp' | 'hp' | 'flags'>,
): string {
  return [
    entry.speciesId,
    entry.ivs.join('/'),
    entry.cp ?? '',
    entry.hp ?? '',
    entry.flags.shiny ? 'S' : '',
    entry.flags.costume ? 'C' : '',
    entry.flags.maxBattle ? 'M' : '',
    entry.flags.alreadyTraded ? 'T' : '',
  ].join('|');
}

export function sanitizeLibraryEntries(raw: unknown): LibraryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (s): s is LibraryEntry =>
        !!s &&
        typeof s === 'object' &&
        typeof (s as LibraryEntry).id === 'string' &&
        typeof (s as LibraryEntry).speciesId === 'string' &&
        Array.isArray((s as LibraryEntry).ivs) &&
        validIVs((s as LibraryEntry).ivs) &&
        !!(s as LibraryEntry).settings &&
        !!(s as LibraryEntry).flags,
    )
    .slice(0, MAX_LIBRARY_ENTRIES);
}

export function buildEntryOptions(
  entry: LibraryEntry,
  byId: Map<string, Species>,
  data: Catalog,
): { species: Species | null; options: Option[] } {
  const species = byId.get(entry.speciesId) ?? null;
  if (!species) return { species: null, options: [] };
  const effectiveSettings: Settings = {
    ...entry.settings,
    gender: copyGender(species, entry.settings.gender),
  };
  const targets = reachable(species, byId, effectiveSettings, entry.ivs);
  const options = optionsFor(targets, data.maxBattles, data.gymDefense);
  return { species, options };
}

function summarizeOption(
  option: Option,
  entry: LibraryEntry,
  data: Catalog,
  overall: number,
): RoleSummary {
  const r = option.result;
  const roleKey = `${option.species.id}:${option.role}`;
  if (option.role === 'GL' || option.role === 'UL') {
    const pct = r?.percentile ?? null;
    const blocked = option.conditional || !!r?.overCap || !!r?.aboveMax || (r ? !r.inPool : false);
    const meetsPreference = !blocked && pct !== null && pct > entry.settings.threshold;
    const label = `${option.species.name} ${option.role} #${option.ranking?.rank ?? '?'} · ${pct !== null ? `${pct.toFixed(1)}% (IV #${r?.rank})` : '—'}`;
    return {
      roleKey,
      role: option.role,
      targetId: option.species.id,
      targetName: option.species.name,
      label,
      meetsPreference,
      blocked,
      sortMetric: pct ?? -1,
    };
  }
  if (option.role === 'ML') {
    const blocked = option.conditional || !!r?.overCap || !!r?.aboveMax || (r ? !r.inPool : false);
    const meetsPreference = !blocked && overall > 90;
    const label = `${option.species.name} ML #${option.ranking?.rank ?? '?'} · ${overall.toFixed(1)}% IV`;
    return {
      roleKey,
      role: 'ML',
      targetId: option.species.id,
      targetName: option.species.name,
      label,
      meetsPreference,
      blocked,
      sortMetric: overall + (r?.percentile ?? 0) * 0.001,
    };
  }
  if (option.role === 'Raid') {
    const tiers = ['SS', 'S+', 'S', 'A+', 'A'];
    const bestSet = option.raid?.moveSets?.[0];
    const tierStr = tiers.filter((t) => option.raid?.moveSets?.some((m) => m.tier === t)).join('/');
    const blocked = option.conditional;
    const meetsPreference = !blocked && overall > 90;
    const label = `${option.species.name} Raid ${tierStr || bestSet?.tier || ''} (${option.raid?.types.slice(0, 2).join('/')})`;
    return {
      roleKey,
      role: 'Raid',
      targetId: option.species.id,
      targetName: option.species.name,
      label,
      meetsPreference,
      blocked,
      sortMetric: overall,
    };
  }
  if (option.role === 'Max') {
    const tiers = [
      ...new Set([...(option.max?.roles ?? []), ...(option.max?.support ?? [])].map((m) => m.tier)),
    ];
    const label = `${option.max?.name ?? option.species.name} Max ${tiers.join('/')}`;
    return {
      roleKey: option.key,
      role: 'Max',
      targetId: option.species.id,
      targetName: option.max?.name ?? option.species.name,
      label,
      meetsPreference: false,
      blocked: true,
      sortMetric: overall,
    };
  }
  const tier = gymTier(option.species, data.gymDefense) ?? 'A';
  return {
    roleKey,
    role: 'Gym',
    targetId: option.species.id,
    targetName: option.species.name,
    label: `${option.species.name} Gym ${tier}`,
    meetsPreference: !option.conditional,
    blocked: option.conditional,
    sortMetric: overall,
  };
}

export function evaluateLibraryEntry(
  entry: LibraryEntry,
  byId: Map<string, Species>,
  data: Catalog,
  calculations: Record<string, IVResult> | undefined,
  ready: boolean,
): EvaluatedLibraryEntry {
  const { species, options: baseOptions } = buildEntryOptions(entry, byId, data);
  const overall = overallIV(entry.ivs);
  const protectedCopy = isProtectedCopy(entry);
  if (!species) {
    return {
      entryId: entry.id,
      species: null,
      options: [],
      verdict: null,
      overall,
      roles: [],
      ready: true,
      protectedCopy,
    };
  }
  const options = baseOptions.map((o) => ({
    ...o,
    result: calculations?.[o.key],
  }));
  const effectiveSettings: Settings = {
    ...entry.settings,
    gender: copyGender(species, entry.settings.gender),
  };
  const verdict = recommendation(
    species,
    entry.ivs,
    options,
    entry.flags,
    effectiveSettings,
    ready,
    data.gymDefense,
  );
  const roles = options.map((o) => summarizeOption(o, entry, data, overall));
  return {
    entryId: entry.id,
    species,
    options,
    verdict,
    overall,
    roles,
    ready,
    protectedCopy,
  };
}

/**
 * Deterministically compares copies across the single unified library by battle target role.
 * Never marks protected copies (Shiny/Costume/Shadow/Rare/Sentimental/Max/100%/0%/CP-mismatch)
 * as fully outranked transfer candidates.
 */
export function compareLibraryCopies(
  entries: LibraryEntry[],
  evaluated: Map<string, EvaluatedLibraryEntry>,
): Map<string, LibraryComparison> {
  const byEntry = new Map(entries.map((e) => [e.id, e]));
  const result = new Map<string, LibraryComparison>();
  for (const e of entries) {
    result.set(e.id, { leaderRoles: [], outrankedBy: [], isFullyOutranked: false });
  }

  // Group comparable battle roles (GL, UL, ML, Raid, Gym — excluding unconfirmed Max capability)
  type Contender = {
    entry: LibraryEntry;
    evalItem: EvaluatedLibraryEntry;
    role: RoleSummary;
  };
  const groups = new Map<string, Contender[]>();

  for (const entry of entries) {
    if (entry.cpStatus === 'mismatch') continue;
    const evalItem = evaluated.get(entry.id);
    if (!evalItem || !evalItem.ready) continue;
    for (const role of evalItem.roles) {
      if (role.role === 'Max' || role.blocked) continue;
      const list = groups.get(role.roleKey);
      if (list) list.push({ entry, evalItem, role });
      else groups.set(role.roleKey, [{ entry, evalItem, role }]);
    }
  }

  const formatMetric = (role: RoleSummary, entry: LibraryEntry) => {
    if (role.role === 'GL' || role.role === 'UL') return `${role.sortMetric.toFixed(1)}%`;
    return `${overallIV(entry.ivs).toFixed(1)}% (${entry.ivs.join('/')})`;
  };

  for (const [, contenders] of groups) {
    if (contenders.length < 2) continue;
    const sorted = [...contenders].sort(
      (a, b) =>
        b.role.sortMetric - a.role.sortMetric ||
        (b.entry.cp ?? 0) - (a.entry.cp ?? 0) ||
        a.entry.id.localeCompare(b.entry.id),
    );
    const best = sorted[0];
    const bestScore = best.role.sortMetric;
    const winnerLabel = `${best.evalItem.species?.name ?? best.entry.speciesId}${best.entry.cp ? ` CP ${best.entry.cp}` : ` (${best.entry.ivs.join('/')})`}`;

    for (const item of sorted) {
      const comp = result.get(item.entry.id)!;
      if (item.role.sortMetric >= bestScore - 1e-6) {
        comp.leaderRoles.push(item.role);
      } else {
        comp.outrankedBy.push({
          roleKey: item.role.roleKey,
          targetName: item.role.targetName,
          role: item.role.role,
          winnerId: best.entry.id,
          winnerLabel,
          selfMetric: formatMetric(item.role, item.entry),
          winnerMetric: formatMetric(best.role, best.entry),
        });
      }
    }
  }

  // Flag ordinary copies that are strictly outranked on every single qualifying non-Max role
  for (const [id, comp] of result) {
    const entry = byEntry.get(id);
    const evalItem = evaluated.get(id);
    if (!entry || !evalItem || !evalItem.ready) continue;
    const isShadow = evalItem.species?.shadow === true;
    const comparableRoles = evalItem.roles.filter((r) => r.role !== 'Max' && !r.blocked);
    comp.isFullyOutranked =
      !evalItem.protectedCopy &&
      !isShadow &&
      entry.cpStatus !== 'mismatch' &&
      comparableRoles.length > 0 &&
      comp.leaderRoles.length === 0 &&
      comp.outrankedBy.length >= comparableRoles.length;
  }

  return result;
}

export function revalidateEntryCp(
  entry: LibraryEntry,
  species: Species | null,
  cpm: readonly number[],
): LibraryEntry {
  if (entry.cp === undefined || entry.cp === null) return entry;
  const check = verifyAppraisalStats(
    species,
    entry.ivs,
    entry.cp,
    entry.hp ?? null,
    cpm,
    entry.uncertainFields ?? [],
  );
  return {
    ...entry,
    cpStatus: check.status,
    cpReason: check.reason,
    suggestions: check.suggestions,
    settings: {
      ...entry.settings,
      currentLevel: check.inferredLevel ?? entry.settings.currentLevel,
    },
  };
}

/**
 * Generates a safe Pokémon GO storage search string for locating transfer/trade candidates.
 * Always appends safety guardrails (!shiny&!shadow&!4*&!costume&!favorite) for transfer mode.
 */
export function buildPokemonGoSearchString(
  entries: LibraryEntry[],
  byId: Map<string, Species>,
  mode: 'transfer' | 'trade' = 'transfer',
): string {
  const clauses: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const species = byId.get(entry.speciesId);
    if (!species) continue;
    if (mode === 'transfer' && (isProtectedCopy(entry) || species.shadow)) continue;
    const clause = entry.cp && entry.cp >= 10 ? `${species.dex}&cp${entry.cp}` : `${species.dex}`;
    if (seen.has(clause)) continue;
    seen.add(clause);
    clauses.push(clause);
  }

  if (!clauses.length) return '';

  // Pokémon GO search syntax: & binds tighter than , in some cases; wrapping with safe exclusions
  // works cleanly when matching dex numbers & CPs.
  // Specifically: "<dex1,dex2>&cp<cp1>,cp<cp2>" or per-copy "cp123,cp456&dex1,dex2"
  const dexes = [
    ...new Set(entries.map((e) => byId.get(e.speciesId)?.dex).filter((d): d is number => !!d)),
  ].sort((a, b) => a - b);
  const cps = [
    ...new Set(
      entries
        .filter((e) => {
          const sp = byId.get(e.speciesId);
          return sp && (mode !== 'transfer' || (!isProtectedCopy(e) && !sp.shadow));
        })
        .map((e) => e.cp)
        .filter((cp): cp is number => typeof cp === 'number' && cp >= 10),
    ),
  ].sort((a, b) => a - b);

  const parts: string[] = [];
  if (dexes.length) parts.push(dexes.join(','));
  if (cps.length) parts.push(cps.map((cp) => `cp${cp}`).join(','));
  if (mode === 'transfer') {
    parts.push('!shiny', '!shadow', '!4*', '!costume', '!favorite');
  } else {
    parts.push('!shiny', '!shadow', '!4*', '!traded', '!favorite');
  }
  return parts.join('&');
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function exportLibraryCsv(
  entries: LibraryEntry[],
  evaluated: Map<string, EvaluatedLibraryEntry>,
  comparisons: Map<string, LibraryComparison>,
  byId: Map<string, Species>,
): string {
  const header = [
    'Species',
    'Form ID',
    'Dex #',
    'Attack IV',
    'Defense IV',
    'HP IV',
    'Overall IV %',
    'CP',
    'HP',
    'Level',
    'CP Status',
    'Verdict',
    'Triage',
    'Top Roles',
    'Box Standing',
    'Flags',
    'Saved Date',
  ];
  const rows = [header.join(',')];
  for (const entry of entries) {
    const species = byId.get(entry.speciesId);
    const evalItem = evaluated.get(entry.id);
    const comp = comparisons.get(entry.id);
    const flags: string[] = [];
    if (species?.shadow) flags.push('Shadow');
    if (entry.flags.shiny) flags.push('Shiny');
    if (entry.flags.costume) flags.push('Costume');
    if (entry.flags.maxBattle) flags.push('Max');
    if (entry.flags.alreadyTraded) flags.push('Traded');
    if (entry.flags.rare) flags.push('Rare');
    if (entry.flags.sentimental) flags.push('Sentimental');

    const standing = comp?.leaderRoles.length
      ? `Best in library: ${comp.leaderRoles.map((r) => `${r.targetName} ${r.role}`).join('; ')}`
      : comp?.outrankedBy.length
        ? `Outranked by ${comp.outrankedBy[0].winnerLabel} (${comp.outrankedBy[0].winnerMetric})`
        : '';

    rows.push(
      [
        species?.name ?? entry.speciesId,
        entry.speciesId,
        species?.dex ?? '',
        entry.ivs[0],
        entry.ivs[1],
        entry.ivs[2],
        overallIV(entry.ivs).toFixed(1),
        entry.cp ?? '',
        entry.hp ?? '',
        entry.settings.currentLevel ?? '',
        entry.cpStatus ?? '',
        evalItem?.verdict?.verdict ?? entry.verdict,
        entry.triage ?? 'undecided',
        (evalItem?.roles ?? [])
          .slice(0, 3)
          .map((r) => r.label)
          .join(' | '),
        standing,
        flags.join(' '),
        entry.date.slice(0, 10),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return rows.join('\n') + '\n';
}

export function exportLibraryJson(entries: LibraryEntry[]): string {
  return (
    JSON.stringify({ schema: 1, exportedAt: new Date().toISOString(), entries }, null, 2) + '\n'
  );
}

export function parseLibraryImportJson(rawText: string): LibraryEntry[] {
  const parsed = JSON.parse(rawText) as unknown;
  const list = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : null;
  if (!list) throw new Error('Invalid library JSON: expected an entries array.');
  const valid = sanitizeLibraryEntries(list).map((entry) => ({
    ...entry,
    settings: {
      maxLevel:
        validLevel(entry.settings.maxLevel ?? 0) && entry.settings.maxLevel <= 50
          ? entry.settings.maxLevel
          : 50,
      bestBuddy: entry.settings.bestBuddy === true,
      currentLevel:
        entry.settings.currentLevel !== undefined && validLevel(entry.settings.currentLevel)
          ? entry.settings.currentLevel
          : undefined,
      floor:
        Number.isInteger(entry.settings.floor) &&
        entry.settings.floor >= 0 &&
        entry.settings.floor <= 15
          ? entry.settings.floor
          : 0,
      threshold:
        typeof entry.settings.threshold === 'number' &&
        entry.settings.threshold >= 0 &&
        entry.settings.threshold <= 100
          ? entry.settings.threshold
          : 95,
      gender:
        entry.settings.gender === 'male' ||
        entry.settings.gender === 'female' ||
        entry.settings.gender === 'genderless'
          ? entry.settings.gender
          : ('unknown' as const),
      eventPaths: entry.settings.eventPaths === true,
    },
  }));
  if (!valid.length) throw new Error('No valid Pokémon library entries found in this file.');
  return valid;
}
