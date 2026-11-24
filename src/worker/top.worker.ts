import { CALCULATOR_VERSION, distribution } from '../lib/calculator';
import { cacheTopIdeals, cachedTopIdeals } from '../lib/storage';
import type { League, Species, RankedSpread } from '../types';
export type TopRequest = {
  id: number;
  version: string;
  league: League;
  species: Species[];
  cpm: number[];
};
export type TopResponse = { id: string; ideals?: RankedSpread[]; error?: string };
export type TopBatchResponse = { id: number; league: League; batch: TopResponse[]; done: boolean };
const memory = new Map<string, Record<string, TopResponse>>();
let latest = 0;
self.onmessage = async (event: MessageEvent<TopRequest>) => {
  const { id, version, league, species, cpm } = event.data;
  latest = id;
  const cacheKey = `${version}:${CALCULATOR_VERSION}:${league}`;
  const stored =
    memory.get(cacheKey) ?? (await cachedTopIdeals<Record<string, TopResponse>>(cacheKey));
  if (latest !== id) return;
  if (stored && species.every((p) => p.id in stored)) {
    memory.set(cacheKey, stored);
    self.postMessage({
      id,
      league,
      batch: species.map((p) => stored[p.id]),
      done: true,
    } satisfies TopBatchResponse);
    return;
  }
  const computed: Record<string, TopResponse> = { ...(stored ?? {}) };
  let pending: TopResponse[] = [];
  const flush = (done: boolean) => {
    if (!pending.length && !done) return;
    self.postMessage({ id, league, batch: pending, done } satisfies TopBatchResponse);
    pending = [];
  };
  for (let i = 0; i < species.length; i++) {
    if (latest !== id) return;
    const p = species[i];
    let entry = computed[p.id];
    if (!entry) {
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
        entry = { id: p.id, ideals };
      } catch {
        entry = { id: p.id, error: 'Ideal IV calculation unavailable.' };
      }
      computed[p.id] = entry;
    }
    pending.push(entry);
    if (pending.length >= 10) {
      flush(i === species.length - 1);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (latest !== id) return;
  memory.set(cacheKey, computed);
  void cacheTopIdeals(cacheKey, computed);
  flush(true);
};
