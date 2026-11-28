import { assessIVs, CALCULATOR_VERSION, distribution, type Calculation } from '../lib/calculator';
import { cache, cached } from '../lib/storage';
import type { Distribution, IVResult, IVs } from '../types';

export type LibraryBatchItem = {
  entryId: string;
  ivs: IVs;
  currentLevel?: number;
  targets: { key: string; speciesId: string; calculation: Calculation }[];
};

export type LibraryBatchRequest = {
  id: number;
  version: string;
  items: LibraryBatchItem[];
};

export type LibraryBatchResponse = {
  id: number;
  results: Record<string, Record<string, IVResult>>;
  done: boolean;
  error?: string;
};

const memory = new Map<string, Distribution>();
let latest = 0;

self.onmessage = async (event: MessageEvent<LibraryBatchRequest>) => {
  const request = event.data;
  latest = request.id;
  try {
    let pending: Record<string, Record<string, IVResult>> = {};
    let pendingCount = 0;

    const flush = (done: boolean) => {
      if (!pendingCount && !done) return;
      self.postMessage({
        id: request.id,
        results: pending,
        done,
      } satisfies LibraryBatchResponse);
      pending = {};
      pendingCount = 0;
    };

    for (let i = 0; i < request.items.length; i++) {
      if (latest !== request.id) return;
      const item = request.items[i];
      const entryResults: Record<string, IVResult> = {};

      for (const target of item.targets) {
        if (latest !== request.id) return;
        const { cpm, ...settings } = target.calculation;
        const key = JSON.stringify([
          request.version,
          CALCULATOR_VERSION,
          target.speciesId,
          settings,
        ]);
        let dist = memory.get(key) ?? (await cached<Distribution>(key));
        if (latest !== request.id) return;
        if (!dist) {
          dist = distribution({ ...settings, cpm });
          void cache(key, dist);
        }
        memory.set(key, dist);
        if (memory.size > 48) memory.delete(memory.keys().next().value!);
        entryResults[target.key] = assessIVs(target.calculation, item.ivs, dist, item.currentLevel);
      }

      pending[item.entryId] = entryResults;
      pendingCount++;

      if (pendingCount >= 8) {
        flush(i === request.items.length - 1);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    if (latest === request.id) flush(true);
  } catch (error) {
    self.postMessage({
      id: request.id,
      results: {},
      done: true,
      error: error instanceof Error ? error.message : 'Library batch evaluation failed.',
    } satisfies LibraryBatchResponse);
  }
};
