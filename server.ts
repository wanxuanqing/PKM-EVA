import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AppraisalConfidence,
  AppraisalGender,
  AppraisalReading,
  ScanFrameInput,
} from './src/lib/appraisalTypes.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, 'dist');
const DIST_INDEX = resolve(DIST_DIR, 'index.html');
const MAX_FRAMES_PER_REQUEST = 6;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_MODEL_ID = 'gemini-4-hydrogen';
const BACKUP_MODEL_ID = 'gemini-3.8-flash';
const RETRYABLE_STATUSES = new Set([429, 500, 503, 504]);
const MAX_RETRIES_PER_MODEL = 1;

export const APPRAISAL_SYSTEM_INSTRUCTION = `You are a precision visual reader for Pokémon GO appraisal screenshots.
Your ONLY job is to accurately read what is visible in each screenshot into structured JSON. Do NOT compute battle rankings or keep/transfer advice.

Follow these strict Pokémon GO reading rules for every image:
1. IV Bars (Attack, Defense, HP — integers 0 to 15):
   - Each stat bar is divided into 3 equal segments by TWO vertical white/gray 5-point tick dividers.
   - Completely empty bar = 0.
   - Filled exactly up to the 1st vertical divider = 5.
   - Filled exactly up to the 2nd vertical divider = 10.
   - Completely filled bright pink/red bar (full 3rd segment) = 15.
   - Within each 5-point segment, measure the fractional fill carefully (1–4 in segment 1, 6–9 in segment 2, 11–14 in segment 3).
   - If a bar boundary is ambiguous by ±1, still provide your best integer estimate AND include the field name ("attackIv", "defenseIv", or "hpIv") in uncertainFields.
2. True Species Identification (Ignore Custom Nicknames):
   - Players frequently rename Pokémon with custom nicknames (e.g., "GL #4", "98%", "Bob", "15/15/14").
   - ALWAYS determine the true Pokémon species from: (a) the Candy label (e.g., "DUSKULL CANDY" -> Duskull evolutionary family), (b) the Team Leader dialogue text, and (c) the Pokémon's visual appearance, types, and evolution stage.
   - Never copy a player nickname into speciesName.
3. Forms & Regional Variants:
   - Put regional or battle form cues into formHints (e.g., "Alolan", "Galarian", "Hisuian", "Paldean", "Origin", "Altered", "Mega", "Mega X", "Mega Y", "Primal", "Therian", "Incarnate", "Hero", "Crowned", "Dusk Mane", "Dawn Wings", "Armored", "Trash", "Sandy", "Plant", "Sunny", "Overcast", "Male", "Female").
   - Leave formHints empty for standard regular forms.
4. Visible Stats & Copy Flags:
   - Read visible CP (integer above the Pokémon) and max HP (the denominator in "123/123 HP" or single HP integer if visible; null if covered by the appraisal overlay).
   - Read gender symbol if visible: "male" (♂), "female" (♀), or "unknown" (genderless or obscured).
   - isShadow: true only if Shadow aura/purple smoke, red eyes, Shadow icon, or "PURIFY" button is visible.
   - isShiny: true only if shiny sparkles icon or unmistakable shiny coloration is visible.
   - isCostume: true only if wearing an event hat, bow, glasses, or costume.
   - isTraded: true only if a traded tag/indicator is visible.
   - isMaxBattle: true only if Dynamax/Gigantamax red clouds, Max Battle badge, or Max Moves UI is visible.
5. Unreadable / Non-Appraisal Frames:
   - If an image is NOT a Pokémon GO appraisal screen (e.g., storage grid, map, blurry mid-swipe frame, or IV bars are missing/occluded), set readable = false, explain concisely in reason, and return null for unreadable numeric/species fields. Never guess or fabricate readings.
6. Return one result object per input frame, preserving the exact frame id provided before each image.`;

const APPRAISAL_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  required: ['results'],
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: [
          'id',
          'readable',
          'reason',
          'speciesName',
          'formHints',
          'attackIv',
          'defenseIv',
          'hpIv',
          'cp',
          'hp',
          'gender',
          'isShadow',
          'isShiny',
          'isCostume',
          'isTraded',
          'isMaxBattle',
          'confidence',
          'uncertainFields',
        ],
        properties: {
          id: { type: Type.STRING },
          readable: { type: Type.BOOLEAN },
          reason: { type: Type.STRING, nullable: true },
          speciesName: { type: Type.STRING, nullable: true },
          formHints: { type: Type.ARRAY, items: { type: Type.STRING } },
          attackIv: { type: Type.INTEGER, nullable: true },
          defenseIv: { type: Type.INTEGER, nullable: true },
          hpIv: { type: Type.INTEGER, nullable: true },
          cp: { type: Type.INTEGER, nullable: true },
          hp: { type: Type.INTEGER, nullable: true },
          gender: { type: Type.STRING, enum: ['male', 'female', 'unknown'] },
          isShadow: { type: Type.BOOLEAN },
          isShiny: { type: Type.BOOLEAN },
          isCostume: { type: Type.BOOLEAN },
          isTraded: { type: Type.BOOLEAN },
          isMaxBattle: { type: Type.BOOLEAN },
          confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
          uncertainFields: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
  },
};

