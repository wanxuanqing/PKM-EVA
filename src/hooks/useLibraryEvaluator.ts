import { useEffect, useMemo, useRef, useState } from 'react';
import type { Catalog, IVResult, Species } from '../types';
import { effectiveMax } from '../lib/calculator';
import {
  buildEntryOptions,
  compareLibraryCopies,
  evaluateLibraryEntry,
  type EvaluatedLibraryEntry,
  type LibraryComparison,
  type LibraryEntry,
} from '../lib/library';
import type {
  LibraryBatchItem,
  LibraryBatchRequest,
  LibraryBatchResponse,
} from '../worker/library.worker';

export function useLibraryEvaluator({
  entries,
  data,
  byId,
  active,
}: {
  entries: LibraryEntry[];
  data: Catalog;
  byId: Map<string, Species>;
  active: boolean;
}) {
  const [calcsByEntry, setCalcsByEntry] = useState<Record<string, Record<string, IVResult>>>({});
  const [busy, setBusy] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const serial = useRef(0);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active || !entries.length) {
      setBusy(false);
      return;
    }
    const requestId = ++serial.current;
    const items: LibraryBatchItem[] = [];
    const instant: Record<string, Record<string, IVResult>> = {};

    for (const entry of entries) {
      const { options } = buildEntryOptions(entry, byId, data);
      const pvp = options.filter((o) => ['GL', 'UL', 'ML'].includes(o.role) && o.species.baseStats);
      if (!pvp.length) {
        instant[entry.id] = {};
        continue;
      }
      items.push({
        entryId: entry.id,
        ivs: entry.ivs,
        currentLevel: entry.settings.currentLevel,
        targets: pvp.map((o) => ({
          key: o.key,
          speciesId: o.species.id,
          calculation: {
            base: o.species.baseStats!,
            league: o.role as 'GL' | 'UL' | 'ML',
            maxLevel: effectiveMax(entry.settings.maxLevel, entry.settings.bestBuddy),
            minLevel: o.species.minLevel,
            floor: entry.settings.floor,
            eligible: o.species.eligible[o.role as 'GL' | 'UL' | 'ML'],
            cpm: data.cpm,
          },
        })),
      });
    }

    if (Object.keys(instant).length) {
      setCalcsByEntry((prev) => ({ ...prev, ...instant }));
    }
    if (!items.length) {
      setBusy(false);
      return;
    }

    setBusy(true);
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../worker/library.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    const worker = workerRef.current;
    worker.onmessage = (event: MessageEvent<LibraryBatchResponse>) => {
      if (event.data.id !== serial.current) return;
      setCalcsByEntry((prev) => ({ ...prev, ...event.data.results }));
      if (event.data.done) setBusy(false);
    };
    worker.onerror = () => setBusy(false);
    const req: LibraryBatchRequest = { id: requestId, version: data.version, items };
    worker.postMessage(req);
  }, [entries, data, byId, active]);

  const evaluated = useMemo(() => {
    const map = new Map<string, EvaluatedLibraryEntry>();
    for (const entry of entries) {
      const hasResult = entry.id in calcsByEntry;
      map.set(entry.id, evaluateLibraryEntry(entry, byId, data, calcsByEntry[entry.id], hasResult));
    }
    return map;
  }, [entries, byId, data, calcsByEntry]);

  const comparisons = useMemo<Map<string, LibraryComparison>>(
    () => compareLibraryCopies(entries, evaluated),
    [entries, evaluated],
  );

  return { evaluated, comparisons, busy };
}
