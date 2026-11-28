import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Catalog, CollectionFlags, IVs, Settings, Species } from '../types';
import type {
  AppraisalReading,
  ScanAppraisalResponse,
  ScanFrameInput,
} from '../lib/appraisalTypes';
import {
  matchAppraisalSpecies,
  verifyAppraisalStats,
  type IVSuggestion,
  type VerificationResult,
} from '../lib/appraisalVerify';
import {
  extractMediaFiles,
  frameToBase64,
  type ExtractedFrame,
  type ExtractProgress,
  type VideoSensitivity,
} from '../lib/frameExtract';
import type { LibraryEntry } from '../lib/library';
import { copyGender } from '../lib/assessment';
import { Icon } from './Icon';

export type ScannedApplyPayload = {
  species: Species;
  ivs: IVs | null;
  currentLevel: number | null;
  gender: 'male' | 'female' | 'unknown';
  flags: {
    shiny: boolean;
    costume: boolean;
    maxBattle: boolean;
    alreadyTraded: boolean;
  };
};

type QueuedSource = {
  sourceId: string;
  file: File;
  kind: 'image' | 'video';
};

type PreviewFrame = ExtractedFrame & {
  sourceId: string;
};

type ScannedItem = {
  frame: PreviewFrame;
  reading: AppraisalReading;
  candidates: Species[];
  selectedSpecies: Species | null;
  appliedIvs: IVs | null;
  verification: VerificationResult;
};

const CHUNK_SIZE = 4;

