import { distribution } from '../lib/calculator';
import type { League, Species, RankedSpread } from '../types';
export type TopRequest = { league: League; species: Species[]; cpm: number[] };
export type TopResponse = { id: string; ideals?: RankedSpread[]; error?: string };
self.onmessage = (event: MessageEvent<TopRequest>) => {
  const { league, species, cpm } = event.data;
  for (const p of species) {
    try {
      const ideals = distribution({
        base: p.baseStats!,
        league,
        cpm,
        maxLevel: 50,
        minLevel: p.minLevel,
        floor: 0,
        eligible: p.eligible[league],
      }).ideals;
      self.postMessage({ id: p.id, ideals } satisfies TopResponse);
    } catch {
      self.postMessage({
        id: p.id,
        error: 'Ideal IV calculation unavailable.',
      } satisfies TopResponse);
    }
  }
};
