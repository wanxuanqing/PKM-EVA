export type VideoSensitivity = 'fewer' | 'balanced' | 'more';

export type ExtractedFrame = {
  id: string;
  sourceName: string;
  sourceKind: 'image' | 'video';
  timestampSec?: number;
  dataUrl: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  included: boolean;
};

export function frameToBase64(frame: Pick<ExtractedFrame, 'dataUrl'>): string {
  const comma = frame.dataUrl.indexOf(',');
  return comma >= 0 ? frame.dataUrl.slice(comma + 1) : frame.dataUrl;
}

export type ExtractProgress = {
  sourceName: string;
  phase: 'image' | 'video';
  current: number;
  total: number;
  framesFound: number;
};

export const MAX_IMAGE_DIM = 1280;
export const JPEG_QUALITY = 0.86;
export const STATUS_BAR_CROP_RATIO = 0.04;
export const MAX_VIDEO_FRAMES = 500;

export const VIDEO_SENSITIVITY_PRESETS: Record<
  VideoSensitivity,
  { sampleStepSec: number; settleThreshold: number; noveltyThreshold: number }
> = {
  fewer: { sampleStepSec: 0.4, settleThreshold: 0.018, noveltyThreshold: 0.075 },
  balanced: { sampleStepSec: 0.3, settleThreshold: 0.024, noveltyThreshold: 0.048 },
  more: { sampleStepSec: 0.2, settleThreshold: 0.032, noveltyThreshold: 0.03 },
};

export type BandSignature = {
  top: Uint8Array;
  bottom: Uint8Array;
  hasAppraisalCard?: boolean;
};

export function computeResizeDimensions(
  naturalWidth: number,
  naturalHeight: number,
  cropTopStatusBar: boolean,
  maxDim = MAX_IMAGE_DIM,
) {
  const srcW = Math.max(1, Math.round(naturalWidth));
  const fullH = Math.max(1, Math.round(naturalHeight));
  const cropY = cropTopStatusBar ? Math.round(fullH * STATUS_BAR_CROP_RATIO) : 0;
  const srcH = Math.max(1, fullH - cropY);
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));
  return { cropY, srcW, srcH, dstW, dstH };
}

/**
 * Local zero-API heuristic to detect the Pokémon GO Team Leader appraisal card
 * in the bottom 62%–94% region: a bright white/off-white card background plus
 * warm orange/amber or pink/red IV stat-bar pixels (or gray empty-bar track).
 */
export function hasAppraisalOverlayFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  const yStart = Math.floor(height * 0.62);
  const yEnd = Math.max(yStart + 1, Math.floor(height * 0.94));
  const xStart = Math.floor(width * 0.06);
  const xEnd = Math.max(xStart + 1, Math.floor(width * 0.94));

  let total = 0;
  let brightCardPixels = 0;
  let barAccentPixels = 0;

  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const offset = (y * width + x) * 4;
      const r = rgba[offset];
      const g = rgba[offset + 1];
      const b = rgba[offset + 2];
      total++;

      // White / very light neutral card background (Team Leader appraisal card)
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      if (minC >= 210 && maxC - minC <= 32) {
        brightCardPixels++;
      }

      // Orange/gold IV bar (0-14) or pink/red full IV bar (15)
      if (r >= 195 && r - b >= 45 && g <= 195) {
        barAccentPixels++;
      }
    }
  }

  if (total === 0) return false;
  const brightRatio = brightCardPixels / total;
  const accentRatio = barAccentPixels / total;
  // Appraisal cards have a large white surface (>= 26% of lower band) and either
  // visible colored stat bars (>= 0.8%) or a very bright empty-bar (0/0/0) card (>= 48%).
  return (brightRatio >= 0.26 && accentRatio >= 0.008) || brightRatio >= 0.48;
}

export function extractUiBandsFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): BandSignature {
  // Sample two UI-stable bands while ignoring the animated 3D Pokémon center (~19%–62% height):
  // 1) Top CP / name header band: 4%–19% height
  // 2) Bottom appraisal bars card band: 62%–94% height
  const topStart = Math.floor(height * 0.04);
  const topEnd = Math.max(topStart + 1, Math.floor(height * 0.19));
  const bottomStart = Math.floor(height * 0.62);
  const bottomEnd = Math.max(bottomStart + 1, Math.floor(height * 0.94));

  const sampleBand = (yStart: number, yEnd: number) => {
    const out = new Uint8Array((yEnd - yStart) * width);
    let idx = 0;
    for (let y = yStart; y < yEnd; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        out[idx++] = Math.round(
          0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2],
        );
      }
    }
    return out;
  };

  return {
    top: sampleBand(topStart, topEnd),
    bottom: sampleBand(bottomStart, bottomEnd),
    hasAppraisalCard: hasAppraisalOverlayFromRgba(rgba, width, height),
  };
}

