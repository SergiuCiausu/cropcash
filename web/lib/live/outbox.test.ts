import { describe, expect, it } from 'vitest';
import { harvestsFromServer, type MeFarm } from './farm';
import { afterFailedSend, classifyFlushError, enqueue, failedTries, isQueueable, msUntilNextTry, pendingPlan, retryDelay, sameDocument, pendingRecords, readOutbox, readSent, rememberSent, takeBack, withClientIds, withOutbox, withOutboxLock, type OutboxItem } from './outbox';
import { loadData } from '../../../packages/shared/src/data/index';

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

describe('the outbox across tabs (IDEM-08)', () => {
  const NOW = Date.parse('2026-11-08T10:00:00Z');
  const DAY = 24 * 60 * 60 * 1000;

  it('runs one holder at a time, even when the first one fails, without navigator.locks', async () => {
    const order: string[] = [];
    let finish!: () => void;
    const first = withOutboxLock(async () => {
      order.push('a start');
      await new Promise<void>((done) => (finish = done));
      order.push('a end');
      throw new Error('a failed');
    }, undefined);
    const second = withOutboxLock(() => void order.push('b'), undefined);
    await new Promise((r) => setTimeout(r, 0));
    finish();
    await expect(first).rejects.toThrow('a failed');
    await second;
    expect(order).toEqual(['a start', 'a end', 'b']);
  });

  it('uses navigator.locks when there are any', async () => {
    const names: string[] = [];
    const locks = { request: async (name: string, fn: () => unknown) => (names.push(name), fn()) } as unknown as Pick<LockManager, 'request'>;
    expect(await withOutboxLock(() => 'done', locks)).toBe('done');
    expect(names).toEqual(['cropcash-outbox']);
  });

  it('gives an id only to an old sale or expense without one', () => {
    const items = [item('add_expense', { amountLei: 1 }, 1), item('record_sale', { clientId: 'kept' }, 2), item('complete_task', { id: 'a' }, 3)];
    const out = withClientIds(items, () => 'new');
    expect(out.changed).toBe(true);
    expect(out.items.map((i) => i.input.clientId)).toEqual(['new', 'kept', undefined]);
    expect(withClientIds(out.items, () => 'other').changed).toBe(false);
  });

  it('keeps the server id for a day, and only when the answer has one', () => {
    const it1 = item('add_expense', {});
    const sent = rememberSent({}, it1, { id: 'srv-1' }, NOW);
    expect(sent['outbox:1']?.serverId).toBe('srv-1');
    expect(rememberSent({}, it1, undefined, NOW)).toEqual({});
    expect(readSent(sent, NOW + DAY - 1)).toEqual(sent);
    expect(readSent(sent, NOW + DAY)).toEqual({});
    expect(readSent('nope', NOW)).toEqual({});
  });

  it('takes back from the queue first, and from the server once it was sent', () => {
    const queued = item('add_expense', {}, 1);
    const sent = { 'outbox:2': { serverId: 'srv-2', at: '2026-11-08T10:00:00Z' } };
    expect(takeBack([queued], sent, 'outbox:1')).toEqual({ items: [], serverId: null });
    expect(takeBack([queued], sent, 'outbox:2')).toEqual({ items: [queued], serverId: 'srv-2' });
    expect(takeBack([queued], sent, 'outbox:3')).toEqual({ items: [queued], serverId: null });
  });
});

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

describe('classifyFlushError', () => {
  const err = (status: number, code?: string) => Object.assign(new Error('x'), { status, code });

  it('sets aside what would fail the same way every time', () => {
    expect(classifyFlushError(err(0, 'invalid_input'))).toBe('refused');
    expect(classifyFlushError(err(0, 'unknown_function'))).toBe('refused');
    expect(classifyFlushError(err(400, 'invalid_input'))).toBe('refused');
    expect(classifyFlushError(err(422))).toBe('refused');
  });

  it('keeps for later what may work then', () => {
    expect(classifyFlushError(err(0, 'network'))).toBe('retry');
    expect(classifyFlushError(err(0, 'offline'))).toBe('retry');
    expect(classifyFlushError(err(500))).toBe('retry');
    expect(classifyFlushError(err(503))).toBe('retry');
    expect(classifyFlushError(new Error('no status'))).toBe('retry');
    expect(classifyFlushError(null)).toBe('retry');
  });
});

