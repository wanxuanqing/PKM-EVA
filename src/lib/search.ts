import type { Species } from '../types';
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/♀/g, ' female ')
    .replace(/♂/g, ' male ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\balola\b/g, 'alolan')
    .replace(/\bgalar\b/g, 'galarian')
    .replace(/\bhisui\b/g, 'hisuian')
    .replace(/\bpaldea\b/g, 'paldean')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
type IndexedSpecies = { p: Species; keys: string[]; compactKeys: string[] };
const searchIndex = new WeakMap<Species[], IndexedSpecies[]>();
function indexFor(species: Species[]): IndexedSpecies[] {
  const existing = searchIndex.get(species);
  if (existing) return existing;
  const indexed = species.map((p) => {
    const keys = [p.name, p.id, String(p.dex), ...p.aliases].map(normalize);
    return { p, keys, compactKeys: keys.map((k) => k.replaceAll(' ', '')) };
  });
  searchIndex.set(species, indexed);
  return indexed;
}
export function searchSpecies(species: Species[], query: string, limit = 40): Species[] {
  const q = normalize(query);
  if (!q) return [];
  const compactQ = q.replaceAll(' ', '');
  const tokens = q.split(' ');
  return indexFor(species)
    .map(({ p, keys, compactKeys }) => {
      const exact = keys.includes(q) || compactKeys.includes(compactQ);
      const start = !exact && keys.some((k) => k.startsWith(q));
      const match = !exact && !start && keys.some((k) => tokens.every((t) => k.includes(t)));
      return { p, score: exact ? 3 : start ? 2 : match ? 1 : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}