export function bandMad(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let sum = 0;
  for (let i = 0; i < len; i++) sum += Math.abs(a[i] - b[i]);
  return sum / (len * 255);
}

export function signatureDifference(a: BandSignature, b: BandSignature): number {
  const topDiff = bandMad(a.top, b.top);
  const bottomDiff = bandMad(a.bottom, b.bottom);
  // Capture both overall UI shift and single-band changes (e.g. CP changed or IV bars changed).
  return Math.max(topDiff * 0.45 + bottomDiff * 0.55, Math.max(topDiff, bottomDiff) * 0.85);
}

/**
 * Selects the *last* settled frame of each novel dwell window so animated IV bars
 * have finished filling before the next swipe begins.
 */
export function selectSettledNovelIndices(
  signatures: BandSignature[],
  sensitivity: VideoSensitivity,
  maxFrames = MAX_VIDEO_FRAMES,
  options?: { appraisalOnly?: boolean },
): number[] {
  if (!signatures.length) return [];
  const appraisalOnly = options?.appraisalOnly === true;
  if (signatures.length === 1) {
    if (appraisalOnly && signatures[0].hasAppraisalCard === false) return [];
    return [0];
  }
  const { settleThreshold, noveltyThreshold } = VIDEO_SENSITIVITY_PRESETS[sensitivity];
  const kept: number[] = [];
  let lastKeptSig: BandSignature | null = null;

  // Group consecutive settled runs and emit the final index of each novel run.
  let runEnd: number | null = null;
  let runSig: BandSignature | null = null;

  const flushRun = () => {
    if (runEnd === null || !runSig || kept.length >= maxFrames) {
      runEnd = null;
      runSig = null;
      return;
    }
    if (appraisalOnly && runSig.hasAppraisalCard === false) {
      runEnd = null;
      runSig = null;
      return;
    }
    if (!lastKeptSig || signatureDifference(lastKeptSig, runSig) >= noveltyThreshold) {
      kept.push(runEnd);
      lastKeptSig = runSig;
    }
    runEnd = null;
    runSig = null;
  };

  for (let i = 1; i < signatures.length; i++) {
    if (kept.length >= maxFrames) break;
    const motion = signatureDifference(signatures[i - 1], signatures[i]);
    if (motion <= settleThreshold) {
      if (runSig && signatureDifference(runSig, signatures[i]) >= noveltyThreshold) {
        flushRun();
      }
      runEnd = i;
      runSig = signatures[i];
    } else {
      flushRun();
    }
  }
  flushRun();

  // Fallback for very short clips where frames never stabilized across two consecutive steps.
  if (!kept.length && !appraisalOnly) kept.push(Math.floor(signatures.length / 2));
  return kept;
}

function makeFrameId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function canvasToJpegFrame(
  source: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
  cropTopStatusBar: boolean,
  meta: { sourceName: string; sourceKind: 'image' | 'video'; timestampSec?: number },
): ExtractedFrame {
  const { cropY, srcW, srcH, dstW, dstH } = computeResizeDimensions(
    naturalWidth,
    naturalHeight,
    cropTopStatusBar,
  );
  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable in this browser.');
  ctx.drawImage(source, 0, cropY, srcW, srcH, 0, 0, dstW, dstH);
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return {
    id: makeFrameId(),
    sourceName: meta.sourceName,
    sourceKind: meta.sourceKind,
    timestampSec: meta.timestampSec,
    dataUrl,
    mimeType: 'image/jpeg',
    width: dstW,
    height: dstH,
    included: true,
  };
}

