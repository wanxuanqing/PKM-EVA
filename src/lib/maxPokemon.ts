import type { Catalog, MaxBattleData, MaxBattleEntry } from '../types';
export type MaxRoleFilter = 'All' | 'Attacker' | 'Defender' | 'Healer';
export const goodMaxTier = (tier: string) => ['SS', 'S+', 'S', 'A+', 'A'].includes(tier);
function mergeEntries(attack: MaxBattleEntry[], support: MaxBattleEntry[]): MaxBattleEntry[] {
  const merged = new Map<string, MaxBattleEntry>();
  for (const entry of [...attack, ...support]) {
    const prior = merged.get(entry.id);
    merged.set(entry.id, {
      ...entry,
      artwork: entry.artwork ?? prior?.artwork,
      roles: [...(prior?.roles ?? []), ...entry.roles].filter((r) => goodMaxTier(r.tier)),
      support: [...(prior?.support ?? []), ...(entry.support ?? [])].filter((r) =>
        goodMaxTier(r.tier),
      ),
    });
  }
  return [...merged.values()].filter((e) => e.roles.length || e.support?.length);
}
export function usefulMaxEntries(max?: MaxBattleData): MaxBattleEntry[] {
  return mergeEntries(max?.usefulEntries ?? max?.entries ?? [], max?.supportEntries ?? []);
}
export function maxPokemon(
  data: Catalog,
  type = 'All',
  role: MaxRoleFilter = 'Attacker',
): MaxBattleEntry[] {
  const entries = mergeEntries(
    data.maxBattles?.entries ?? [],
    data.maxBattles?.supportEntries ?? [],
  );
  return entries
    .map((e) => ({
      ...e,
      roles:
        role === 'Attacker' || role === 'All'
          ? e.roles
              .filter((r) => type === 'All' || r.type === type)
              .sort((a, b) => a.rank - b.rank || a.type.localeCompare(b.type))
          : [],
      support:
        role === 'Attacker'
          ? []
          : (e.support ?? []).filter((r) => role === 'All' || r.role === role),
    }))
    .filter((e) => e.roles.length || e.support.length)
    .sort((a, b) => {
      if (role === 'Attacker' || role === 'All')
        return (
          (a.roles[0]?.rank ?? 1000) - (b.roles[0]?.rank ?? 1000) || a.name.localeCompare(b.name)
        );
      const tiers = ['SS', 'S+', 'S', 'A+', 'A'];
      return (
        tiers.indexOf(a.support[0].tier) - tiers.indexOf(b.support[0].tier) ||
        a.name.localeCompare(b.name)
      );
    });
}