function sanitizeIv(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 0 && rounded <= 15 ? rounded : null;
}

function sanitizePositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

function sanitizeGender(value: unknown): AppraisalGender {
  return value === 'male' || value === 'female' ? value : 'unknown';
}

function sanitizeConfidence(value: unknown): AppraisalConfidence {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

function sanitizeReading(raw: Record<string, unknown>, fallbackId: string): AppraisalReading {
  const formHints = Array.isArray(raw.formHints)
    ? raw.formHints.filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
    : [];
  const uncertainFields = Array.isArray(raw.uncertainFields)
    ? raw.uncertainFields.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    : [];
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : fallbackId,
    readable: raw.readable === true,
    reason: typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim() : null,
    speciesName:
      typeof raw.speciesName === 'string' && raw.speciesName.trim() ? raw.speciesName.trim() : null,
    formHints,
    attackIv: sanitizeIv(raw.attackIv),
    defenseIv: sanitizeIv(raw.defenseIv),
    hpIv: sanitizeIv(raw.hpIv),
    cp: sanitizePositiveInt(raw.cp),
    hp: sanitizePositiveInt(raw.hp),
    gender: sanitizeGender(raw.gender),
    isShadow: raw.isShadow === true,
    isShiny: raw.isShiny === true,
    isCostume: raw.isCostume === true,
    isTraded: raw.isTraded === true,
    isMaxBattle: raw.isMaxBattle === true,
    confidence: sanitizeConfidence(raw.confidence),
    uncertainFields,
  };
}

export function validateScanFrames(body: unknown): { frames?: ScanFrameInput[]; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Request body must be a JSON object.' };
  const rawFrames = (body as { frames?: unknown }).frames;
  if (!Array.isArray(rawFrames) || rawFrames.length === 0) {
    return { error: 'Provide at least one frame in the "frames" array.' };
  }
  if (rawFrames.length > MAX_FRAMES_PER_REQUEST) {
    return { error: `Too many frames: maximum ${MAX_FRAMES_PER_REQUEST} frames per request.` };
  }
  const frames: ScanFrameInput[] = [];
  for (let i = 0; i < rawFrames.length; i++) {
    const item = rawFrames[i] as Record<string, unknown> | null;
    if (!item || typeof item !== 'object') {
      return { error: `Frame at index ${i} must be an object.` };
    }
    const { id, imageBase64, mimeType } = item;
    if (typeof id !== 'string' || !id.trim()) {
      return { error: `Frame at index ${i} is missing a valid string "id".` };
    }
    if (typeof imageBase64 !== 'string' || imageBase64.trim().length < 16) {
      return { error: `Frame "${id}" is missing valid base64 image data.` };
    }
    if (typeof mimeType !== 'string' || !ALLOWED_MIME_TYPES.has(mimeType)) {
      return { error: `Frame "${id}" has unsupported mimeType "${String(mimeType)}".` };
    }
    frames.push({ id: id.trim(), imageBase64: imageBase64.trim(), mimeType });
  }
  return { frames };
}

export type GeminiScannerFn = (frames: ScanFrameInput[]) => Promise<AppraisalReading[]>;

export async function runWithModelFallback<T>(
  models: string[],
  invoke: (modelId: string) => Promise<T>,
  options?: { retriesPerModel?: number; delayMs?: number },
): Promise<{ result: T; modelUsed: string }> {
  const uniqueModels = [...new Set(models.map((m) => m.trim()).filter(Boolean))];
  const retries = options?.retriesPerModel ?? MAX_RETRIES_PER_MODEL;
  const baseDelay = options?.delayMs ?? 1000;
  let lastError: unknown;

  for (let mIndex = 0; mIndex < uniqueModels.length; mIndex++) {
    const modelId = uniqueModels[mIndex];
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await invoke(modelId);
        return { result, modelUsed: modelId };
      } catch (err) {
        lastError = err;
        const { status } = extractApiError(err);
        if (!RETRYABLE_STATUSES.has(status)) {
          // Non-transient errors (e.g. 400 bad request, 401/403 invalid key) fail immediately.
          throw err;
        }
        if (attempt < retries) {
          const jitter = baseDelay > 0 ? Math.floor(Math.random() * 250) : 0;
          if (baseDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, baseDelay * (attempt + 1) + jitter));
          }
          continue;
        }
        if (mIndex < uniqueModels.length - 1) {
          console.warn(
            `[PKM-EVA] ${modelId} returned HTTP ${status}; falling back to backup model ${uniqueModels[mIndex + 1]}.`,
          );
        }
      }
    }
  }
  throw lastError;
}