function formatTimestamp(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec - mins * 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem.toFixed(1)}`;
}

function readingIvs(reading: AppraisalReading): IVs | null {
  if (reading.attackIv === null || reading.defenseIv === null || reading.hpIv === null) return null;
  return [reading.attackIv, reading.defenseIv, reading.hpIv];
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif|bmp|gif)$/i.test(file.name);
}

function makeSourceId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toLibraryEntry(
  item: ScannedItem,
  baseSettings: Settings,
  catalogVersion: string,
): LibraryEntry | null {
  if (!item.reading.readable || !item.selectedSpecies || !item.appliedIvs) return null;
  const p = item.selectedSpecies;
  const flags: CollectionFlags = {
    shiny: item.reading.isShiny,
    costume: item.reading.isCostume,
    rare: false,
    sentimental: false,
    maxBattle: item.reading.isMaxBattle,
    ordinaryExtra: false,
    alreadyTraded: item.reading.isTraded,
  };
  return {
    id: crypto.randomUUID(),
    speciesId: p.id,
    ivs: item.appliedIvs,
    settings: {
      ...baseSettings,
      currentLevel: item.verification.inferredLevel ?? undefined,
      gender: copyGender(p, item.reading.gender),
    },
    flags,
    date: new Date().toISOString(),
    version: catalogVersion,
    verdict: 'Review',
    cp: item.reading.cp,
    hp: item.reading.hp,
    cpStatus: item.verification.status,
    cpReason: item.verification.reason,
    suggestions: item.verification.suggestions,
    candidateIds: item.candidates.length > 1 ? item.candidates.map((c) => c.id) : undefined,
    uncertainFields: item.reading.uncertainFields.length ? item.reading.uncertainFields : undefined,
    triage: 'undecided',
    sourceName: item.frame.sourceName,
    timestampSec: item.frame.timestampSec,
  };
}

export function AppraisalScanner({
  data,
  settings,
  mode = 'assess',
  onApply,
  onAddToLibrary,
}: {
  data: Catalog;
  settings: Settings;
  mode?: 'assess' | 'library';
  onApply?: (payload: ScannedApplyPayload) => void;
  onAddToLibrary?: (
    entries: LibraryEntry[],
    options?: { silent?: boolean },
  ) => { added: number; skippedDuplicates: number };
}) {
  const id = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const extractAbortRef = useRef<AbortController | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(mode === 'library');
  const [cropStatusBar, setCropStatusBar] = useState(true);
  const [appraisalOnly, setAppraisalOnly] = useState(true);
  const [sensitivity, setSensitivity] = useState<VideoSensitivity>('balanced');
  const [sources, setSources] = useState<QueuedSource[]>([]);
  const [frames, setFrames] = useState<PreviewFrame[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState<ExtractProgress | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const applyItemToAssess = useCallback(
    (item: ScannedItem) => {
      if (!onApply || !item.selectedSpecies) return;
      onApply({
        species: item.selectedSpecies,
        ivs: item.appliedIvs,
        currentLevel: item.verification.inferredLevel,
        gender: item.reading.gender,
        flags: {
          shiny: item.reading.isShiny,
          costume: item.reading.isCostume,
          maxBattle: item.reading.isMaxBattle,
          alreadyTraded: item.reading.isTraded,
        },
      });
    },
    [onApply],
  );

  const runExtraction = useCallback(
    async (
      targetSources: QueuedSource[],
      options: {
        crop: boolean;
        density: VideoSensitivity;
        appraisalFilter: boolean;
        replaceAll: boolean;
      },
    ) => {
      if (!targetSources.length) return;
      extractAbortRef.current?.abort();
      const controller = new AbortController();
      extractAbortRef.current = controller;
      setExtracting(true);
      setError('');
      setStatusNote('');
      setExtractProgress(null);

      try {
        const extracted: PreviewFrame[] = [];
        for (const src of targetSources) {
          const srcFrames = await extractMediaFiles([src.file], {
            cropTopStatusBar: options.crop,
            sensitivity: options.density,
            appraisalOnly: options.appraisalFilter,
            signal: controller.signal,
            onProgress: (p) => setExtractProgress(p),
          });
          for (const frame of srcFrames) {
            extracted.push({ ...frame, sourceId: src.sourceId });
          }
        }
        if (controller.signal.aborted) return;
        setFrames((prev) => (options.replaceAll ? extracted : [...prev, ...extracted]));
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Could not read the selected media.');
      } finally {
        if (extractAbortRef.current === controller) {
          setExtracting(false);
          setExtractProgress(null);
        }
      }
    },
    [],
  );

  const addFiles = useCallback(
    async (incoming: File[]) => {
      const valid = incoming.filter((f) => isImageFile(f) || isVideoFile(f));
      if (!valid.length) {
        setError('Choose a Pokémon GO appraisal screenshot (image) or screen recording (video).');
        return;
      }
      setOpen(true);
      setScannedItems([]);
      setStatusNote('');
      const queued: QueuedSource[] = valid.map((file) => ({
        sourceId: makeSourceId(),
        file,
        kind: isVideoFile(file) ? 'video' : 'image',
      }));
      setSources((prev) => [...prev, ...queued]);
      await runExtraction(queued, {
        crop: cropStatusBar,
        density: sensitivity,
        appraisalFilter: appraisalOnly,
        replaceAll: false,
      });
    },
    [appraisalOnly, cropStatusBar, runExtraction, sensitivity],
  );

  // Window paste support (Ctrl/Cmd+V screenshots anywhere while this scanner is mounted)
  useEffect(() => {
    const onWindowPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (!imageFiles.length) return;
      event.preventDefault();
      void addFiles(imageFiles);
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, [addFiles]);

  useEffect(() => {
    return () => {
      extractAbortRef.current?.abort();
      scanAbortRef.current?.abort();
    };
  }, []);

  async function handleCropToggle(nextCrop: boolean) {
    setCropStatusBar(nextCrop);
    if (sources.length) {
      await runExtraction(sources, {
        crop: nextCrop,
        density: sensitivity,
        appraisalFilter: appraisalOnly,
        replaceAll: true,
      });
    }
  }

  async function handleAppraisalOnlyToggle(nextFilter: boolean) {
    setAppraisalOnly(nextFilter);
    if (sources.some((s) => s.kind === 'video')) {
      await runExtraction(sources, {
        crop: cropStatusBar,
        density: sensitivity,
        appraisalFilter: nextFilter,
        replaceAll: true,
      });
    }
  }

  async function handleSensitivityChange(nextDensity: VideoSensitivity) {
    setSensitivity(nextDensity);
    if (sources.some((s) => s.kind === 'video')) {
      await runExtraction(sources, {
        crop: cropStatusBar,
        density: nextDensity,
        appraisalFilter: appraisalOnly,
        replaceAll: true,
      });
    }
  }

  function toggleFrameIncluded(frameId: string) {
    setFrames((prev) => prev.map((f) => (f.id === frameId ? { ...f, included: !f.included } : f)));
  }

  function removeFrame(frameId: string) {
    setFrames((prev) => {
      const next = prev.filter((f) => f.id !== frameId);
      const remainingSourceIds = new Set(next.map((f) => f.sourceId));
      setSources((old) => old.filter((s) => remainingSourceIds.has(s.sourceId)));
      return next;
    });
  }

  function clearAll() {
    extractAbortRef.current?.abort();
    setExtracting(false);
    setExtractProgress(null);
    setSources([]);
    setFrames([]);
    setScannedItems([]);
    setActiveIndex(0);
    setError('');
    setStatusNote('');
    setScanProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function scanSelectedFrames() {
    const selectedFrames = frames.filter((f) => f.included);
    if (!selectedFrames.length || scanning || extracting) return;

    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;

    setScanning(true);
    setError('');
    setStatusNote('');
    setScannedItems([]);
    setScanProgress({ done: 0, total: selectedFrames.length });

    const readingsById = new Map<string, AppraisalReading>();
    let totalAdded = 0;
    let totalDupes = 0;
    let totalUnreadable = 0;

    const buildItem = (frame: PreviewFrame, reading: AppraisalReading): ScannedItem => {
      const matched = reading.readable
        ? matchAppraisalSpecies(data.species, reading)
        : { best: null, candidates: [] };
      const ivs = reading.readable ? readingIvs(reading) : null;
      const verification = verifyAppraisalStats(
        matched.best,
        ivs,
        reading.cp,
        reading.hp,
        data.cpm,
        reading.uncertainFields,
      );
      return {
        frame,
        reading,
        candidates: matched.candidates,
        selectedSpecies: matched.best,
        appliedIvs: ivs,
        verification,
      };
    };

    try {
      for (let start = 0; start < selectedFrames.length; start += CHUNK_SIZE) {
        if (controller.signal.aborted) break;
        const chunk = selectedFrames.slice(start, start + CHUNK_SIZE);
        const payload: { frames: ScanFrameInput[] } = {
          frames: chunk.map((f) => ({
            id: f.id,
            imageBase64: frameToBase64(f),
            mimeType: f.mimeType,
          })),
        };

        const response = await fetch('/api/scan-appraisal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }

        if (!response.ok) {
          const message =
            body &&
            typeof body === 'object' &&
            typeof (body as { error?: unknown }).error === 'string'
              ? (body as { error: string }).error
              : `Scanner endpoint returned HTTP ${response.status}. Make sure the Express server is running with GEMINI_API_KEY configured.`;
          throw new Error(message);
        }

        const parsed = body as ScanAppraisalResponse;
        if (!parsed || !Array.isArray(parsed.results)) {
          throw new Error('Server returned an unexpected scanner response.');
        }

        const chunkById = new Map<string, AppraisalReading>();
        for (const r of parsed.results) {
          readingsById.set(r.id, r);
          chunkById.set(r.id, r);
        }

        // Stream completed 4-frame chunks directly into the unified library so long
        // 500-frame scans persist incrementally and can resume if interrupted.
        if (mode === 'library' && onAddToLibrary) {
          const chunkItems = chunk.map((frame) => {
            const reading = chunkById.get(frame.id);
            if (!reading) throw new Error(`Missing scan result for frame ${frame.id}.`);
            return buildItem(frame, reading);
          });
          const entries = chunkItems
            .map((item) => toLibraryEntry(item, settings, data.version))
            .filter((e): e is LibraryEntry => e !== null);
          totalUnreadable += chunkItems.length - entries.length;
          if (entries.length) {
            const { added, skippedDuplicates } = onAddToLibrary(entries, { silent: true });
            totalAdded += added;
            totalDupes += skippedDuplicates;
          }
          const doneIds = new Set(chunk.map((f) => f.id));
          setFrames((prev) => {
            const remaining = prev.filter((f) => !doneIds.has(f.id));
            const remainingSources = new Set(remaining.map((f) => f.sourceId));
            setSources((old) => old.filter((s) => remainingSources.has(s.sourceId)));
            return remaining;
          });
        }

        setScanProgress({
          done: Math.min(start + chunk.length, selectedFrames.length),
          total: selectedFrames.length,
        });
      }

      if (mode === 'library' && onAddToLibrary) {
        const notes: string[] = [
          controller.signal.aborted
            ? `Stopped scan. Saved ${totalAdded} Pokémon to your library so far.`
            : `Added ${totalAdded} Pokémon to your library.`,
        ];
        if (totalDupes > 0) notes.push(`${totalDupes} duplicate skipped.`);
        if (totalUnreadable > 0) notes.push(`${totalUnreadable} unreadable frame skipped.`);
        setStatusNote(notes.join(' '));
        return;
      }

      if (controller.signal.aborted) return;

      const items: ScannedItem[] = selectedFrames.map((frame) => {
        const reading = readingsById.get(frame.id);
        if (!reading) {
          throw new Error(`Missing scan result for frame ${frame.id}.`);
        }
        return buildItem(frame, reading);
      });

      setScannedItems(items);
      const firstReadableIdx = items.findIndex(
        (item) => item.reading.readable && item.selectedSpecies !== null,
      );
      const targetIdx = firstReadableIdx >= 0 ? firstReadableIdx : 0;
      setActiveIndex(targetIdx);
      if (firstReadableIdx >= 0) {
        applyItemToAssess(items[firstReadableIdx]);
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        if (mode === 'library') {
          setStatusNote(
            `Stopped scan. Saved ${totalAdded} Pokémon to your library; remaining frames stay queued above.`,
          );
        }
        return;
      }
      const msg = err instanceof Error ? err.message : 'Appraisal scan failed.';
      setError(
        mode === 'library' && totalAdded > 0
          ? `${msg} (${totalAdded} Pokémon already saved to your library; remaining frames stay queued to resume.)`
          : msg,
      );
    } finally {
      if (scanAbortRef.current === controller) {
        setScanning(false);
      }
    }
  }

  function addScannedBatchToLibrary() {
    if (!onAddToLibrary || !scannedItems.length) return;
    const entries = scannedItems
      .map((item) => toLibraryEntry(item, settings, data.version))
      .filter((e): e is LibraryEntry => e !== null);
    if (!entries.length) return;
    const { added, skippedDuplicates } = onAddToLibrary(entries);
    setStatusNote(
      `Added ${added} to your library${skippedDuplicates ? ` (${skippedDuplicates} duplicate skipped)` : ''}.`,
    );
  }

  function selectQueueItem(index: number) {
    setActiveIndex(index);
    const item = scannedItems[index];
    if (item && item.selectedSpecies) {
      applyItemToAssess(item);
    }
  }

  function switchFormCandidate(species: Species) {
    setScannedItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== activeIndex) return item;
        const verification = verifyAppraisalStats(
          species,
          item.appliedIvs,
          item.reading.cp,
          item.reading.hp,
          data.cpm,
          item.reading.uncertainFields,
        );
        const updated: ScannedItem = { ...item, selectedSpecies: species, verification };
        applyItemToAssess(updated);
        return updated;
      }),
    );
  }

  function applySuggestionChip(suggestion: IVSuggestion) {
    setScannedItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== activeIndex) return item;
        const verification = verifyAppraisalStats(
          item.selectedSpecies,
          suggestion.ivs,
          item.reading.cp,
          item.reading.hp,
          data.cpm,
          [],
        );
        const updated: ScannedItem = {
          ...item,
          appliedIvs: suggestion.ivs,
          verification,
        };
        applyItemToAssess(updated);
        return updated;
      }),
    );
  }

  const includedCount = frames.filter((f) => f.included).length;
  const readableBatchCount = scannedItems.filter(
    (i) => i.reading.readable && i.selectedSpecies && i.appliedIvs,
  ).length;
  const activeItem = scannedItems[activeIndex] ?? null;

  return (
    <div className="scanner-wrap">
      <details
        className="scanner-details"
        open={open}
        onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          <span>
            <Icon name="camera" size={17} />{' '}
            {mode === 'library'
              ? 'Import from screen recording or screenshots'
              : 'Scan screenshot or recording'}
          </span>
          <Icon name="chevron" size={16} />
        </summary>
        <div className="scanner-body">
          <p className="small-note">
            {mode === 'library'
              ? 'Select a screen recording of your Pokémon appraisals (or multiple screenshots / Ctrl+V) to extract stats locally and add them to your library. Images are discarded after import.'
              : 'Upload one or more Pokémon GO appraisal screenshots, paste with Ctrl/Cmd+V, or select a screen recording. Everything is previewed locally before scanning.'}
          </p>

          <div className="scanner-upload-row">
            <input
              ref={fileInputRef}
              id={`${id}-media`}
              className="sr-only"
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => {
                const list = e.target.files ? Array.from(e.target.files) : [];
                if (list.length) void addFiles(list);
                e.target.value = '';
              }}
            />
            <label htmlFor={`${id}-media`} className="scanner-file-btn">
              <Icon name="camera" size={16} />
              Choose screenshots or video
            </label>
            {(frames.length > 0 || scannedItems.length > 0) && (
              <button
                type="button"
                className="scanner-clear-btn"
                onClick={clearAll}
                disabled={scanning}
              >
                Clear
              </button>
            )}
          </div>

          {extracting && (
            <div className="scanner-progress" role="status" aria-live="polite">
              <span>
                {extractProgress?.phase === 'video'
                  ? extractProgress.framesFound > 0
                    ? `Capturing keyframes (${extractProgress.framesFound} ready)…`
                    : `Analyzing recording locally (${extractProgress.current}/${extractProgress.total})…`
                  : 'Resizing screenshots locally…'}
              </span>
              <button
                type="button"
                className="scanner-link-btn"
                onClick={() => extractAbortRef.current?.abort()}
              >
                Cancel
              </button>
            </div>
          )}

          {frames.length > 0 && (
            <div className="scanner-preview">
              <div className="scanner-preview-head">
                <strong>
                  Frame preview ({includedCount} of {frames.length} selected)
                </strong>
              </div>

              <div className="scanner-options">
                <label className="check-row scanner-crop-toggle">
                  <input
                    type="checkbox"
                    checked={cropStatusBar}
                    disabled={extracting || scanning}
                    onChange={(e) => void handleCropToggle(e.target.checked)}
                  />
                  <span>
                    Crop top 4% OS status bar
                    <small>Hides clock, battery & notifications before upload.</small>
                  </span>
                </label>

                <label className="check-row scanner-crop-toggle">
                  <input
                    type="checkbox"
                    checked={appraisalOnly}
                    disabled={extracting || scanning}
                    onChange={(e) => void handleAppraisalOnlyToggle(e.target.checked)}
                  />
                  <span>
                    Skip non-appraisal video frames
                    <small>Filters out storage grids & swipes before sending to Gemini.</small>
                  </span>
                </label>

                <div className="scanner-density">
                  <span className="scanner-density-label" id={`${id}-density-label`}>
                    Video frame density
                  </span>
                  <div
                    className="scanner-density-group"
                    role="group"
                    aria-labelledby={`${id}-density-label`}
                  >
                    {(
                      [
                        ['fewer', 'Fewer'],
                        ['balanced', 'Balanced'],
                        ['more', 'More'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={sensitivity === value}
                        className={sensitivity === value ? 'active' : ''}
                        disabled={extracting || scanning}
                        onClick={() => void handleSensitivityChange(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="scanner-thumb-grid">
                {frames.map((frame, index) => (
                  <div
                    key={frame.id}
                    className={`scanner-thumb ${frame.included ? '' : 'excluded'}`}
                  >
                    <div className="scanner-thumb-media">
                      <img
                        src={frame.dataUrl}
                        alt={`Appraisal preview ${index + 1} (${frame.sourceName})`}
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="scanner-thumb-tag">
                        {frame.timestampSec !== undefined
                          ? formatTimestamp(frame.timestampSec)
                          : `#${index + 1}`}
                      </span>
                      <button
                        type="button"
                        className="scanner-thumb-remove"
                        aria-label={`Remove frame ${index + 1}`}
                        disabled={scanning}
                        onClick={() => removeFrame(frame.id)}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                    <label className="scanner-thumb-check">
                      <input
                        type="checkbox"
                        checked={frame.included}
                        disabled={scanning}
                        onChange={() => toggleFrameIncluded(frame.id)}
                      />
                      <span>Include</span>
                    </label>
                  </div>
                ))}
              </div>

              <p className="scanner-privacy-note">
                <Icon name="shield" size={14} />
                <span>
                  Opt-in scan: raw screen recordings never leave your device. Only the checked JPEG
                  frames above are sent to Gemini to read visible text and IV bars. No login or
                  storage.
                </span>
              </p>

              <div className="scanner-submit-row">
                <button
                  type="button"
                  className="scanner-submit-btn"
                  disabled={!includedCount || extracting || scanning}
                  onClick={() => void scanSelectedFrames()}
                >
                  {scanning && scanProgress
                    ? `Scanning ${scanProgress.done} / ${scanProgress.total}…`
                    : mode === 'library'
                      ? `Scan & add ${includedCount} ${includedCount === 1 ? 'frame' : 'frames'} to Library`
                      : `Scan ${includedCount} ${includedCount === 1 ? 'frame' : 'frames'} with Gemini`}
                </button>
                {scanning && (
                  <button
                    type="button"
                    className="scanner-clear-btn"
                    onClick={() => scanAbortRef.current?.abort()}
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          )}

          {statusNote && (
            <p className="scanner-status-note" role="status">
              <Icon name="check" size={14} /> {statusNote}
            </p>
          )}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </details>

      {mode === 'assess' && activeItem && (
        <section className="scan-review-card" aria-label="Appraisal scan review">
          <div className="scan-review-top">
            <img
              className="scan-review-thumb"
              src={activeItem.frame.dataUrl}
              alt={`Scanned appraisal frame ${activeIndex + 1}`}
            />
            <div className="scan-review-summary">
              <span className="eyebrow">
                SCAN REVIEW
                {scannedItems.length > 1 ? ` · ${activeIndex + 1} OF ${scannedItems.length}` : ''}
                {activeItem.frame.timestampSec !== undefined
                  ? ` · ${formatTimestamp(activeItem.frame.timestampSec)}`
                  : ''}
              </span>
              <h3>
                {activeItem.selectedSpecies?.name ??
                  activeItem.reading.speciesName ??
                  'Unreadable frame'}
              </h3>
              {activeItem.reading.readable ? (
                <p className="scan-review-ivs">
                  IVs:{' '}
                  <b>{activeItem.appliedIvs ? activeItem.appliedIvs.join(' / ') : 'Unavailable'}</b>
                  {activeItem.reading.cp !== null && (
                    <> · CP {activeItem.reading.cp.toLocaleString()}</>
                  )}
                  {activeItem.reading.hp !== null && <> · HP {activeItem.reading.hp}</>}
                </p>
              ) : (
                <p className="small-note">
                  {activeItem.reading.reason ??
                    'No readable Pokémon GO appraisal overlay was detected in this frame.'}
                </p>
              )}

              <div className="scan-badges">
                {activeItem.reading.readable && activeItem.verification.status === 'verified' && (
                  <span className="scan-badge verified">
                    <Icon name="check" size={13} />
                    CP {activeItem.verification.cp?.toLocaleString()} verified · Lv{' '}
                    {activeItem.verification.inferredLevel}
                  </span>
                )}
                {activeItem.reading.readable && activeItem.verification.status === 'mismatch' && (
                  <span className="scan-badge mismatch">
                    <Icon name="info" size={13} />
                    CP mismatch — check IVs
                  </span>
                )}
                {activeItem.reading.readable && activeItem.verification.status === 'unverified' && (
                  <span className="scan-badge neutral">
                    {activeItem.verification.reason ?? 'CP unverified'}
                  </span>
                )}
                {activeItem.reading.isShadow && <span className="scan-flag">Shadow</span>}
                {activeItem.reading.isShiny && <span className="scan-flag">Shiny</span>}
                {activeItem.reading.isCostume && <span className="scan-flag">Costume</span>}
                {activeItem.reading.isMaxBattle && <span className="scan-flag">Max</span>}
                {activeItem.reading.isTraded && <span className="scan-flag">Traded</span>}
              </div>
            </div>
          </div>

          {activeItem.candidates.length > 1 && (
            <div className="scan-forms" role="group" aria-label="Matched form candidates">
              <span className="scan-sublabel">Matched form:</span>
              <div className="scan-chip-row">
                {activeItem.candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={activeItem.selectedSpecies?.id === candidate.id}
                    className={
                      activeItem.selectedSpecies?.id === candidate.id
                        ? 'scan-chip active'
                        : 'scan-chip'
                    }
                    onClick={() => switchFormCandidate(candidate)}
                  >
                    {candidate.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeItem.reading.readable && activeItem.verification.status === 'mismatch' && (
            <div className="scan-mismatch-box">
              <p className="inline-warning">{activeItem.verification.reason}</p>
              {activeItem.verification.suggestions.length > 0 && (
                <div className="scan-suggestions">
                  <span className="scan-sublabel">1-tap CP-valid IV fixes:</span>
                  <div className="scan-chip-row">
                    {activeItem.verification.suggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.ivs.join('/')}-${suggestion.level}`}
                        type="button"
                        className="scan-chip suggestion"
                        onClick={() => applySuggestionChip(suggestion)}
                      >
                        <b>{suggestion.ivs.join('/')}</b> · Lv {suggestion.level}{' '}
                        <small>
                          ({suggestion.changes.join(', ')}
                          {suggestion.hpMatched ? ' · HP ✓' : ''})
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {onAddToLibrary && readableBatchCount > 0 && (
            <div className="scan-library-cta">
              <button type="button" className="scanner-file-btn" onClick={addScannedBatchToLibrary}>
                <Icon name="save" size={15} />
                Add{' '}
                {readableBatchCount === 1 ? 'this Pokémon' : `all ${readableBatchCount} Pokémon`} to
                Library
              </button>
            </div>
          )}

          {scannedItems.length > 1 && (
            <div className="scan-queue" role="group" aria-label="Scanned frames queue">
              {scannedItems.map((item, idx) => {
                const stateClass = !item.reading.readable
                  ? 'unreadable'
                  : item.verification.status === 'verified'
                    ? 'verified'
                    : item.verification.status === 'mismatch'
                      ? 'mismatch'
                      : 'neutral';
                return (
                  <button
                    key={item.frame.id}
                    type="button"
                    aria-pressed={idx === activeIndex}
                    className={`scan-queue-item ${idx === activeIndex ? 'active' : ''}`}
                    onClick={() => selectQueueItem(idx)}
                  >
                    <img src={item.frame.dataUrl} alt="" />
                    <span>
                      <b>
                        {item.selectedSpecies?.name ??
                          item.reading.speciesName ??
                          `Frame ${idx + 1}`}
                      </b>
                      <small>
                        <span className={`scan-dot ${stateClass}`} />
                        {item.reading.readable
                          ? item.appliedIvs
                            ? item.appliedIvs.join('/')
                            : 'No IVs'
                          : 'Unreadable'}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
