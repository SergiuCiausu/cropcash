import { leiToBani } from '../../packages/shared/src/money/index';
import { saleAmountBani } from '../../packages/shared/src/farm/plan-inputs';
import type { MeFarm } from './farm';

/**
 * Writes that wait on the phone for internet. Only what notes something that already happened
 * goes in: a sale, an expense, a finished task. Nothing that moves money is ever queued
 * (docs/07-architecture.md §8).
 */
export const QUEUEABLE = ['record_sale', 'add_expense', 'complete_task', 'reopen_task'] as const;
export type QueueableName = (typeof QUEUEABLE)[number];
export const isQueueable = (name: string): name is QueueableName => (QUEUEABLE as readonly string[]).includes(name);

export interface OutboxItem {
  /** "outbox:…", so a record shown from the queue can be told apart from a saved one. */
  id: string;
  name: QueueableName;
  input: Record<string, unknown>;
  /** When the farmer saved it, as an ISO time. */
  at: string;
}

export const isOutboxId = (id: unknown): id is string => typeof id === 'string' && id.startsWith('outbox:');

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
  for (const item of items) {
    const row = rowFor(item);
    if (row) transactions = [...transactions, row];
    const id = String(item.input.id ?? '');
    if (item.name === 'complete_task' && !done.some((t) => t.task_id === id)) done = [...done, { task_id: id }];
    if (item.name === 'reopen_task') done = done.filter((t) => t.task_id !== id);
  }
  return { ...me, transactions, task_completions: done };
}

/** Records in the queue. Ticked tasks don't change a figure, so they aren't counted. */
export const pendingRecords = (items: OutboxItem[]) => items.filter((i) => i.name === 'record_sale' || i.name === 'add_expense').length;
