import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { findFunction, loadData, type StoredEvent, type StoredOccurrence, type WriteFunction } from '@cropcash/shared';
import { createApp } from './app';
import type { EventStore } from './db/events';
import type { FarmRow, Repo } from './db/repo';

const data = loadData();
const verifyToken = async (token: string) => ({ userId: `u-${token}`, email: `${token}@example.com` });
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';
const CLIENT = '33333333-3333-4333-8333-333333333333';

function setup(seed: StoredEvent[] = []) {
  const rows = new Map<string, StoredEvent>(seed.map((e) => [e.id, structuredClone(e)]));
  const byClient = new Map<string, string>();
  let n = 0;
  const farm = (): FarmRow =>
    ({
      id: 'farm-1',
      name: 'Ion',
      county: 'TR',
      birth_year: 1971,
      start_balance_bani: 3_500_000,
      demo_now: '2026-11-15T00:00:00Z',
      parcels: [
        { crop_id: 'grau', area_ari: 800, is_arable: true },
        { crop_id: 'porumb', area_ari: 700, is_arable: true },
      ],
      farm_events: [...rows.values()],
    }) as unknown as FarmRow;
  const repo = {
    getMyFarm: vi.fn(async (token: string) => (token === 'ion' ? farm() : null)),
    addExpense: vi.fn(async () => 'tx-out'),
    addSale: vi.fn(async () => 'tx-in'),
  } as unknown as Repo;
  const events: EventStore = {
    get: vi.fn(async (_t, id) => rows.get(id) ?? null),
    add: vi.fn(async (_t, _f, row, clientId) => {
      if (clientId && byClient.has(clientId)) return byClient.get(clientId)!;
      const id = `00000000-0000-4000-8000-00000000000${n++}`;
      rows.set(id, { ...(row as unknown as StoredEvent), id, farm_event_occurrences: [] });
      if (clientId) byClient.set(clientId, id);
      return id;
    }),
    update: vi.fn(async (_t, id, row, drop) => {
      const e = rows.get(id)!;
      rows.set(id, { ...e, ...(row as Partial<StoredEvent>), farm_event_occurrences: (e.farm_event_occurrences ?? []).filter((o) => !drop.includes(o.original_date)) });
      return true;
    }),
    split: vi.fn(async () => true),
    remove: vi.fn(async (_t, id) => rows.delete(id)),
    setOccurrence: vi.fn(async (_t, _f, row: StoredOccurrence) => {
      const e = rows.get(row.event_id)!;
      e.farm_event_occurrences = [...(e.farm_event_occurrences ?? []).filter((o) => o.original_date !== row.original_date), row];
    }),
  };
  const app = createApp({ corsOrigins: [], verifyToken, repo, data, getRates: async () => null, events, now: () => new Date('2026-11-15T10:00:00Z') });
  return { app, repo, events, rows };
}

/** The request the phone's registry builds, sent as the phone sends it. */
function send(app: ReturnType<typeof setup>['app'], name: string, input: unknown, token = 'ion') {
  const { method, path, body } = (findFunction(name) as WriteFunction).request(input as never);
  const r = request(app)[method.toLowerCase() as 'put' | 'post' | 'delete'](path).set(as(token));
  return body === undefined ? r : r.send(body as object);
}

const rate: StoredEvent = {
  id: E1,
  category: 'money',
  title: 'Rata la bancă',
  starts_on: '2026-10-15',
  repeat: 'monthly',
  direction: 'out',
  amount_bani: 150_000,
  expense_category: 'other',
  farm_event_occurrences: [{ event_id: E1, original_date: '2026-12-15', title: 'Rata din decembrie' }],
};

describe('adding an event', () => {
  it('saves it once and answers with the new safe salary', async () => {
    const { app, events } = setup();
    const input = { category: 'money', title: 'Rata', startsOn: '2026-12-15', direction: 'out', amountLei: 1500, expenseCategory: 'other', repeat: 'monthly', clientId: CLIENT };
    const first = await send(app, 'add_event', input);
    expect(first.status).toBe(201);
    expect(typeof first.body.salary).toBe('number');
    const again = await send(app, 'add_event', input);
    expect(again.body.id).toBe(first.body.id);
    expect(vi.mocked(events.add).mock.calls[0]![2]).toMatchObject({ amount_bani: 150_000, repeat: 'monthly' });
  });

  it('a planned cost lowers the salary it answers with', async () => {
    const { app } = setup();
    const plain = await send(app, 'add_event', { category: 'animals', title: 'Vaccin', startsOn: '2026-12-01' });
    const rateRes = await send(app, 'add_event', { category: 'money', title: 'Rata', startsOn: '2026-12-15', direction: 'out', amountLei: 3000, repeat: 'monthly' });
    expect(rateRes.body.salary).toBeLessThan(plain.body.salary);
  });

  it('refuses bad input, an unknown crop, and a farm that isn’t there', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/events').set(as('ion')).send({ category: 'money', title: 'x', startsOn: '2026-12-01' })).status).toBe(400);
    expect((await send(app, 'add_event', { category: 'crop', title: 'x', startsOn: '2026-12-01', cropId: 'banane' })).status).toBe(400);
    expect((await send(app, 'add_event', { category: 'other', title: 'x', startsOn: '2026-12-01' }, 'nobody')).status).toBe(404);
  });
});

