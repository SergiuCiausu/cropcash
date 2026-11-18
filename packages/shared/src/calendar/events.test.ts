import { describe, expect, it } from 'vitest';
import {
  AddToCalendarInputSchema,
  EventInputSchema,
  EventPatchSchema,
  awaitingAnswer,
  dueReminders,
  eventItems,
  eventRow,
  forCrop,
  nthDate,
  occurrenceRow,
  occurrences,
  parseOccurrenceId,
  plannedMoney,
  rowsAfterSeriesChange,
  seriesDates,
  splitSeries,
  storedToInput,
  type StoredEvent,
} from './events';

const ev = (over: Partial<StoredEvent> = {}): StoredEvent => ({
  id: 'e1',
  category: 'other',
  title: 'Ceva',
  starts_on: '2026-01-31',
  repeat: 'none',
  ...over,
});

describe('input', () => {
  it('accepts a plain event and a money event', () => {
    expect(EventInputSchema.safeParse({ category: 'animals', title: 'Vaccinare', startsOn: '2026-12-01' }).success).toBe(true);
    const money = EventInputSchema.parse({ category: 'money', title: 'Rata', startsOn: '2026-12-15', direction: 'out', amountLei: 1500, expenseCategory: 'other', repeat: 'monthly' });
    expect(eventRow(money)).toMatchObject({ amount_bani: 150_000, direction: 'out', repeat: 'monthly' });
  });

  it('refuses what breaks the rules', () => {
    const bad = [
      { category: 'other', title: 'x', startsOn: '2026-12-02', endsOn: '2026-12-01' },
      { category: 'other', title: 'x', startsOn: '2026-12-01', repeat: 'monthly', endsOn: '2026-12-03' },
      { category: 'money', title: 'x', startsOn: '2026-12-01' },
      { category: 'other', title: 'x', startsOn: '2026-12-01', amountLei: 10 },
      { category: 'money', title: 'x', startsOn: '2026-12-01', direction: 'in', expenseCategory: 'rent' },
      { category: 'other', title: '', startsOn: '2026-12-01' },
      { category: 'other', title: 'x', startsOn: '2026-12-01', atTime: '25:00' },
      { category: 'other', title: 'x', startsOn: '2026-12-01', extra: 1 },
    ];
    for (const b of bad) expect(EventInputSchema.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });

  it('takes parcel work or an event through one shape', () => {
    expect(AddToCalendarInputSchema.safeParse({ target: 'plot', plotId: '6f1c3a52-6a4b-4a3e-9d55-3c1f0a2b7e11', harvestYear: 2027, kind: 'fungicide', status: 'planned', onDate: '2027-04-20' }).success).toBe(true);
    expect(AddToCalendarInputSchema.safeParse({ target: 'event', category: 'machinery', title: 'ITP', startsOn: '2027-03-01', repeat: 'yearly' }).success).toBe(true);
    expect(AddToCalendarInputSchema.safeParse({ target: 'plot', plotId: 'x', harvestYear: 2027, kind: 'fungicide', status: 'done' }).success).toBe(false);
  });

  it('a patch never resets the repeat, and „De acum înainte” needs a date and an id', () => {
    expect(EventPatchSchema.parse({ title: 'Nou' })).toEqual({ title: 'Nou', scope: 'all' });
    expect(EventPatchSchema.safeParse({ scope: 'following', title: 'x' }).success).toBe(false);
  });

  it('round-trips a stored event', () => {
    const input = { category: 'money', title: 'Arenda', startsOn: '2026-10-01', direction: 'out', amountLei: 3000, expenseCategory: 'rent', repeat: 'yearly' } as const;
    const stored = { id: 'a', ...eventRow(EventInputSchema.parse(input)) } as StoredEvent;
    expect(storedToInput(stored)).toMatchObject(input);
  });
});

describe('series dates', () => {
  it('a monthly 31st falls on the last day; a yearly 29 Feb on the 28th', () => {
    expect([1, 2, 3].map((k) => nthDate('2026-01-31', 'monthly', k))).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(nthDate('2028-02-29', 'yearly', 1)).toBe('2029-02-28');
    expect(nthDate('2028-02-29', 'yearly', 4)).toBe('2032-02-29');
  });

  it('stays inside the window and stops at repeat_until', () => {
    const e = ev({ repeat: 'monthly', starts_on: '2026-01-15', repeat_until: '2026-05-01' });
    expect(seriesDates(e, '2026-02-01', '2026-12-31')).toEqual(['2026-02-15', '2026-03-15', '2026-04-15']);
    expect(seriesDates(ev({ repeat: 'yearly', starts_on: '2020-03-01' }), '2026-01-01', '2027-12-31')).toEqual(['2026-03-01', '2027-03-01']);
  });

  it('a multi-day event shows when it overlaps the window', () => {
    const e = ev({ starts_on: '2026-03-30', ends_on: '2026-04-02' });
    expect(occurrences(e, '2026-04-01', '2026-04-30').map((o) => [o.date, o.endDate])).toEqual([['2026-03-30', '2026-04-02']]);
  });
});

describe('one date of a series', () => {
  const series = ev({
    category: 'money',
    title: 'Rata',
    repeat: 'monthly',
    starts_on: '2026-01-15',
    direction: 'out',
    amount_bani: 150_000,
    farm_event_occurrences: [
      { event_id: 'e1', original_date: '2026-03-15', moved_to: '2026-03-20', amount_bani: 200_000 },
      { event_id: 'e1', original_date: '2026-04-15', cancelled: true },
      { event_id: 'e1', original_date: '2026-05-15', done_at: '2026-05-15T10:00:00Z' },
    ],
  });

  it('applies moves, sums, cancels and ticks', () => {
    const list = occurrences(series, '2026-03-01', '2026-05-31');
    expect(list.map((o) => [o.date, o.amount, o.cancelled, o.done])).toEqual([
      ['2026-03-20', 200_000, false, false],
      ['2026-04-15', 150_000, true, false],
      ['2026-05-15', 150_000, false, true],
    ]);
    expect(list[0]!.id).toBe('ev:e1:2026-03-15');
    expect(parseOccurrenceId(list[0]!.id)).toEqual({ eventId: 'e1', originalDate: '2026-03-15' });
  });

  it('a date moved into the window from outside it shows', () => {
    const moved = ev({ repeat: 'monthly', starts_on: '2026-01-15', farm_event_occurrences: [{ event_id: 'e1', original_date: '2026-02-15', moved_to: '2026-03-02' }] });
    expect(occurrences(moved, '2026-03-01', '2026-03-10').map((o) => o.originalDate)).toEqual(['2026-02-15']);
  });

  it('builds the row for „Doar asta”', () => {
    const row = occurrenceRow('e1', '2026-06-15', { movedTo: '2026-06-18', amountLei: 1600, done: true }, undefined, new Date('2026-06-18T08:00:00Z'));
    expect(row).toEqual({ event_id: 'e1', original_date: '2026-06-15', moved_to: '2026-06-18', amount_bani: 160_000, done_at: '2026-06-18T08:00:00.000Z' });
    expect(occurrenceRow('e1', '2026-06-15', { movedTo: '2026-06-15' }, row).moved_to).toBeNull();
  });
});

describe('editing a series', () => {
  const series = ev({
    repeat: 'monthly',
    starts_on: '2026-01-10',
    farm_event_occurrences: [
      { event_id: 'e1', original_date: '2026-02-10', done_at: '2026-02-10T09:00:00Z' },
      { event_id: 'e1', original_date: '2026-03-10', title: 'Altfel' },
      { event_id: 'e1', original_date: '2026-04-10', moved_to: '2026-04-12' },
    ],
  });

  it('„Toate”: rows off the new pattern are lost, done ones stay', () => {
    const { keep, lost } = rowsAfterSeriesChange(series, { ...series, starts_on: '2026-01-12' });
    expect(keep.map((r) => r.original_date)).toEqual(['2026-02-10']);
    expect(lost.map((r) => r.original_date)).toEqual(['2026-03-10', '2026-04-10']);
  });

  it('„De acum înainte”: the old series stops, a new one starts with the change', () => {
    const split = splitSeries(series, '2026-03-10', { scope: 'following', from: '2026-03-10', newId: 'e2', title: 'Rata nouă' }, 'e2')!;
    expect(split.old.repeat_until).toBe('2026-03-09');
    expect(split.old.farm_event_occurrences!.map((r) => r.original_date)).toEqual(['2026-02-10']);
    expect(split.next).toMatchObject({ id: 'e2', starts_on: '2026-03-10', title: 'Rata nouă' });
    expect(split.next.farm_event_occurrences!.map((r) => [r.event_id, r.original_date])).toEqual([
      ['e2', '2026-03-10'],
      ['e2', '2026-04-10'],
    ]);
    expect(occurrences(split.old, '2026-01-01', '2026-12-31').map((o) => o.date)).toEqual(['2026-01-10', '2026-02-10']);
  });

  it('can’t split on the first date or off the pattern', () => {
    expect(splitSeries(series, '2026-01-10', { scope: 'following' }, 'e2')).toBeNull();
    expect(splitSeries(series, '2026-03-11', { scope: 'following' }, 'e2')).toBeNull();
  });
});

describe('money for the plan', () => {
  const rate = ev({ category: 'money', title: 'Rata', repeat: 'monthly', starts_on: '2026-09-15', direction: 'out', amount_bani: 150_000, expense_category: 'other', created_at: '2026-10-01T00:00:00Z' });

  it('carries a passed, unanswered date to the start, and skips older or answered ones', () => {
    const withRows: StoredEvent = { ...rate, farm_event_occurrences: [{ event_id: 'e1', original_date: '2026-11-15', transaction_id: 't1' }] };
    const list = plannedMoney([withRows], '2026-12-01', '2027-01-31', 45);
    // Sept is before the event was made, Oct is too old, Nov was paid.
    expect(list.map((p) => [p.date, p.overdue])).toEqual([
      ['2026-12-15', false],
      ['2027-01-15', false],
    ]);
    const late = plannedMoney([rate], '2026-12-01', '2026-12-31', 45);
    expect(late.map((p) => [p.id, p.date, p.overdue])).toEqual([
      ['ev:e1:2026-11-15', '2026-12-01', true],
      ['ev:e1:2026-12-15', '2026-12-15', false],
    ]);
  });

  it('only a planned category with a crop replaces an estimate', () => {
    const seeds = ev({ category: 'money', title: 'Sămânță', starts_on: '2027-03-10', direction: 'out', amount_bani: 100_000, expense_category: 'seeds', crop_id: 'porumb', replaces_estimate: true });
    const rent = { ...seeds, id: 'e2', expense_category: 'rent' };
    expect(plannedMoney([seeds, rent], '2027-03-01', '2027-03-31', 45).map((p) => p.replacesPlanned)).toEqual([true, false]);
  });

  it('asks „Ai plătit?” for passed dates', () => {
    expect(awaitingAnswer([rate], '2026-12-02', 45).map((o) => o.date)).toEqual(['2026-11-15']);
  });
});

describe('calendar rows', () => {
  const seasons = [{ plot_id: 'p1', harvest_year: 2027, crop_id: 'grau', apia_crop_code: null, area_ari: 800, sown_on: null, harvested_on: null, second_crop_id: null }];
  const items = eventItems(
    [ev({ id: 'v', category: 'animals', title: 'Vaccin', starts_on: '2027-04-10', remind_days_before: 3 }), ev({ id: 'c', category: 'crop', title: 'Verific', starts_on: '2027-04-12', crop_id: 'porumb' })],
    [
      { id: 'o1', plot_id: 'p1', harvest_year: 2027, kind: 'fungicide', status: 'planned', on_date: '2027-04-20', product: null, dose: null, transaction_id: null, template_id: null },
      { id: 'o2', plot_id: 'gone', harvest_year: 2027, kind: 'fungicide', status: 'planned', on_date: '2027-04-21', product: null, dose: null, transaction_id: null, template_id: null },
    ],
    [{ id: 'p1', archived_at: null }],
    seasons,
    '2027-04-01',
    '2027-04-30',
  );

  it('merges events and parcel work, without parcels that are gone', () => {
    expect(items.map((i) => i.id)).toEqual(['ev:v:2027-04-10', 'ev:c:2027-04-12', 'op:o1']);
    expect(items[2]).toMatchObject({ cropId: 'grau', category: 'plot', done: false });
  });

  it('filters by crop and finds due reminders', () => {
    expect(forCrop(items, 'grau', seasons).map((i) => i.id)).toEqual(['op:o1']);
    expect(dueReminders(items, '2027-04-07').map((i) => i.id)).toEqual(['ev:v:2027-04-10']);
    expect(dueReminders(items, '2027-04-06')).toEqual([]);
  });
});

describe('applying writes on the phone', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const ID = '44444444-4444-4444-8444-444444444444';
  const NEW = '55555555-5555-4555-8555-555555555555';
  const add = { category: 'money', title: 'Rata', startsOn: '2026-12-15', direction: 'out', amountLei: 1500, repeat: 'monthly', clientId: ID };

  it('adds once with the client id, then edits, splits, ticks and deletes it', async () => {
    const { applyEventWrite } = await import('./events');
    let list = applyEventWrite([], 'add_event', add, now);
    list = applyEventWrite(list, 'add_event', add, now);
    expect(list.map((e) => [e.id, e.amount_bani])).toEqual([[ID, 150_000]]);
    list = applyEventWrite(list, 'set_occurrence', { eventId: ID, date: '2027-01-15', change: { amountLei: 1600 } }, now);
    list = applyEventWrite(list, 'update_event', { id: ID, patch: { title: 'Rata BRD' } }, now);
    expect(list[0]!.title).toBe('Rata BRD');
    expect(list[0]!.farm_event_occurrences).toHaveLength(1);
    list = applyEventWrite(list, 'update_event', { id: ID, patch: { scope: 'following', from: '2027-02-15', newId: NEW, amountLei: 1800 } }, now);
    expect(list.map((e) => [e.id, e.starts_on, e.repeat_until ?? null, e.amount_bani])).toEqual([
      [ID, '2026-12-15', '2027-02-14', 150_000],
      [NEW, '2027-02-15', null, 180_000],
    ]);
    list = applyEventWrite(list, 'confirm_occurrence', { eventId: ID, originalDate: '2026-12-15', amountLei: 1500, date: '2026-12-15', clientId: NEW }, now);
    expect(list[0]!.farm_event_occurrences!.find((r) => r.original_date === '2026-12-15')).toMatchObject({ transaction_id: NEW });
    list = applyEventWrite(list, 'delete_event', { id: NEW }, now);
    expect(list.map((e) => e.id)).toEqual([ID]);
  });

  it('ignores a write whose event is gone or whose input is wrong', async () => {
    const { applyEventWrite } = await import('./events');
    expect(applyEventWrite([], 'set_occurrence', { eventId: ID, date: '2027-01-15', change: {} }, now)).toEqual([]);
    expect(applyEventWrite([], 'add_event', { title: 'x' }, now)).toEqual([]);
  });
});
