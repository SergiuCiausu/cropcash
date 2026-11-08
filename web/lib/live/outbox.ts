import { leiToBani } from '../../../packages/shared/src/money/index';
import { saleAmountBani } from '../../../packages/shared/src/farm/plan-inputs';
import planParams from '../../../docs/data/plan-params.json';
import type { MeFarm } from './farm';

/**
 * Writes that wait on the phone for internet: what notes something that already happened (a sale,
 * an expense, a finished task) and the farmer's own plan (harvests, farm details), where the newest
 * one replaces the one waiting. Nothing that moves money is ever queued (docs/07-architecture.md §8).
 */
export const QUEUEABLE = ['record_sale', 'add_expense', 'complete_task', 'reopen_task', 'save_harvests', 'update_farm'] as const;
export type QueueableName = (typeof QUEUEABLE)[number];
export const isQueueable = (name: string): name is QueueableName => (QUEUEABLE as readonly string[]).includes(name);

export interface OutboxItem {
  /** "outbox:…", so a record shown from the queue can be told apart from a saved one. */
  id: string;
  name: QueueableName;
  input: Record<string, unknown>;
  /** When the farmer saved it, as an ISO time. */
  at: string;
  /** For save_harvests: the version its copy had, sent as If-Match (IDEM-12). */
  version?: number | null;
  /** Failed sends so far, and not before this time (ms) is it tried again (FAIL-05). */
  attempts?: number;
  nextAt?: number;
  lastError?: string;
}

const NETWORK = planParams.network;
const isPlanSave = (name: string) => name === 'save_harvests' || name === 'update_farm';

/**
 * Adds to the queue. A plan save replaces the one waiting, and keeps its version: that is the copy
 * this phone last had from the server. The farm save goes last, as it can name the farm's own crops,
 * which the harvests save brings.
 */
export function enqueue(items: OutboxItem[], item: OutboxItem): OutboxItem[] {
  if (!isPlanSave(item.name)) return [...items, item];
  const earlier = items.find((i) => i.name === item.name);
  const next = earlier ? { ...item, version: earlier.version } : item;
  const all = [...items.filter((i) => i.name !== item.name), next];
  return [...all.filter((i) => i.name !== 'update_farm'), ...all.filter((i) => i.name === 'update_farm')];
}

/** How long to wait after the n-th failed send. The server's Retry-After wins when it is longer. */
export function retryDelay(attempts: number, retryAfterMs: number | null = null, rand: () => number = Math.random): number {
  const steps = NETWORK.outbox_retry_s.values;
  const base = steps[Math.min(attempts, steps.length) - 1]! * 1000;
  const spread = (base * NETWORK.outbox_jitter_pct.value) / 100;
  return Math.max(retryAfterMs ?? 0, Math.round(base + spread * (2 * rand() - 1)));
}

/**
 * The item after a send that may work later, or null when it has been tried long enough. Being
 * offline says nothing about the item, so it isn't counted.
 */
export function afterFailedSend(item: OutboxItem, e: unknown, nowMs: number, rand: () => number = Math.random): OutboxItem | null {
  const { code, retryAfterMs = null } = (e ?? {}) as { code?: string; retryAfterMs?: number | null };
  if (code === 'offline') return item;
  const attempts = (item.attempts ?? 0) + 1;
  const old = nowMs - Date.parse(item.at) >= NETWORK.outbox_give_up_hours.value * 3_600_000;
  if (attempts >= NETWORK.outbox_max_tries.value && old) return null;
  return { ...item, attempts, nextAt: nowMs + retryDelay(attempts, retryAfterMs, rand), ...(code ? { lastError: code } : {}) };
}

/** How long until the queue may be tried: the first item decides, because the order is kept. */
export const msUntilNextTry = (items: OutboxItem[], nowMs: number) => Math.max(0, (items[0]?.nextAt ?? 0) - nowMs);

/** Tries that have failed for the first item, which is the one holding the queue up. */
export const failedTries = (items: OutboxItem[]) => items[0]?.attempts ?? 0;

const sorted = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sorted)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])]))
      : v;
/** The database gives keys back in its own order, so a plain comparison would say they differ. */
export const sameDocument = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/**
 * What the flush does with an item whose write failed. 'refused': set it aside and go on, so one bad
 * item never blocks the rest. 'retry': stop and keep the queue for the next try.
 * The code comes first: a write this version's registry rejects (invalid_input, unknown_function)
 * fails on the phone with status 0 and would fail the same way forever, e.g. an item queued by an
 * older build. A 4xx is the server turning it down, except the ones about the moment rather than the
 * record: signed out (401), too slow (408), too early (425), too many (429), or busy with it (409 busy).
 * Everything else (network, timeout, offline, 5xx) may work later too.
 */
export function classifyFlushError(e: unknown): 'retry' | 'refused' {
  const { code, status = 0 } = (e ?? {}) as { code?: string; status?: number };
  if (code === 'invalid_input' || code === 'unknown_function') return 'refused';
  if (code === 'busy' || [401, 408, 425, 429].includes(status)) return 'retry';
  return status >= 400 && status < 500 ? 'refused' : 'retry';
}

/** Takes the queue for one tab at a time, so two tabs never send or rewrite it together (IDEM-08). */
export function withOutboxLock<T>(fn: () => Promise<T> | T, locks: Pick<LockManager, 'request'> | undefined = globalThis.navigator?.locks): Promise<T> {
  if (locks) return locks.request('cropcash-outbox', () => fn()) as Promise<T>;
  /* An older browser or plain http has no locks: this at least keeps one tab in order. */
  const run = lockTail.then(fn);
  lockTail = run.catch(() => undefined);
  return run;
}
let lockTail: Promise<unknown> = Promise.resolve();

