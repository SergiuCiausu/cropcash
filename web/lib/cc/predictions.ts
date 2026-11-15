/* The admin panel's published changes to docs/data, on the phone (docs/admin-panel-plan.md step 5).
   The phone keeps the last version it read, so the forecasts stay the same without internet; with no
   copy it uses docs/data as built in. Only a signed-in farm reads them: Ion's farm without an account
   (/ferma-lui-ion) never calls the API and always shows the files' figures. */
import {
  applyValidOverrides,
  PredictionDataSchema,
  type AppData,
  type PredictionData,
} from '../../../packages/shared/src/data/index';
import { KEYS, readJson, writeJson, type KeyStore } from './storage';

export interface PredictionCopy extends PredictionData {
  /** When the phone read it (ISO time). */
  at: string;
}

/** The copy on the phone, or null when there's none or it's not one this app wrote. */
export function readPredictions(store: KeyStore): PredictionCopy | null {
  const raw = readJson<Record<string, unknown>>(store, KEYS.predictions);
  const parsed = PredictionDataSchema.safeParse(raw);
  return parsed.success && typeof raw?.at === 'string' ? { ...parsed.data, at: raw.at } : null;
}

export function savePredictions(store: KeyStore, data: PredictionData, now: Date): boolean {
  return writeJson(store, KEYS.predictions, { ...data, at: now.toISOString() });
}

/** What the API answered, or null when it's not that shape (an old API, a proxy page). */
export function parsePredictionData(body: unknown): PredictionData | null {
  const parsed = PredictionDataSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/**
 * docs/data with the published changes on top. A change that doesn't fit this build's docs/data
 * (the API is newer or older than the app) is left out; anything unexpected falls back to the files,
 * so the farmer always sees a plan.
 */
export function withPredictions(base: AppData, copy: PredictionCopy | null): AppData {
  if (!copy || copy.overrides.length === 0) return base;
  try {
    return applyValidOverrides(copy.overrides).data;
  } catch {
    return base;
  }
}