export async function extractImageFrame(
  file: File,
  cropTopStatusBar: boolean,
): Promise<ExtractedFrame> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not decode image "${file.name}".`));
      el.src = url;
    });
    return canvasToJpegFrame(img, img.naturalWidth, img.naturalHeight, cropTopStatusBar, {
      sourceName: file.name || 'Pasted screenshot',
      sourceKind: 'image',
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Could not seek screen recording frame.'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = timeSec;
  });
}

export async function extractVideoKeyframes(
  file: File,
  options: {
    cropTopStatusBar: boolean;
    sensitivity: VideoSensitivity;
    appraisalOnly?: boolean;
    maxFrames?: number;
    onProgress?: (progress: ExtractProgress) => void;
    signal?: AbortSignal;
  },
): Promise<ExtractedFrame[]> {
  const {
    cropTopStatusBar,
    sensitivity,
    appraisalOnly = true,
    maxFrames = MAX_VIDEO_FRAMES,
    onProgress,
    signal,
  } = options;
  const preset = VIDEO_SENSITIVITY_PRESETS[sensitivity];
  const url = URL.createObjectURL(file);

  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Could not load video "${file.name}". Try MP4, MOV, or WebM.`));
      };
      const cleanup = () => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadeddata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
      video.load();
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error(`Video "${file.name}" has no readable video track.`);

    const analysisW = 64;
    const analysisH = Math.max(64, Math.min(160, Math.round((height / width) * analysisW)));
    const analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = analysisW;
    analysisCanvas.height = analysisH;
    const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
    if (!analysisCtx) throw new Error('Canvas 2D context is unavailable in this browser.');

    const sampleTimes: number[] = [];
    if (duration <= 0.05) {
      sampleTimes.push(0);
    } else {
      const maxEnd = Math.max(0, duration - 0.05);
      for (let t = 0; t <= maxEnd; t += preset.sampleStepSec) {
        sampleTimes.push(Number(t.toFixed(3)));
      }
      if (!sampleTimes.length || maxEnd - sampleTimes[sampleTimes.length - 1] > 0.15) {
        sampleTimes.push(Number(maxEnd.toFixed(3)));
      }
    }

    // Pass 1: collect lightweight band signatures across the recording
    const signatures: BandSignature[] = [];
    for (let i = 0; i < sampleTimes.length; i++) {
      if (signal?.aborted) throw new DOMException('Extraction aborted', 'AbortError');
      await seekVideo(video, sampleTimes[i]);
      analysisCtx.drawImage(video, 0, 0, analysisW, analysisH);
      const imageData = analysisCtx.getImageData(0, 0, analysisW, analysisH);
      signatures.push(extractUiBandsFromRgba(imageData.data, analysisW, analysisH));
      onProgress?.({
        sourceName: file.name,
        phase: 'video',
        current: i + 1,
        total: sampleTimes.length,
        framesFound: 0,
      });
    }

    // Select dwell-end (last settled) frames so IV bars have finished animating.
    let chosenIndices = selectSettledNovelIndices(signatures, sensitivity, maxFrames, {
      appraisalOnly,
    });
    // If appraisal-only filter found nothing (e.g. non-standard dark theme or unusual aspect ratio),
    // gracefully fall back to all settled novel frames so the user still gets a preview.
    if (!chosenIndices.length && appraisalOnly) {
      chosenIndices = selectSettledNovelIndices(signatures, sensitivity, maxFrames, {
        appraisalOnly: false,
      });
    }

    // Pass 2: capture full-res cropped JPEGs only for the selected dwell-end keyframes
    const frames: ExtractedFrame[] = [];
    for (let j = 0; j < chosenIndices.length; j++) {
      if (signal?.aborted) throw new DOMException('Extraction aborted', 'AbortError');
      const timeSec = sampleTimes[chosenIndices[j]];
      await seekVideo(video, timeSec);
      frames.push(
        canvasToJpegFrame(video, width, height, cropTopStatusBar, {
          sourceName: file.name,
          sourceKind: 'video',
          timestampSec: timeSec,
        }),
      );
      onProgress?.({
        sourceName: file.name,
        phase: 'video',
        current: sampleTimes.length,
        total: sampleTimes.length,
        framesFound: frames.length,
      });
    }

    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function extractMediaFiles(
  files: File[],
  options: {
    cropTopStatusBar: boolean;
    sensitivity: VideoSensitivity;
    appraisalOnly?: boolean;
    maxFrames?: number;
    onProgress?: (progress: ExtractProgress) => void;
    signal?: AbortSignal;
  },
): Promise<ExtractedFrame[]> {
  const out: ExtractedFrame[] = [];
  for (let i = 0; i < files.length; i++) {
    if (options.signal?.aborted) throw new DOMException('Extraction aborted', 'AbortError');
    const file = files[i];
    if (file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name)) {
      const videoFrames = await extractVideoKeyframes(file, options);
      out.push(...videoFrames);
    } else if (
      file.type.startsWith('image/') ||
      /\.(png|jpe?g|webp|heic|heif|bmp|gif)$/i.test(file.name)
    ) {
      options.onProgress?.({
        sourceName: file.name || 'Pasted screenshot',
        phase: 'image',
        current: i + 1,
        total: files.length,
        framesFound: out.length,
      });
      const frame = await extractImageFrame(file, options.cropTopStatusBar);
      out.push(frame);
    }
  }
  return out;
}
