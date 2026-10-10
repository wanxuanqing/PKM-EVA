import type { Catalog, League, RaidRole, Species } from '../types';
export type TopCategory = League | 'Raid';
export type RaidSet = NonNullable<RaidRole['moveSets']>[number];
export const raidTiers = ['S+', 'S', 'A+', 'A', 'B+', 'B'];
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