async function scanWithGemini(frames: ScanFrameInput[]): Promise<AppraisalReading[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured on the server.') as Error & {
      status?: number;
    };
    err.status = 503;
    throw err;
  }

  const ai = new GoogleGenAI({ apiKey });
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    {
      text: `Analyze the following ${frames.length} Pokémon GO screenshot(s) and return one structured result per frame in the exact same order, using the exact frame id shown before each image.`,
    },
  ];
  for (const frame of frames) {
    parts.push({ text: `Frame id: ${frame.id}` });
    parts.push({ inlineData: { data: frame.imageBase64, mimeType: frame.mimeType } });
  }

  const primaryModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL_ID;
  const backupModel = process.env.GEMINI_BACKUP_MODEL?.trim() || BACKUP_MODEL_ID;
  const { result: response } = await runWithModelFallback([primaryModel, backupModel], (modelId) =>
    ai.models.generateContent({
      model: modelId,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: APPRAISAL_SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: APPRAISAL_RESPONSE_SCHEMA,
      },
    }),
  );

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini returned malformed JSON.');
  }

  const rawResults = (parsed as { results?: unknown })?.results;
  if (!Array.isArray(rawResults)) {
    throw new Error('Gemini response did not include a results array.');
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const item of rawResults) {
    if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      byId.set((item as { id: string }).id, item as Record<string, unknown>);
    }
  }

  return frames.map((frame, index) => {
    const matched =
      byId.get(frame.id) ??
      (rawResults[index] && typeof rawResults[index] === 'object'
        ? (rawResults[index] as Record<string, unknown>)
        : null);
    if (!matched) {
      throw new Error(`Gemini response omitted frame "${frame.id}".`);
    }
    return sanitizeReading(matched, frame.id);
  });
}

function extractApiError(error: unknown): { status: number; message: string } {
  if (error && typeof error === 'object') {
    const err = error as { status?: unknown; code?: unknown; message?: unknown };
    let statusCandidate =
      typeof err.status === 'number' ? err.status : typeof err.code === 'number' ? err.code : 502;
    let message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Gemini appraisal scan failed.';

    // @google/genai ApiError often embeds raw JSON like {"error":{"code":503,"message":"..."}}.
    if (message.startsWith('{')) {
      try {
        const parsed = JSON.parse(message) as {
          error?: { code?: unknown; message?: unknown };
          message?: unknown;
        };
        if (typeof parsed.error?.code === 'number') statusCandidate = parsed.error.code;
        if (typeof parsed.error?.message === 'string' && parsed.error.message.trim()) {
          message = parsed.error.message.trim();
        } else if (typeof parsed.message === 'string' && parsed.message.trim()) {
          message = parsed.message.trim();
        }
      } catch {
        /* keep raw message */
      }
    }

    const status = statusCandidate >= 400 && statusCandidate < 600 ? statusCandidate : 502;
    return { status, message };
  }
  return { status: 502, message: 'Gemini appraisal scan failed.' };
}

export async function handleScanAppraisal(
  body: unknown,
  scanner: GeminiScannerFn = scanWithGemini,
): Promise<{ status: number; body: { results: AppraisalReading[] } | { error: string } }> {
  const { frames, error } = validateScanFrames(body);
  if (error || !frames) {
    return { status: 400, body: { error: error ?? 'Invalid scan request.' } };
  }
  try {
    const results = await scanner(frames);
    return { status: 200, body: { results } };
  } catch (err) {
    const { status, message } = extractApiError(err);
    return { status, body: { error: message } };
  }
}

export async function createServerApp(options?: {
  mode?: 'development' | 'production' | 'api-only';
  scanner?: GeminiScannerFn;
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16mb' }));

  const scanner = options?.scanner ?? scanWithGemini;

  app.post('/api/scan-appraisal', async (req: Request, res: Response) => {
    const result = await handleScanAppraisal(req.body, scanner);
    res.status(result.status).json(result.body);
  });

  // Return JSON errors for malformed JSON or oversized payloads on /api routes.
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/')) {
      next(err);
      return;
    }
    const typed = err as { status?: number; type?: string; message?: string };
    if (typed?.type === 'entity.too.large' || typed?.status === 413) {
      res.status(413).json({ error: 'Scan payload exceeds the 16 MB request limit.' });
      return;
    }
    if (typed?.status === 400) {
      res.status(400).json({ error: typed.message || 'Invalid JSON request body.' });
      return;
    }
    next(err);
  });

  const inferredMode =
    options?.mode ??
    (process.env.NODE_ENV === 'production'
      ? 'production'
      : process.env.NODE_ENV === 'development'
        ? 'development'
        : process.execArgv.some((arg) => arg.includes('tsx')) || !existsSync(DIST_INDEX)
          ? 'development'
          : 'production');

  if (inferredMode === 'development') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (inferredMode === 'production') {
    app.use(
      express.static(DIST_DIR, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (
            filePath.includes(`${resolve(DIST_DIR, 'assets')}`) ||
            filePath.includes(`${resolve(DIST_DIR, 'data')}`)
          ) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(DIST_INDEX);
    });
  }

  return app;
}

const isMain =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  const host = '0.0.0.0';
  const app = await createServerApp();
  app.listen(port, host, () => {
    console.log(`PKM-EVA server listening on http://${host}:${port}`);
  });
}
