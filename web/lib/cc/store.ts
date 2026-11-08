/* The farm the pages show, and every change to it. This replaces web/legacy/app.js's top level:
   app.js read storage once per page load and called location.reload() after a change; the store
   writes storage the same way, then reads it again and tells React. So a React page and a legacy
   page always agree, and nothing reloads.
   Plain TypeScript with no React and no DOM, so it's tested in Node (store.test.ts). */
import type { AppData } from '../../../packages/shared/src/data/index';
import type { CurrencyCode, ExchangeRates } from '../../../packages/shared/src/currency/index';
import { farmChange, farmEdit, harvestsDocument } from '../live/farm';
import { newIntentKey } from '../live/intent';
import { afterFailedSend, classifyFlushError, enqueue, isOutboxId, isQueueable, msUntilNextTry, readSent, rememberSent, sameDocument, takeBack, withClientIds, withOutboxLock, type OutboxItem } from '../live/outbox';
import { isMoneyMove, moneyOutcome, type MoneyMove } from '../live/money-check';
import type { ApiInit } from '../live/client';
import type { WriteOptions } from '../live/functions';
import { saveCurrency, saveRates } from './currency';
import { readFarmState, type FarmState, type MeFarm } from './farm';
import { currentHarvest, saveHarvests, type HarvestState } from './harvests';
import { EMPTY_SNAPSHOT, fetchMonitor, isFresh, monitorChanged, monitorView, type MonitorSnapshot, type MonitorView } from './monitor';
import { createNet, type NetDeps } from './net';
import { DEMO_KEY_PREFIX } from '../paths';
import type { DocumentReading } from '../../../packages/shared/src/documents/index';
import { farmKeys, forgetSession, KEYS, readJson, remove, writeJson, writeText, type KeyStore, type Mode } from './storage';

/** The part of web/lib/live the store calls. Tests pass fakes. */
export interface LiveCalls {
  api<T = unknown>(path: string, init?: ApiInit): Promise<T>;
  read<T = unknown>(name: string, input?: unknown): Promise<{ data?: T[] | null } & Record<string, unknown>>;
  /** `options.key` is the intent key, sent as Idempotency-Key (docs/idempotency-plan.md, M1). */
  write<T = unknown>(name: string, input?: unknown, options?: WriteOptions): Promise<T>;
  /** Renews an expired session; true when there is a new one. A call that got a 401 is then tried once more. */
  refreshSession?(): Promise<boolean>;
  /** Marks whose outbox this phone holds, so another account never sends it. */
  markOutboxOwner?(): void;
}

export interface StoreDeps {
  mode: Mode;
  store: KeyStore;
  /** docs/data, loaded once. */
  data: AppData;
  live: LiveCalls;
  net: NetDeps;
  /** The 7 Nov monitor snapshot, for the demo and before the first read. */
  snapshot?: MonitorSnapshot;
  now?: () => Date;
  randomId?: () => string;
}

export interface StoreState {
  /** False until the store has read storage on the phone. The static HTML renders with false. */
  ready: boolean;
  online: boolean;
  /** Goes up on every change, so a page can reset UI state that assumed a fresh load. */
  version: number;
  farm: FarmState | null;
  monitor: MonitorView;
}

/** What a page's change gets: the same write as Live, the API, and nothing when offline. */
export interface SendTools {
  write<T = unknown>(name: string, input?: Record<string, unknown>, options?: WriteOptions): Promise<T | { queued: true }>;
  api<T = unknown>(path: string, init?: ApiInit): Promise<T>;
  read: LiveCalls['read'];
}

const offlineError = () => Object.assign(new Error('offline'), { code: 'offline' });
const demoError = () => Object.assign(new Error('demo'), { code: 'demo' });
const errorCode = (e: unknown) => (e as { code?: string } | null)?.code;
const errorStatus = (e: unknown) => (e as { status?: number } | null)?.status ?? 0;

