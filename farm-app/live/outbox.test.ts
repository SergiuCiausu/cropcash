import { describe, expect, it } from 'vitest';
import { harvestsFromServer, type MeFarm } from './farm';
import { isQueueable, pendingRecords, readOutbox, withOutbox, type OutboxItem } from './outbox';
import { loadData } from '../../packages/shared/src/data/index';

const me = {
  name: 'Ion',
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  parcels: [{ crop_id: 'grau', area_ari: 800 }],
  transactions: [{ id: 't1', kind: 'sale', amount_bani: 100_000, occurred_at: '2026-10-01T12:00:00Z', crop_id: 'grau' }],
  task_completions: [{ task_id: 'a:2026' }],
} as unknown as MeFarm;
const item = (name: OutboxItem['name'], input: Record<string, unknown>, n = 1): OutboxItem => ({ id: `outbox:${n}`, name, input, at: '2026-11-07T10:00:00Z' });

describe('the outbox', () => {
  it('takes only what notes something that already happened', () => {
    expect(['record_sale', 'add_expense', 'complete_task', 'reopen_task'].every(isQueueable)).toBe(true);
    for (const money of ['save_envelopes', 'start_pension', 'simulate_apia_advance', 'advance_clock', 'undo_transaction', 'follow_opportunity']) {
      expect(isQueueable(money), money).toBe(false);
    }
  });

  it('drops anything saved that it can not send', () => {
    const good = item('add_expense', { category: 'diesel', amountLei: 500, date: '2026-11-07' });
    expect(readOutbox([good, { ...good, name: 'save_envelopes' }, { ...good, id: 'x' }, null])).toEqual([good]);
    expect(readOutbox('nope')).toEqual([]);
  });

  it('shows a queued sale and expense as records, with the expense taken out', () => {
    const farm = withOutbox(me, [
      item('record_sale', { cropId: 'grau', date: '2026-11-06', totalLei: 12_500, harvestYear: 2027 }, 1),
      item('add_expense', { category: 'diesel', amountLei: 800, date: '2026-11-07', cropId: 'grau' }, 2),
      item('record_sale', { cropId: 'grau', date: '2026-11-07', tonnes: 2, pricePerKgLei: 1.1 }, 3),
    ]);
    expect(farm.transactions!.map((t) => [t.id, t.kind, t.amount_bani])).toEqual([
      ['t1', 'sale', 100_000],
      ['outbox:1', 'sale', 1_250_000],
      ['outbox:2', 'expense', -80_000],
      ['outbox:3', 'sale', 220_000],
    ]);
    expect(farm.transactions![2]).toMatchObject({ category: 'diesel', crop_id: 'grau', occurred_at: '2026-11-07T12:00:00Z', pending: true });
    expect(me.transactions).toHaveLength(1);
  });

  it('shows them on Recolte, in the right harvest', () => {
    const farm = withOutbox(me, [item('record_sale', { cropId: 'grau', date: '2026-11-06', totalLei: 12_500, harvestYear: 2027 })]);
    const records = harvestsFromServer(farm, 2027, loadData()).items.flatMap((h) => h.records);
    expect(records).toContainEqual(expect.objectContaining({ id: 'outbox:1', kind: 'sale', amountBani: 1_250_000 }));
  });

  it('ticks and unticks tasks in order', () => {
    const farm = withOutbox(me, [item('complete_task', { id: 'b:2026' }, 1), item('reopen_task', { id: 'a:2026' }, 2)]);
    expect(farm.task_completions).toEqual([{ task_id: 'b:2026' }]);
  });

  it('counts only records as waiting, and leaves an empty queue alone', () => {
    expect(pendingRecords([item('complete_task', { id: 'b' }), item('add_expense', { category: 'other', amountLei: 1, date: '2026-11-07' })])).toBe(1);
    expect(withOutbox(me, [])).toBe(me);
    expect(withOutbox(null, [item('complete_task', { id: 'b' })])).toBeNull();
  });
});
