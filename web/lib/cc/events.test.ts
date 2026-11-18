import { describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { viewFor } from './plan';
import { memoryStore } from './storage';
import { createStore, type LiveCalls } from './store';

/* The farmer's own calendar events on a farm without an account (Ion's): saved on the phone,
   shown in the plan, and a „Da, am plătit” becomes a record (docs/calendar-events-plan.md). */
const data = loadData();
const NOW = new Date('2026-11-15T10:00:00Z');

async function start(saved: Record<string, string> = {}) {
  const live: LiveCalls = { api: vi.fn(async () => ({}) as never), read: vi.fn(async () => ({ data: [] }) as never), write: vi.fn(async () => ({}) as never) };
  const storage = memoryStore(saved);
  const store = createStore({
    mode: 'demo',
    store: storage,
    data,
    live,
    now: () => NOW,
    net: { apiUrl: 'http://api.test', browserOnline: () => true, fetchFn: (async () => ({ ok: true })) as unknown as typeof fetch, setTimer: () => 0, clearTimer: () => undefined },
  });
  await store.start();
  return { store, storage, live };
}

describe('farmer events on a farm without an account', () => {
  it('starts with Ion\'s examples', async () => {
    const { store } = await start();
    expect(store.getState().farm!.events.map((e) => e.id)).toContain('demo-rata');
  });

  it('saves a new sum on the phone and puts it in the plan, without calling the server', async () => {
    const { store, storage, live } = await start();
    await store.eventWrite('add_event', { category: 'money', title: 'Reparație', startsOn: '2026-12-10', repeat: 'none', direction: 'out', amountLei: 30_000, expenseCategory: 'machine_service', clientId: '11111111-1111-4111-8111-111111111111' });
    const farm = store.getState().farm!;
    expect(farm.events.find((e) => e.id === '11111111-1111-4111-8111-111111111111')).toMatchObject({ amount_bani: 3_000_000, title: 'Reparație' });
    const own = viewFor(farm, 'farm').farmPlan().timelines.medium.months.flatMap((m) => m.entries).filter((e) => e.kind === 'farmer_out' && e.what === 'Reparație');
    expect(own.map((e) => [e.date, e.value])).toEqual([['2026-12-10', 3_000_000]]);
    expect(storage.getItem('cropcash-demo-events')).toContain('11111111-1111-4111-8111-111111111111');
    expect(live.write).not.toHaveBeenCalled();
  });

  it('turns „Da, am plătit” into an expense, once', async () => {
    const { store } = await start();
    await store.eventWrite('add_event', { category: 'money', title: 'Rata', startsOn: '2026-11-10', repeat: 'none', direction: 'out', amountLei: 1_500, expenseCategory: 'other', clientId: '22222222-2222-4222-8222-222222222222' });
    await store.eventWrite('confirm_occurrence', { eventId: '22222222-2222-4222-8222-222222222222', originalDate: '2026-11-10', amountLei: 1_500, date: '2026-11-10', clientId: '33333333-3333-4333-8333-333333333333' });
    const farm = store.getState().farm!;
    const occ = farm.events.find((e) => e.id === '22222222-2222-4222-8222-222222222222')!.farm_event_occurrences!;
    expect(occ).toEqual([expect.objectContaining({ original_date: '2026-11-10', done_at: expect.any(String), transaction_id: '33333333-3333-4333-8333-333333333333' })]);
    const records = farm.harvests!.items.flatMap((h) => h.records).filter((r) => r.id === 'n33333333-3333-4333-8333-333333333333');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: 'expense', amountBani: -150_000 });
  });
});

describe('a bad event on the phone', () => {
  it('fails loudly instead of looking saved', async () => {
    const { store } = await start();
    await expect(store.eventWrite('add_event', { category: 'other', title: '', startsOn: '2026-12-10', repeat: 'none' })).rejects.toThrow();
  });
});
