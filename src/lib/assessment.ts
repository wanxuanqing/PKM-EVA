import type {
  Species,
  IVs,
  Settings,
  Reachable,
  Option,
  CollectionFlags,
  MaxBattleData,
} from '../types';
import { goodOverallIV, qualifies } from './calculator.ts';
import { gymTier } from './gym.ts';
import { goodMaxTier, usefulMaxEntries } from './maxPokemon.ts';
export const copyGender = (species: Species, gender: Settings['gender']): Settings['gender'] =>
  species.gender?.fixed ?? (gender === 'genderless' ? 'unknown' : gender);
function pathRequirements(notes: string[]): string[] {
  const genders = new Set<string>();
  return notes.flatMap((note) => {
    const match = note.trim().match(/^(male|female)\s+only[.!]?$/i);
    if (!match) return [note];
    const gender = match[1].toLowerCase();
    if (genders.has(gender)) return [];
    genders.add(gender);
    return [gender === 'male' ? 'Male only' : 'Female only'];
  });
}
export function reachable(
  start: Species,
  all: Map<string, Species>,
  settings: Settings,
  ivs: IVs,
): Reachable[] {
  const gender = copyGender(start, settings.gender);
  const queue: Reachable[] = [
    { species: start, path: [start.id], requirements: [], conditional: false },
  ];
  const seen = new Set<string>();
  const results: Reachable[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current.species.id)) continue;
    seen.add(current.species.id);
    results.push(current);
    for (const edge of current.species.evolutions) {
      const next = all.get(edge.to);
      if (!next || next.shadow !== start.shadow || (start.shadow && next.temporary)) continue;
      if (edge.eventOnly && !settings.eventPaths) continue;
      const requiredGender =
        edge.gender ??
        (next.gender?.fixed === 'male' || next.gender?.fixed === 'female'
          ? next.gender.fixed
          : undefined);
      if (requiredGender && gender !== 'unknown' && gender !== requiredGender) continue;
      if (edge.highestIV !== undefined && ivs[edge.highestIV] < Math.max(...ivs)) continue;
      queue.push({
        species: next,
        path: [...current.path, next.id],
        requirements: pathRequirements([
          ...current.requirements,
          ...edge.requirements,
          ...(requiredGender ? [`${requiredGender === 'male' ? 'Male' : 'Female'} only`] : []),
        ]),
        conditional:
          current.conditional ||
          !!edge.review ||
          !!edge.eventOnly ||
          !!edge.random ||
          (!!requiredGender && gender === 'unknown') ||
          (edge.highestIV !== undefined && ivs.filter((v) => v === Math.max(...ivs)).length > 1),
      });
    }
  }
  return results;
}
export function optionsFor(targets: Reachable[], maxBattles?: MaxBattleData): Option[] {
  const result: Option[] = [];
  for (const target of targets) {
    if (!target.species.shadow && !target.species.temporary) {
      for (const entry of usefulMaxEntries(maxBattles)) {
        if (entry.speciesId !== target.species.id) continue;
        // Evolution does not turn a Dynamax copy into a Gigantamax copy.
        if (entry.mode === 'Gigantamax' && target.path.length > 1) continue;
        const roles = entry.roles.filter((r) => goodMaxTier(r.tier));
        const support = entry.support?.filter((r) => goodMaxTier(r.tier));
        if (!roles.length && !support?.length) continue;
        result.push({
          ...target,
          role: 'Max',
          key: entry.id,
          max: { ...entry, roles, support },
          conditional: true,
          requirements: [
            ...target.requirements,
            entry.mode === 'Gigantamax'
              ? 'Requires this species as a Gigantamax-capable copy; evolving an ordinary or Dynamax copy does not grant Gigantamax.'
              : entry.mode === 'Dynamax'
                ? 'Requires a Dynamax-capable copy with the matching form. Ordinary copies do not gain Max capability through evolution.'
                : 'Confirm this copy meets the special Max Battle form and move requirements.',
            'Confirm move unlocks and Max Move upgrades before investing.',
          ],
        });
      }
    }
    if (gymTier(target.species))
      result.push({ ...target, role: 'Gym', key: `${target.species.id}:Gym` });
    for (const role of ['GL', 'UL', 'ML'] as const) {
      const ranking = target.species.rankings[role];
      if (qualifies(ranking?.rank) && target.species.eligible[role])
        result.push({ ...target, role, ranking, key: `${target.species.id}:${role}` });
    }
    target.species.raid.forEach((raid, i) => {
      if (raid.source === 'input-csv' || raid.tier === 'unverified') return;
      const moveSets = raid.moveSets?.filter(
        (r) => r.type.toLowerCase() !== 'normal' && ['SS', 'S+', 'S', 'A+', 'A'].includes(r.tier),
      );
      if (!moveSets?.length) return;
      result.push({
        ...target,
        role: 'Raid',
        raid: {
          ...raid,
          moveSets,
          types: moveSets.map((r) => r.type),
          moves: moveSets.map(
            (r) =>
              `${r.type}: ${r.fast.name}${r.fast.limited ? ' *' : ''} + ${r.charged.name}${r.charged.limited ? ' *' : ''}`,
          ),
        },
        key: `${target.species.id}:Raid:${i}`,
      });
    });
  }
  const priority = { GL: 0, UL: 1, ML: 2, Raid: 3, Max: 4, Gym: 5 };
  return result.sort(
    (a, b) =>
      priority[a.role] - priority[b.role] ||
      (a.ranking?.rank ?? 1000) - (b.ranking?.rank ?? 1000) ||
      a.species.name.localeCompare(b.species.name),
  );
}
export type Recommendation = {
  verdict: 'Keep' | 'Trade' | 'Transfer' | 'Review';
  title: string;
  reason: string;
};
export function recommendation(
  species: Species,
  ivs: IVs,
  options: Option[],
  flags: CollectionFlags,
  settings: Settings,
  ready: boolean,
): Recommendation {
  const collectible =
    flags.shiny ||
    flags.costume ||
    flags.rare ||
    flags.sentimental ||
    flags.maxBattle ||
    ivs.every((v) => v === 15) ||
    ivs.every((v) => v === 0);
  if (collectible)
    return {
      verdict: 'Keep',
      title: 'There’s more to this copy.',
      reason:
        'A collection reason is present. Shiny, costume, rarity, sentimental, Max Battle, perfect and zero-IV copies can be worth keeping regardless of battle IVs.',
    };
  if (!ready)
    return {
      verdict: 'Review',
      title: 'Checking your options…',
      reason: 'Comparing eligible IV combinations for each useful target.',
    };
  const useful = options.filter((o) =>
    o.role === 'Raid'
      ? o.raid?.source !== 'input-csv' && o.raid?.tier !== 'unverified'
      : o.role === 'Max'
        ? !!(
            o.max?.roles.some((r) => goodMaxTier(r.tier)) ||
            o.max?.support?.some((r) => goodMaxTier(r.tier))
          )
        : o.role === 'Gym'
          ? !!gymTier(o.species)
          : !!o.result?.stats,
  );
  const reachable = useful.filter(
    (o) => !o.conditional && !o.result?.overCap && !o.result?.aboveMax,
  );
  const good = reachable.filter((o) =>
    o.role === 'GL' || o.role === 'UL'
      ? (o.result?.percentile ?? -1) > settings.threshold
      : goodOverallIV(ivs),
  );
  const defenders = reachable.filter((o) => o.role === 'Gym');
  if (defenders.length)
    return {
      verdict: 'Keep',
      title: 'Useful for gym defense.',
      reason: `${defenders.map((o) => o.species.name).join(', ')} ${defenders.length === 1 ? 'is' : 'are'} on the sourced gym-defense shortlist. No minimum IV percentage is required for this role. Consider keeping a defender; this is not a recommendation to power up every copy. Check evolution requirements and your existing defenders.`,
    };
  if (good.length)
    return {
      verdict: 'Keep',
      title: 'A place on your team.',
      reason: `${good.length} useful ${good.length === 1 ? 'option meets' : 'options meet'} your IV preference. Check moves and evolution requirements before investing; IVs alone do not determine battle performance.`,
    };
  if (useful.some((o) => o.role === 'Max'))
    return {
      verdict: 'Review',
      title: 'Check this copy’s Max capability.',
      reason:
        'An A-tier-or-better Max Battle attacker, defender or healer target is available for this species or a supported evolution. Confirm the matching Dynamax, Gigantamax or special form on this copy. The species rating alone does not establish its capability; each role has its own source tier, and defender performance depends on the boss.',
    };
  if (useful.some((o) => o.conditional))
    return {
      verdict: 'Review',
      title: 'Check the evolution conditions.',
      reason:
        'A useful target depends on gender, a random outcome, an event, or an unverified path. Confirm the requirement on this copy before deciding.',
    };
  if (
    useful.some(
      (o) =>
        o.result?.overCap ||
        o.result?.aboveMax ||
        (!o.result?.inPool && o.role !== 'Raid' && o.role !== 'Gym' && o.role !== 'Max'),
    )
  )
    return {
      verdict: 'Review',
      title: 'This copy needs a closer look.',
      reason:
        'A target is over the CP cap, beyond your chosen maximum level, or outside the comparison pool. Pokémon cannot be powered down. The theoretical IV rank is unchanged.',
    };
  if (species.shadow && useful.length)
    return {
      verdict: 'Review',
      title: 'Give this Shadow a second look.',
      reason:
        'This is a useful Shadow even if its IVs miss your preference. Shadows cannot be traded; their damage advantage can matter more than IVs. Purification changes IVs and is not an evolution path here.',
    };
  if (useful.length) {
    if (species.tradable === true && !flags.alreadyTraded)
      return {
        verdict: 'Trade',
        title: 'Useful species. Different IVs may help.',
        reason:
          'This copy misses your IV preference. Trading rerolls IVs and does not guarantee improvement. Confirm friendship, trade restrictions and collection value first.',
      };
    return {
      verdict: 'Review',
      title: 'Useful, even below your preference.',
      reason:
        'This copy cannot be traded, or tradability is unverified. Compare its moves, costs and your available team before deciding.',
    };
  }
  // Unknown raid coverage and absent rankings can never prove worthlessness.
  if (flags.ordinaryExtra && !species.shadow && options.length === 0)
    return {
      verdict: 'Transfer',
      title: 'An ordinary extra, by your choice.',
      reason:
        'You marked this as an ordinary extra with no collection reason. No qualifying role was found in this snapshot; missing raid or ranking evidence is not proof of no value. Review that uncertainty before transferring in the game.',
    };
  return {
    verdict: 'Review',
    title: 'No clear battle verdict yet.',
    reason:
      'No confirmed option meets the current evidence and settings. Missing rankings or raid labels do not mean this Pokémon is useless. Keep a collection copy if it matters to you.',
  };
}
