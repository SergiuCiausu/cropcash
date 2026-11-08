/* Every key the app saves on the phone, in one place. The formats are the ones web/legacy/app.js
   writes, so a legacy page and a React page read each other's data across a page load.
   Ion's example farm (/ferma-lui-ion) keeps its own copies under cropcash-demo-*, so it never mixes
   with a real farm (docs/13-auth-demo-loading-plan.md §A3). Everything starts with "cropcash", so
   sign-out (clearFarmData) clears it all. */

import { storageKey, type Mode } from '../paths';

export type { Mode };

/** The part of localStorage the app uses. Tests pass a Map-backed copy. */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** All keys, to find the Supabase session. */
  keys(): string[];
}

/** Keys only a signed-in farm uses (the demo never reads them), plus the currency, which both modes share. */
export const KEYS = {
  me: 'cropcash-me',
  meAt: 'cropcash-me-at',
  outbox: 'cropcash-outbox',
  refused: 'cropcash-outbox-refused',
  sent: 'cropcash-outbox-sent',
  monitor: 'cropcash-monitor',
  currency: 'cropcash-currency',
  rates: 'cropcash-rates',
} as const;

/** Keys that hold the farm's own choices, one set per mode (storageKey, the rule app.js uses too). */
export function farmKeys(mode: Mode) {
  return {
    harvests: storageKey('cropcash-harvests', mode),
    pension: storageKey('cropcash-pension', mode),
    follows: storageKey('cropcash-follows', mode),
    done: storageKey('cropcash-done', mode),
  };
}

/** Keys a single page or panel uses, one set per mode. */
export function pageKeys(mode: Mode) {
  return {
    assistant: storageKey('cropcash-assistant', mode),
    paperOk: storageKey('cropcash-paper-ok', mode),
    pensionCompare: storageKey('cropcash-pension-compare', mode),
    sourceKey: storageKey('cropcash-source-key', mode),
    mySources: storageKey('cropcash-my-sources', mode),
  };
}

export const SESSION_KEY = /^sb-.*-auth-token/;

/** Storage can be blocked (private window, full disk). Then nothing is read and nothing breaks. */
export function readJson<T = unknown>(store: KeyStore, key: string): T | null {
  try {
    const raw = store.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function readText(store: KeyStore, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when the browser refused, so the caller can keep the value for this visit. */
export function writeJson(store: KeyStore, key: string, value: unknown): boolean {
  return writeText(store, key, JSON.stringify(value));
}

export function writeText(store: KeyStore, key: string, value: string): boolean {
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function remove(store: KeyStore, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    /* nothing was saved */
  }
}

export function hasSession(store: KeyStore): boolean {
  try {
    return store.keys().some((k) => SESSION_KEY.test(k));
  } catch {
    return false;
  }
}

/** Drops the session and the farm copy after a 401, as app.js's forgetSession does. */
export function forgetSession(store: KeyStore): void {
  for (const key of safeKeys(store)) if (key === KEYS.me || SESSION_KEY.test(key)) remove(store, key);
}

function safeKeys(store: KeyStore): string[] {
  try {
    return store.keys();
  } catch {
    return [];
  }
}

/** The browser's localStorage as a KeyStore. */
export function browserStore(): KeyStore {
  return {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
    keys: () => Object.keys(localStorage),
  };
}

/** An in-memory KeyStore, for tests. */
export function memoryStore(initial: Record<string, string> = {}): KeyStore & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
    dump: () => Object.fromEntries(map),
  };
}