describe('changing a series', () => {
  it('„Toate” drops the date rows that no longer fit', async () => {
    const { app, events, rows } = setup([rate]);
    const res = await send(app, 'update_event', { id: E1, patch: { startsOn: '2026-10-20' } });
    expect(res.status).toBe(200);
    expect(res.body.lost).toBe(1);
    expect(vi.mocked(events.update).mock.calls[0]![3]).toEqual(['2026-12-15']);
    expect(rows.get(E1)!.starts_on).toBe('2026-10-20');
  });

  it('„De acum înainte” splits the series', async () => {
    const { app, events } = setup([rate]);
    const res = await send(app, 'update_event', { id: E1, patch: { scope: 'following', from: '2026-12-15', newId: E2, amountLei: 2000 } });
    expect(res.status).toBe(200);
    const [, id, from, next, move, drop] = vi.mocked(events.split).mock.calls[0]!;
    expect([id, from, move, drop]).toEqual([E1, '2026-12-15', ['2026-12-15'], []]);
    expect(next).toMatchObject({ id: E2, starts_on: '2026-12-15', amount_bani: 200_000 });
    expect((await send(app, 'update_event', { id: E1, patch: { scope: 'following', from: '2026-12-16', newId: E2 } })).status).toBe(400);
  });

  it('„Doar asta” saves one date and refuses dates off the series', async () => {
    const { app, rows } = setup([rate]);
    expect((await send(app, 'set_occurrence', { eventId: E1, date: '2027-01-15', change: { movedTo: '2027-01-20', amountLei: 1600 } })).status).toBe(200);
    expect(rows.get(E1)!.farm_event_occurrences!.find((o) => o.original_date === '2027-01-15')).toMatchObject({ moved_to: '2027-01-20', amount_bani: 160_000 });
    expect((await send(app, 'set_occurrence', { eventId: E1, date: '2027-01-16', change: { cancelled: true } })).status).toBe(400);
    expect((await send(app, 'set_occurrence', { eventId: E2, date: '2027-01-15', change: { cancelled: true } })).status).toBe(404);
  });

  it('deletes a series; a second delete finds nothing', async () => {
    const { app } = setup([rate]);
    expect((await send(app, 'delete_event', { id: E1 })).status).toBe(204);
    expect((await send(app, 'delete_event', { id: E1 })).status).toBe(404);
  });
});

describe('„Ai plătit?”', () => {
  it('records one expense and ties it to the date, even when sent twice', async () => {
    const { app, repo, rows } = setup([rate]);
    const input = { eventId: E1, originalDate: '2026-11-15', amountLei: 1500, date: '2026-11-15', clientId: CLIENT };
    const res = await send(app, 'confirm_occurrence', input);
    expect(res.status).toBe(201);
    expect(res.body.transactionId).toBe('tx-out');
    expect(vi.mocked(repo.addExpense).mock.calls[0]![1]).toMatchObject({ amountBani: 150_000, category: 'other', note: 'Rata la bancă', clientId: CLIENT });
    expect(rows.get(E1)!.farm_event_occurrences!.find((o) => o.original_date === '2026-11-15')).toMatchObject({ transaction_id: 'tx-out' });
    await send(app, 'confirm_occurrence', input);
    expect(repo.addExpense).toHaveBeenCalledTimes(1);
  });

  it('refuses a future day and an event without money', async () => {
    const { app } = setup([rate, { id: E2, category: 'animals', title: 'Vaccin', starts_on: '2026-11-01', repeat: 'none' }]);
    expect((await send(app, 'confirm_occurrence', { eventId: E1, originalDate: '2026-12-15', amountLei: 1500, date: '2026-12-15' })).body.error).toBe('future_date');
    expect((await send(app, 'confirm_occurrence', { eventId: E2, originalDate: '2026-11-01', amountLei: 1, date: '2026-11-01' })).status).toBe(400);
  });
});