export function createStore(deps: StoreDeps) {
  const { mode, store, data, live } = deps;
  const now = deps.now ?? (() => new Date());
  const randomId = deps.randomId ?? newIntentKey;
  const snapshot = deps.snapshot ?? EMPTY_SNAPSHOT;
  const listeners = new Set<() => void>();

  let state: StoreState = { ready: false, online: deps.net.browserOnline(), version: 0, farm: null, monitor: monitorView(null, snapshot) };

  const set = (patch: Partial<StoreState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  /** Reads storage again: what location.reload() did in app.js. */
  function reload() {
    const farm = readFarmState(mode, store, data, now());
    set({ ready: true, farm, version: state.version + 1, monitor: monitorView(farm.monitor, snapshot) });
  }

  const net = createNet(deps.net, (online) => {
    set({ online });
    if (online) void flushOutbox();
  });

  const farmOrThrow = () => {
    if (!state.farm) throw new Error('The store has not started.');
    return state.farm;
  };

  /** A 401 may only mean the session expired: renew it and try the call once more. */
  const withFreshSession = async <T,>(call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (e) {
      if (errorStatus(e) !== 401 || !(await deps.live.refreshSession?.())) throw e;
      return call();
    }
  };

  const saveCopy = (farmer: MeFarm) => {
    writeJson(store, KEYS.me, farmer);
    writeText(store, KEYS.meAt, now().toISOString());
  };

  /* ---- The farm copy ---- */

  /** Checks the saved copy against the server. Reads storage again only when the farm really changed. */
  async function refreshFarm(): Promise<void> {
    if (mode === 'demo') return;
    try {
      const { farmer } = await withFreshSession(() => live.api<{ farmer: MeFarm | null }>('/api/me'));
      if (!farmer) {
        if (readJson(store, KEYS.me)) {
          remove(store, KEYS.me);
          reload();
        }
        return;
      }
      const change = farmChange(readJson<MeFarm>(store, KEYS.me), farmer);
      saveCopy(farmer);
      if (change !== 'none') reload();
    } catch (e) {
      if (errorStatus(e) === 401) {
        forgetSession(store);
        reload();
      }
    }
  }

  /* ---- Writing to the server ---- */

  const outbox = (): OutboxItem[] => farmOrThrow().outbox;
  const writeOutbox = (items: OutboxItem[]) => writeJson(store, KEYS.outbox, items);
  const queued = () => readJson<OutboxItem[]>(store, KEYS.outbox) ?? [];
  const sentItems = () => readSent(readJson(store, KEYS.sent), now().getTime());
  const queue = (name: string, input: Record<string, unknown>, options: { version?: number | null } = {}) =>
    withOutboxLock(() => {
      const item: OutboxItem = { id: `outbox:${now().getTime()}-${randomId().replace(/-/g, '').slice(0, 6)}`, name: name as OutboxItem['name'], input, at: now().toISOString(), ...(options.version != null ? { version: options.version } : {}) };
      writeOutbox(enqueue(queued(), item));
      deps.live.markOutboxOwner?.();
      return { queued: true as const };
    });

  /* A money move with no answer may have happened, so "try again" could be the wrong advice. The
     farm itself says which: done counts as done, not done says so, and if even that can't be read
     the farmer is told we don't know yet and the button stays off (FAIL-03). */
  async function moneyAnswerLost(name: MoneyMove, input: Record<string, unknown>, e: unknown, markWrote: () => void) {
    const failure = e as { moneyMove?: boolean; unknownOutcome?: boolean };
    failure.moneyMove = true;
    const status = errorStatus(e);
    const code = errorCode(e);
    if (!(status === 0 && (code === 'network' || code === 'timeout')) && !(status >= 500)) throw e;
    let farmer: MeFarm | null = null;
    try {
      ({ farmer } = await live.api<{ farmer: MeFarm | null }>('/api/me'));
    } catch {
      failure.unknownOutcome = true;
      throw e;
    }
    const before = readJson<MeFarm>(store, KEYS.me);
    if (farmer && before && moneyOutcome(name, input, before, farmer) === 'done') {
      markWrote();
      return { already: true };
    }
    throw Object.assign(new Error('money_not_done'), { status: 0, code: 'money_not_done', moneyMove: true });
  }

  /**
   * Runs a page's change. A write the outbox can take waits there without internet; any other one is
   * refused with code "offline". After a write the farm copy is fetched again, then storage is read
   * again, so the page shows the change. In the demo nothing reaches the server (code "demo").
   */
  async function send(action: (tools: SendTools) => Promise<unknown> | unknown): Promise<void> {
    if (mode === 'demo') throw demoError();
    const online = net.isOnline();
    let wrote = false;
    const write: SendTools['write'] = async (name, input = {}, options = {}) => {
      /* One id per sale or expense. A form sets it when the farmer starts the record and keeps it on
         a retry; this is the fallback for a caller that didn't. The queue sends it as it is. */
      if ((name === 'record_sale' || name === 'add_expense') && !input.clientId) input = { ...input, clientId: randomId() };
      /* A record still in the queue is taken back on the phone, with or without internet. */
      if (name === 'undo_transaction' && isOutboxId(input.id)) {
        const id = input.id;
        const serverId = await withOutboxLock(() => {
          const back = takeBack(queued(), sentItems(), id);
          writeOutbox(back.items);
          return back.serverId;
        });
        /* Another tab sent it meanwhile, so it is taken back from the server. */
        if (!serverId) return {} as never;
        input = { ...input, id: serverId };
      }
      if (!online) {
        if (isQueueable(name)) return queue(name, input, options);
        throw offlineError();
      }
      try {
        const result = await withFreshSession(() => live.write(name, input, options));
        wrote = true;
        return result as never;
      } catch (e) {
        const code = errorCode(e);
        if (code === 'network' || code === 'timeout') void net.ping();
        /* A plan save that timed out may have landed, and repeating it would look like someone else's change. */
        const lost = code === 'network' || code === 'offline' || (code === 'timeout' && name !== 'save_harvests' && name !== 'update_farm');
        if (isQueueable(name) && lost) return queue(name, input, options);
        if (isMoneyMove(name)) return (await moneyAnswerLost(name, input, e, () => { wrote = true; })) as never;
        throw e;
      }
    };
    const api: SendTools['api'] = (path, init) => {
      if (!online) throw offlineError();
      wrote = true;
      return withFreshSession(() => live.api(path, init));
    };
    const read: SendTools['read'] = (name, input) => {
      if (!online) throw offlineError();
      return withFreshSession(() => live.read(name, input));
    };
    try {
      await action({ write, api, read });
      /* The save worked, so failing to fetch the new figures is no reason to say it didn't. The page
         shows the old ones until the next load, which fetches them again (FAIL-02). */
      if (wrote) {
        try {
          const { farmer } = await live.api<{ farmer: MeFarm | null }>('/api/me');
          if (farmer) saveCopy(farmer);
        } catch {
          remove(store, KEYS.meAt);
        }
      }
    } finally {
      reload();
    }
  }

  /** Sends the queue in order. One the server turns down is kept aside, so the farmer hears about it. */
  let flushing = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flushLater = (ms: number) => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => void flushOutbox(), ms);
  };
  /* A save that landed but lost its answer comes back as "changed": the server already has this exact plan. */
  async function alreadySaved(item: OutboxItem, e: unknown) {
    if (errorCode(e) !== 'changed_elsewhere' || item.name !== 'save_harvests') return false;
    try {
      const { farmer } = await live.api<{ farmer: MeFarm | null }>('/api/me');
      return sameDocument(farmer?.harvests as never, item.input as never);
    } catch {
      return false;
    }
  }
  async function flushOutbox(): Promise<void> {
    if (mode === 'demo' || flushing || !readJson(store, KEYS.me) || !net.isOnline()) return;
    const pending = queued;
    if (!pending().length) return;
    const wait = msUntilNextTry(pending(), now().getTime());
    if (wait > 0) return flushLater(wait);
    flushing = true;
    let changed = false;
    let retryNoted = false;
    try {
      /* Held for the whole send: another tab waits, then finds the queue empty. */
      await withOutboxLock(async () => {
        const filled = withClientIds(pending(), randomId);
        if (filled.changed) writeOutbox(filled.items);
        for (const item of pending()) {
          let answer: unknown;
          try {
            answer = await withFreshSession(() => live.write(item.name, item.input, item.version != null ? { version: item.version } : {}));
          } catch (e) {
            /* Signed out: it waits as it is, and goes when the farmer signs in again. */
            if (errorStatus(e) === 401) break;
            if (!(await alreadySaved(item, e))) {
              if (classifyFlushError(e) === 'retry') {
                const later = afterFailedSend(item, e, now().getTime());
                if (later) {
                  writeOutbox(pending().map((i) => (i.id === item.id ? later : i)));
                  flushLater(Math.max(later.nextAt! - now().getTime(), 0));
                  retryNoted = true;
                  break;
                }
              }
              writeOutbox(pending().filter((i) => i.id !== item.id));
              writeJson(store, KEYS.refused, [...(readJson<OutboxItem[]>(store, KEYS.refused) ?? []), item]);
              changed = true;
              continue;
            }
          }
          writeJson(store, KEYS.sent, rememberSent(sentItems(), item, answer, now().getTime()));
          writeOutbox(pending().filter((i) => i.id !== item.id));
          changed = true;
        }
      });
      if (changed) {
        const { farmer } = await live.api<{ farmer: MeFarm | null }>('/api/me');
        if (farmer) saveCopy(farmer);
      }
    } catch {
      /* tried again when the internet comes back */
    } finally {
      flushing = false;
    }
    if (changed || retryNoted) reload();
  }

  /* ---- Harvests ---- */

  const harvestsOf = () => {
    const h = farmOrThrow().harvests;
    if (!h) throw new Error('No farm to change.');
    return h;
  };

  /** Saves the harvests: on the server for a signed-in farm, on the phone otherwise. */
  async function saveAllHarvests(next: HarvestState) {
    const farm = farmOrThrow();
    const me = farm.me;
    if (!me) {
      saveHarvests(store, mode, false, next);
      return reload();
    }
    /* The year under way is the real farm, so a change there reaches its parcels and balance too. */
    await send(async ({ write, api }) => {
      saveHarvests(store, mode, true, next);
      const change = farmEdit(me, currentHarvest(next, farm.baseYear), farm.farmData);
      try {
        await write('save_harvests', harvestsDocument(next) as unknown as Record<string, unknown>, { version: me.harvests_version });
      } catch (e) {
        /* Another phone saved first. Its figures come in, and send() redraws the page with them. */
        if (errorCode(e) === 'changed_elsewhere') {
          const { farmer } = await api<{ farmer: MeFarm | null }>('/api/me');
          if (farmer) saveCopy(farmer);
        }
        throw e;
      }
      if (change) await write('update_farm', change as unknown as Record<string, unknown>);
    });
  }

  /**
   * Changes the harvests on a copy, then saves them. Recolte's edits, closing and reopening a project
   * (closeProject from the page's view, reopenProject from plan.ts) all go through here.
   */
  function updateHarvests(change: (draft: HarvestState) => void) {
    const draft = structuredClone(harvestsOf());
    change(draft);
    return saveAllHarvests(draft);
  }

  /** Picks a harvest, and a crop in it. Only the choice is saved; it's never sent. */
  function selectHarvest(id: string, cropId: string | null = null) {
    const farm = farmOrThrow();
    saveHarvests(store, mode, !!farm.me, { ...harvestsOf(), selected: id, crop: cropId });
    reload();
  }

  /** Datele planului: the opening balance, the farmer's expected figures, and (off the server) the pension. */
  async function savePlanFigures({ openingBani, expected, pension }: { openingBani: number; expected: HarvestState['expected']; pension: number }) {
    const farm = farmOrThrow();
    const draft = structuredClone(harvestsOf());
    const current = currentHarvest(draft, farm.baseYear);
    current.openingBani = openingBani;
    draft.expected = expected;
    if (farm.me) return saveAllHarvests(draft);
    writeText(store, farmKeys(mode).pension, String(pension));
    saveHarvests(store, mode, false, draft);
    reload();
  }

  /** The pension a farm off the server chose on Pensie (P24). */
  function setOwnPension(bani: number) {
    writeText(store, farmKeys(mode).pension, String(bani));
    reload();
  }

  /* ---- Tasks and follows ---- */

  /** Ticks a task. On a real farm it's marked once the server has it, or queued; in the demo, on the phone. */
  async function setTaskDone(id: string, done: boolean) {
    if (farmOrThrow().me) return send(({ write }) => write(done ? 'complete_task' : 'reopen_task', { id }));
    const set = new Set(farmOrThrow().doneTasks);
    done ? set.add(id) : set.delete(id);
    writeJson(store, farmKeys(mode).done, [...set]);
    reload();
  }

  /** Follows calls. Signed in it's saved on the farm and needs internet (never queued). */
  async function setFollow(keys: string[], on: boolean) {
    if (farmOrThrow().me) {
      return send(async ({ write }) => {
        for (const key of keys) await write(on ? 'follow_opportunity' : 'unfollow_opportunity', { key });
      });
    }
    const set = new Set(farmOrThrow().follows);
    keys.forEach((k) => (on ? set.add(k) : set.delete(k)));
    writeJson(store, farmKeys(mode).follows, [...set]);
    reload();
  }

  /* ---- The monitor ---- */

  /** Reads the calls and sources again, at most once an hour. The pages that show them ask (useMonitorRefresh). */
  async function refreshMonitor(): Promise<void> {
    const farm = farmOrThrow();
    if (!farm.me || !deps.net.browserOnline()) return;
    if (isFresh(farm.monitor, now().getTime())) return;
    const copy = await fetchMonitor((name, input) => live.read(name, input), store, farm.monitor, snapshot, now());
    if (copy && monitorChanged(copy, farm.monitor)) reload();
  }

  /* ---- Display ---- */

  function setCurrency(code: CurrencyCode) {
    saveCurrency(store, code);
    reload();
  }
  function setRates(rates: ExchangeRates) {
    saveRates(store, rates);
    reload();
  }
  /** "Am înțeles" on the refused-records note. */
  function dismissRefused() {
    remove(store, KEYS.refused);
    reload();
  }

  /** "Pornește din nou" on Ion's farm: drops everything the visitor changed (cropcash-demo-*). */
  function resetDemo() {
    if (mode !== 'demo') return;
    for (const key of store.keys()) if (key.startsWith(DEMO_KEY_PREFIX)) remove(store, key);
    reload();
  }

  /** Reads storage, then, for a signed-in farm, checks the internet, sends the queue and refreshes the copy. */
  function start() {
    if (state.ready) return Promise.resolve();
    reload();
    if (mode === 'demo' || !state.farm?.signedIn) return Promise.resolve();
    return Promise.all([net.ping().then(() => flushOutbox()), refreshFarm()]).then(() => undefined);
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    reload,
    isOnline: net.isOnline,
    /** The browser's online and offline events. */
    browserOnline: net.browserOnline,
    browserOffline: net.browserOffline,
    stop() {
      net.stop();
      if (flushTimer) clearTimeout(flushTimer);
    },
    /** The phone came back from the pocket: no "online" event fires, though the signal may have returned. */
    phoneBack() {
      if (mode === 'demo' || !state.farm?.signedIn) return Promise.resolve();
      return net.ping().then(() => flushOutbox());
    },
    refreshFarm,
    refreshMonitor,
    send,
    flushOutbox,
    pending: () => outbox(),
    updateHarvests,
    selectHarvest,
    savePlanFigures,
    setOwnPension,
    setTaskDone,
    setFollow,
    setCurrency,
    setRates,
    dismissRefused,
    resetDemo,
    mode,
    /** Reads that change nothing (the assistant, a task's title). Writes go through send(). */
    live: { api: live.api, read: live.read } as Pick<LiveCalls, 'api' | 'read'>,
    /** Reads a paper the farmer uploads (read_document). Nothing is saved, so it skips send(), but it still needs a farm of one's own and internet. */
    readDocument(files: { mediaType: string; data: string }[]) {
      if (mode === 'demo') throw demoError();
      if (!net.isOnline()) throw offlineError();
      return withFreshSession(() => live.write('read_document', { files })) as Promise<PaperReading>;
    },
  };
}

/** What read_document returns. */
export type PaperReading = DocumentReading;

export type FarmStore = ReturnType<typeof createStore>;