/**
 * A sale or expense queued by an older version has no id. It gets one, and the caller saves the
 * queue before sending, so a send that gets no answer repeats with the same id.
 */
export function withClientIds(items: OutboxItem[], newKey: () => string): { items: OutboxItem[]; changed: boolean } {
  let changed = false;
  const filled = items.map((i) => {
    if ((i.name !== 'record_sale' && i.name !== 'add_expense') || i.input.clientId) return i;
    changed = true;
    return { ...i, input: { ...i.input, clientId: newKey() } };
  });
  return { items: filled, changed };
}

/** Queue id → the id the server gave it, so a record sent by another tab can still be taken back. */
export type SentOutbox = Record<string, { serverId: string; at: string }>;
const SENT_KEPT_MS = 24 * 60 * 60 * 1000;

/** Parses what was saved, dropping what is older than a day. */
export function readSent(raw: unknown, nowMs: number): SentOutbox {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as SentOutbox).filter(([, v]) => typeof v?.serverId === 'string' && nowMs - Date.parse(v.at) < SENT_KEPT_MS),
  );
}

/** Adds a sent item. An answer without an id (a finished task) has nothing to take back. */
export function rememberSent(sent: SentOutbox, item: OutboxItem, answer: unknown, nowMs: number): SentOutbox {
  const serverId = (answer as { id?: unknown } | null | undefined)?.id;
  if (typeof serverId !== 'string') return sent;
  return { ...sent, [item.id]: { serverId, at: new Date(nowMs).toISOString() } };
}

/** Takes a record back: from the queue if it still waits there, else it names the server's id. */
export function takeBack(items: OutboxItem[], sent: SentOutbox, id: string): { items: OutboxItem[]; serverId: string | null } {
  if (items.some((i) => i.id === id)) return { items: items.filter((i) => i.id !== id), serverId: null };
  return { items, serverId: sent[id]?.serverId ?? null };
}

export const isOutboxId =(id: unknown): id is string => typeof id === 'string' && id.startsWith('outbox:');

/** Parses what was saved, keeping only items this version can still send. */
export function readOutbox(raw: unknown): OutboxItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is OutboxItem =>
      !!i && isOutboxId(i.id) && isQueueable(i.name) && typeof i.input === 'object' && i.input !== null && typeof i.at === 'string',
  );
}

type Row = NonNullable<MeFarm['transactions']>[number] & Record<string, unknown>;

function rowFor(item: OutboxItem): Row | null {
  const i = item.input as {
    cropId?: string;
    category?: string;
    date: string;
    harvestYear?: number;
    note?: string;
    totalLei?: number;
    tonnes?: number;
    pricePerKgLei?: number;
    amountLei?: number;
  };
  const common = { id: item.id, occurred_at: `${i.date}T12:00:00Z`, source: 'manual', harvest_year: i.harvestYear ?? null, note: i.note ?? null, pending: true };
  if (item.name === 'record_sale') {
    return { ...common, kind: 'sale', category: null, crop_id: i.cropId ?? null, amount_bani: saleAmountBani(i as Parameters<typeof saleAmountBani>[0]) };
  }
  if (item.name === 'add_expense') {
    return { ...common, kind: 'expense', category: i.category ?? null, crop_id: i.cropId ?? null, amount_bani: -leiToBani(i.amountLei ?? 0) };
  }
  return null;
}

/**
 * The saved farm as it will be once the queue is sent, so every page, the salary included,
 * already counts what the farmer noted. The copy from the server itself stays untouched.
 */
export function withOutbox<T extends MeFarm | null>(me: T, items: OutboxItem[]): T {
  if (!me || items.length === 0) return me;
  let transactions = [...(me.transactions ?? [])];
  let done = [...(me.task_completions ?? [])];
  let plan: Partial<MeFarm> = {};
  for (const item of items) {
    if (item.name === 'save_harvests') plan = { ...plan, harvests: item.input as unknown as MeFarm['harvests'] };
    if (item.name === 'update_farm') plan = { ...plan, ...farmFromUpdate(me, item.input) };
    const row = rowFor(item);
    if (row) transactions = [...transactions, row];
    const id = String(item.input.id ?? '');
    if (item.name === 'complete_task' && !done.some((t) => t.task_id === id)) done = [...done, { task_id: id }];
    if (item.name === 'reopen_task') done = done.filter((t) => t.task_id !== id);
  }
  return { ...me, ...plan, transactions, task_completions: done };
}

/** A waiting update_farm in the shape of the saved copy, so the pages show it already. */
function farmFromUpdate(me: MeFarm, input: Record<string, unknown>): Partial<MeFarm> {
  const i = input as { name: string; county: string; startBalanceLei: number; parcels: { cropId: string; areaHa: number; plantedMonth?: string }[] };
  return {
    name: i.name,
    county: i.county,
    start_balance_bani: leiToBani(i.startBalanceLei),
    parcels: i.parcels.map((p) => ({
      ...me.parcels.find((old) => old.crop_id === p.cropId),
      crop_id: p.cropId,
      area_ari: Math.round(p.areaHa * 100),
      planted_month: p.plantedMonth ?? null,
    })),
  };
}

/** Records in the queue. Ticked tasks don't change a figure, so they aren't counted. */
export const pendingRecords = (items: OutboxItem[]) => items.filter((i) => i.name === 'record_sale' || i.name === 'add_expense').length;

/** Is a change to the plan waiting? It shows in the figures, so the farmer is told it isn't sent yet. */
export const pendingPlan = (items: OutboxItem[]) => items.some((i) => isPlanSave(i.name));
