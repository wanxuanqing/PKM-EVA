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
export function searchSpecies(species: Species[], query: string, limit = 40): Species[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(' ');
  return species
    .map((p) => {
      const keys = [p.name, p.id, String(p.dex), ...p.aliases].map(normalize);
      const exact = keys.some((k) => k === q || k.replaceAll(' ', '') === q.replaceAll(' ', ''));
      const start = keys.some((k) => k.startsWith(q));
      const match = keys.some((k) => tokens.every((t) => k.includes(t)));
      return { p, score: exact ? 3 : start ? 2 : match ? 1 : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}
