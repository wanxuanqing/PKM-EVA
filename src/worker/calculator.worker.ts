import { distribution, assessIVs, CALCULATOR_VERSION, type Calculation } from '../lib/calculator';
import { cache, cached } from '../lib/storage';
import type { Distribution, IVResult, IVs } from '../types';
export type CalculationRequest = {
  id: number;
  version: string;
  ivs: IVs;
  currentLevel?: number;
  targets: { key: string; speciesId: string; calculation: Calculation }[];
};
export type CalculationResponse = {
  id: number;
  results?: Record<string, IVResult>;
  error?: string;
};
const memory = new Map<string, Distribution>();
let latest = 0;
self.onmessage = async (event: MessageEvent<CalculationRequest>) => {
  const request = event.data;
  latest = request.id;
  try {
    const results: Record<string, IVResult> = {};
    for (const target of request.targets) {
      if (latest !== request.id) return;
      const { cpm, ...settings } = target.calculation;
      const key = JSON.stringify([request.version, CALCULATOR_VERSION, target.speciesId, settings]);
      let dist = memory.get(key) ?? (await cached<Distribution>(key));
      if (latest !== request.id) return;
      if (!dist) {
        dist = distribution({ ...settings, cpm });
        void cache(key, dist);
      }
      memory.set(key, dist);
      if (memory.size > 32) memory.delete(memory.keys().next().value!);
      results[target.key] = assessIVs(target.calculation, request.ivs, dist, request.currentLevel);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (latest === request.id)
      self.postMessage({ id: request.id, results } satisfies CalculationResponse);
  } catch (error) {
    self.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : 'Calculation failed.',
    } satisfies CalculationResponse);
  }
};