describe('sending again later (FAIL-05)', () => {
  const err = (status: number, code?: string, retryAfterMs: number | null = null) => Object.assign(new Error('x'), { status, code, retryAfterMs });
  const item = (over: Partial<OutboxItem> = {}): OutboxItem => ({ id: 'outbox:1', name: 'record_sale', input: {}, at: '2026-11-08T10:00:00Z', ...over });
  const now = Date.parse('2026-11-08T10:00:00Z');
  const middle = () => 0.5;

  it('keeps what failed because of the moment, not the record', () => {
    for (const e of [err(401), err(408), err(429), err(409, 'busy'), err(0, 'timeout')]) expect(classifyFlushError(e)).toBe('retry');
    expect(classifyFlushError(err(409, 'changed_elsewhere'))).toBe('refused');
  });

  it('waits longer each time, and as long as the server asked', () => {
    expect(afterFailedSend(item(), err(500), now, middle)?.nextAt).toBe(now + 30_000);
    expect(afterFailedSend(item({ attempts: 1 }), err(500), now, middle)?.nextAt).toBe(now + 120_000);
    expect(afterFailedSend(item({ attempts: 20 }), err(500), now, middle)?.nextAt).toBe(now + 1_800_000);
    expect(afterFailedSend(item(), err(429, 'x', 300_000), now, middle)?.nextAt).toBe(now + 300_000);
  });

  it('spreads the tries so phones do not all come back at once', () => {
    expect(retryDelay(1, null, () => 0)).toBe(24_000);
    expect(retryDelay(1, null, () => 1)).toBe(36_000);
  });

  it('gives up only after many tries and a full day', () => {
    expect(afterFailedSend(item({ attempts: 7 }), err(500), now, middle)).not.toBeNull();
    expect(afterFailedSend(item({ attempts: 7 }), err(500), now + 25 * 3_600_000, middle)).toBeNull();
    expect(afterFailedSend(item({ attempts: 2 }), err(500), now + 25 * 3_600_000, middle)).not.toBeNull();
  });

  it("doesn't count being offline against the record", () => {
    const i = item({ attempts: 2 });
    expect(afterFailedSend(i, err(0, 'offline'), now, middle)).toBe(i);
  });

  it('lets the first item decide when the queue is next tried', () => {
    expect(msUntilNextTry([item({ nextAt: now + 5000 }), item()], now)).toBe(5000);
    expect(msUntilNextTry([item()], now)).toBe(0);
    expect(failedTries([item({ attempts: 4 }), item()])).toBe(4);
  });
});

describe('plan saves in the queue (FAIL-14)', () => {
  const save = (name: OutboxItem['name'], input: Record<string, unknown>, version?: number): OutboxItem => ({ id: `outbox:${name}${JSON.stringify(input)}`, name, input, at: '2026-11-08T10:00:00Z', ...(version === undefined ? {} : { version }) });
  const sale = save('record_sale', { date: '2026-11-01', totalLei: 1 });

  it('keeps only the newest save, on the version the phone last had', () => {
    const q = enqueue(enqueue([sale, save('save_harvests', { a: 1 }, 4)], save('record_sale', { date: '2026-11-02', totalLei: 2 })), save('save_harvests', { a: 2 }, 9));
    expect(q.filter((i) => i.name === 'save_harvests')).toEqual([expect.objectContaining({ input: { a: 2 }, version: 4 })]);
    expect(q.filter((i) => i.name === 'record_sale')).toHaveLength(2);
  });

  it('sends the farm after the harvests, which can bring its own crops', () => {
    const q = enqueue([save('update_farm', { b: 1 })], save('save_harvests', { a: 1 }));
    expect(q.map((i) => i.name)).toEqual(['save_harvests', 'update_farm']);
  });

  it('shows a waiting plan save in the copy, keeping what the parcel already knew', () => {
    const copy = { ...me, parcels: [{ crop_id: 'grau', area_ari: 800, is_arable: true }] } as unknown as typeof me;
    const after = withOutbox(copy, [
      save('save_harvests', { years: [] }),
      save('update_farm', { name: 'Ion', county: 'TR', age: 55, startBalanceLei: 500, parcels: [{ cropId: 'grau', areaHa: 9.5 }] }),
    ]);
    expect(after.harvests).toEqual({ years: [] });
    expect(after.start_balance_bani).toBe(50_000);
    expect(after.parcels).toEqual([{ crop_id: 'grau', area_ari: 950, is_arable: true, planted_month: null }]);
    expect(pendingPlan([save('update_farm', {})])).toBe(true);
    expect(pendingPlan([sale])).toBe(false);
  });

  it('reads two documents as the same whatever the order of their keys', () => {
    expect(sameDocument({ a: 1, b: [{ c: 1, d: 2 }] }, { b: [{ d: 2, c: 1 }], a: 1 })).toBe(true);
    expect(sameDocument({ a: 1 }, { a: 2 })).toBe(false);
  });
});
