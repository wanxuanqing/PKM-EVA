import type { Catalog, League, RaidRole, Species } from '../types';
export type TopCategory = League | 'Raid';
export type RaidSet = NonNullable<RaidRole['moveSets']>[number];
export const raidTiers = ['SS', 'S+', 'S', 'A+', 'A'];
export type TopEntry = { species: Species; sets: RaidSet[] };
export function topPokemon(data: Catalog, category: TopCategory, type = 'All'): TopEntry[] {
  if (category !== 'Raid')
    return data.species
      .filter((p) => p.eligible[category] && p.rankings[category] && p.baseStats)
      .sort(
        (a, b) =>
          a.rankings[category]!.rank - b.rankings[category]!.rank || a.id.localeCompare(b.id),
      )
      .slice(0, 50)
      .map((species) => ({ species, sets: [] }));
  const compare = (a: RaidSet, b: RaidSet) =>
    raidTiers.indexOf(a.tier) - raidTiers.indexOf(b.tier) ||
    a.rank - b.rank ||
    a.type.localeCompare(b.type);
  return data.species
    .map((species) => ({
      species,
      sets: species.raid
        .filter((r) => r.source !== 'input-csv' && r.tier !== 'unverified')
        .flatMap((r) => r.moveSets ?? [])
        .filter(
          (r) =>
            r.type.toLowerCase() !== 'normal' &&
            raidTiers.includes(r.tier) &&
            (type === 'All' || r.type === type),
        )
        .sort(compare),
    }))
    .filter((p) => p.sets.length)
    .sort((a, b) => compare(a.sets[0], b.sets[0]) || a.species.id.localeCompare(b.species.id))
    .slice(0, 50);
}

export type EvolutionLine = { species: Species[]; conditional: boolean };
// Only evolution and temporary-evolution edges describe a lineage. Form changes
// and fusions can be reversible and are not pre-evolutions.
export function evolutionLines(data: Catalog, targetId: string): EvolutionLine[] {
  const byId = new Map(data.species.map((p) => [p.id, p]));
  const parents = new Map<string, { species: Species; conditional: boolean }[]>();
  for (const p of data.species)
    for (const e of p.evolutions) {
      const target = byId.get(e.to);
      if (
        !target ||
        !['evolution', 'temporary'].includes(e.kind) ||
        p.shadow !== target.shadow ||
        (p.shadow && target.temporary)
      )
        continue;
      const list = parents.get(e.to) ?? [];
      list.push({
        species: p,
        conditional: !!(
          e.eventOnly ||
          e.review ||
          e.random ||
          e.gender ||
          e.highestIV !== undefined
        ),
      });
      parents.set(e.to, list);
    }
  function walk(id: string, visited: Set<string>): EvolutionLine[] {
    const species = byId.get(id);
    if (!species || visited.has(id)) return [];
    const seen = new Set([...visited, id]);
    const previous = parents.get(id) ?? [];
    if (!previous.length) return [{ species: [species], conditional: false }];
    return previous.flatMap((parent) =>
      walk(parent.species.id, seen).map((line) => ({
        species: [...line.species, species],
        conditional: line.conditional || parent.conditional,
      })),
    );
  }
  const unique = new Map(
    walk(targetId, new Set())
      .filter((line) => line.species.length > 1)
      .map((line) => [line.species.map((p) => p.id).join('>'), line]),
  );
  return [...unique.values()].sort((a, b) =>
    a.species
      .map((p) => p.name)
      .join()
      .localeCompare(b.species.map((p) => p.name).join()),
  );
}
