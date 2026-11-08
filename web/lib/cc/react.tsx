'use client';
/* React's way into the store: <FarmProvider> creates and starts it, and the hooks read it with
   useSyncExternalStore. The static HTML is built with ready = false, so it holds no farm figures,
   and the phone fills them in from storage straight away (offline too). */
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { loadData } from '../../../packages/shared/src/data/index';
import * as Live from '../live/index';
import { moneyFormat, type MoneyFormat } from './currency';
import type { FarmState } from './farm';
import type { MonitorSnapshot, MonitorView } from './monitor';
import { followedCalls } from './monitor';
import { viewFor, type FarmView, type Scope } from './plan';
import { browserStore, type Mode } from './storage';
import { createStore, type FarmStore, type LiveCalls, type StoreState } from './store';

const StoreContext = createContext<FarmStore | null>(null);

function makeStore(mode: Mode, snapshot?: MonitorSnapshot): FarmStore {
  const { apiUrl } = Live.publicConfig();
  return createStore({
    mode,
    store: browserStore(),
    data: loadData(),
    live: { api: Live.api, read: Live.read as unknown as LiveCalls['read'], write: Live.write, refreshSession: () => Live.auth().refresh().then(Boolean), markOutboxOwner: Live.markOutboxOwner },
    net: {
      apiUrl,
      browserOnline: () => navigator.onLine,
      fetchFn: (...args) => fetch(...args),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    },
    snapshot,
  });
}

/** The app opens without internet: the service worker keeps every page on the phone (scripts/write-sw.mjs). */
function installOffline() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  navigator.storage?.persist?.().catch(() => undefined);
}

/** `store` is for tests: a store made with fakes instead of the browser's storage and the API. */
export function FarmProvider({ mode, snapshot, store: given, children }: { mode: Mode; snapshot?: MonitorSnapshot; store?: FarmStore; children: ReactNode }) {
  /* Made on the phone only: the static build has no storage. */
  const [store, setStore] = useState<FarmStore | null>(null);
  useEffect(() => {
    const s = given ?? makeStore(mode, snapshot);
    setStore(s);
    void s.start();
    if (!given) installOffline();
    const online = () => void s.browserOnline();
    const offline = () => s.browserOffline();
    addEventListener('online', online);
    addEventListener('offline', offline);
    const visible = () => {
      if (document.visibilityState === 'visible') void s.phoneBack();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      removeEventListener('online', online);
      removeEventListener('offline', offline);
      s.stop();
    };
  }, [mode, snapshot, given]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

const NOT_READY: StoreState = { ready: false, online: true, version: 0, farm: null, monitor: { fromServer: false, at: null, calls: [], events: [], sources: [], problems: [], changes: [] } };
const noop = () => () => undefined;

/** The store's actions (send, selectHarvest, setFollow, …). Null before the phone has read storage. */
export function useStore(): FarmStore | null {
  return useContext(StoreContext);
}

/** The whole state. Re-renders on every change. */
export function useFarmState(): StoreState {
  const store = useStore();
  return useSyncExternalStore(store?.subscribe ?? noop, store?.getState ?? (() => NOT_READY), () => NOT_READY);
}

/** The farm as read from storage, or null before it's read (and in farm mode with no farm copy). */
export function useFarm(): FarmState | null {
  return useFarmState().farm;
}

/**
 * The plan and every figure, for this page's scope: 'farm' for whole-farm pages (Acasă, Salariu,
 * Bani, …), 'picked' for pages that follow the harvest picker. Null until there is a farm.
 */
export function useView(scope: Scope): FarmView | null {
  const farm = useFarm();
  return useMemo(() => (farm?.baseFarm ? viewFor(farm, scope) : null), [farm, scope]);
}

/** Amounts in the currency the farmer picked. Lei until the farm is read. */
export function useMoney(): MoneyFormat {
  const farm = useFarm();
  return useMemo(() => moneyFormat(farm?.currency ?? { code: 'RON', rates: null }), [farm]);
}

export function useOnline(): boolean {
  return useFarmState().online;
}

/** Calls, sources and changes, from the farm's copy or the snapshot, plus the followed calls. */
export function useMonitor(): MonitorView & { follows: Set<string>; followed: ReturnType<typeof followedCalls> } {
  const { farm, monitor } = useFarmState();
  return useMemo(
    () => ({ ...monitor, follows: new Set(farm?.follows ?? []), followed: followedCalls(farm?.meSaved ?? null, farm?.follows ?? [], monitor.calls) }),
    [farm, monitor],
  );
}

/** Reads the monitor again on the pages that show it (at most once an hour). */
export function useMonitorRefresh() {
  const store = useStore();
  const ready = useFarmState().ready;
  useEffect(() => {
    if (store && ready) void store.refreshMonitor().catch(() => undefined);
  }, [store, ready]);
}
