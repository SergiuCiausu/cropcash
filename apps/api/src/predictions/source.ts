import { applyValidOverrides, loadData, type AppData, type Override } from '@cropcash/shared';
import type { CurrentOverrides, PredictionStore } from '../db/predictions';

/*
 * The data every forecast in the API uses: docs/data with the admin panel's published changes on top
 * (docs/admin-panel-plan.md). It starts as the files alone, reads the published version at boot,
 * after each publish and every few minutes (another API process may have published), and keeps the
 * last good version when Supabase can't be reached.
 */

export interface Rejected {
  path: string;
  code: string;
  message: string;
}

export interface DataSource {
  /** The data in force now. */
  current(): AppData;
  /** The published version it holds, 0 = the files as written. */
  version(): number;
  /** The changes of that version that apply. */
  overrides(): Override[];
  /** Published changes that no longer apply to docs/data (a file changed since), left out. */
  rejected(): Rejected[];
  /** Reads the published version; a no-op when it's the one held. Never throws. */
  refresh(): Promise<void>;
  /** Refreshes now and then every `everyMs`. Returns a stop function. */
  start(everyMs: number): Promise<() => void>;
}

export interface DataSourceDeps {
  store: Pick<PredictionStore, 'current'>;
  log?: (message: string) => void;
}

export function createDataSource({ store, log = (m) => console.warn(`[predictions] ${m}`) }: DataSourceDeps): DataSource {
  let state: { version: number; data: AppData; overrides: Override[]; rejected: Rejected[] } = {
    version: 0,
    data: loadData(),
    overrides: [],
    rejected: [],
  };
  let running: Promise<void> | null = null;

  const take = ({ version, overrides }: CurrentOverrides) => {
    const { data, applied, rejected } = applyValidOverrides(overrides);
    state = {
      version,
      data,
      overrides: applied,
      rejected: rejected.map(({ override, error }) => ({ path: override.path, code: error.code, message: error.message })),
    };
    for (const r of state.rejected) log(`version ${version}: left out ${r.message} (${r.code})`);
  };

  const refresh = () => {
    // Overlapping calls (a publish during the timer's read) share one read.
    running ??= (async () => {
      try {
        const published = await store.current();
        if (published.version !== state.version) take(published);
      } catch (e) {
        log(`could not read the published version, keeping ${state.version}: ${(e as Error).message}`);
      } finally {
        running = null;
      }
    })();
    return running;
  };

  return {
    current: () => state.data,
    version: () => state.version,
    overrides: () => state.overrides,
    rejected: () => state.rejected,
    refresh,
    async start(everyMs) {
      await refresh();
      const timer = setInterval(() => void refresh(), everyMs);
      timer.unref?.();
      return () => clearInterval(timer);
    },
  };
}

/**
 * An AppData whose every field is read from the source at the moment it's read. The routers, the
 * Stripe salary and the assistant keep the `data` they were built with and still see a new version
 * the moment it's published. Nothing in the API or packages/shared keeps AppData by identity
 * (no WeakMap or memo on it), so this is safe; the proxy also spreads like a plain object.
 */
export function liveData(source: Pick<DataSource, 'current'>): AppData {
  const now = () => source.current() as unknown as Record<PropertyKey, unknown>;
  return new Proxy({} as AppData, {
    get: (_t, key) => now()[key],
    has: (_t, key) => key in now(),
    ownKeys: () => Reflect.ownKeys(now()),
    getOwnPropertyDescriptor: (_t, key) => {
      const d = Reflect.getOwnPropertyDescriptor(now(), key);
      return d ? { ...d, configurable: true } : undefined;
    },
    set: () => false,
    deleteProperty: () => false,
    defineProperty: () => false,
  });
}
