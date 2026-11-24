import { useEffect, useRef, useState } from 'react';
import { effectiveMax } from '../lib/calculator';
import type { Catalog, IVResult, IVs, Option, Settings } from '../types';
import type { CalculationRequest, CalculationResponse } from '../worker/calculator.worker';

export function useCalculatorWorker({
  data,
  ivs,
  valid,
  baseOptions,
  settings,
  currentLevel,
}: {
  data: Catalog;
  ivs: IVs | null;
  valid: boolean;
  baseOptions: Option[];
  settings: Settings;
  currentLevel: string;
}) {
  const [calculations, setCalculations] = useState<Record<string, IVResult>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const serial = useRef(0);

  useEffect(() => {
    const w = new Worker(new URL('../worker/calculator.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.current = w;
    w.onmessage = (event: MessageEvent<CalculationResponse>) => {
      if (event.data.id !== serial.current) return;
      setBusy(false);
      setError(event.data.error ?? '');
      setCalculations(event.data.results ?? {});
    };
    w.onerror = () => {
      setError('The calculator could not start. Reload the app to try again.');
      setBusy(false);
    };
    return () => w.terminate();
  }, []);

  useEffect(() => {
    serial.current++;
    setCalculations({});
    setError('');
    if (!ivs || !valid) {
      setBusy(false);
      return;
    }
    const pvp = baseOptions.filter(
      (o) => ['GL', 'UL', 'ML'].includes(o.role) && o.species.baseStats,
    );
    if (!pvp.length) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const request: CalculationRequest = {
      id: serial.current,
      version: data.version,
      ivs,
      currentLevel: currentLevel === '' ? undefined : Number(currentLevel),
      targets: pvp.map((o) => ({
        key: o.key,
        speciesId: o.species.id,
        calculation: {
          base: o.species.baseStats!,
          league: o.role as 'GL' | 'UL' | 'ML',
          maxLevel: effectiveMax(settings.maxLevel, settings.bestBuddy),
          minLevel: o.species.minLevel,
          floor: settings.floor,
          eligible: o.species.eligible[o.role as 'GL' | 'UL' | 'ML'],
          cpm: data.cpm,
        },
      })),
    };
    worker.current?.postMessage(request);
  }, [ivs, valid, baseOptions, data, settings, currentLevel]);

  return { calculations, busy, error };
}
