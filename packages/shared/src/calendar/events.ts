/* The farmer's own events in the calendar: anything planned or worth remembering, about a parcel, a
   crop, the animals, the machines, money, paperwork or anything else. Shapes match
   supabase/migrations/022_farm_events.sql. See docs/calendar-events-plan.md.

   A repeating event is one series. What differs on one date (moved, renamed, another sum, cancelled,
   done, or turned into a real sale/expense) is an occurrence row. Occurrences are computed, never
   stored in bulk. Parcel work isn't here: it is a plot_operations row (plots/model.ts). */
import { z } from 'zod';
import { lastDay, monthKey, type IsoDate } from '../cashflow/dates';
import { EXPENSE_CATEGORIES, expenseCategory } from '../farm/plan-inputs';
import { HarvestYearSchema } from '../farm/harvests';
import { leiToBani, type Bani } from '../money';
import { OPERATION_KINDS, type StoredOperation, type StoredPlot, type StoredSeason } from '../plots/model';

export const EVENT_CATEGORIES = ['crop', 'animals', 'machinery', 'money', 'paperwork', 'other'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export const EVENT_REPEATS = ['none', 'monthly', 'yearly'] as const;
export type EventRepeat = (typeof EVENT_REPEATS)[number];
/** „Doar asta”, „De acum înainte”, „Toate”. */
export const EDIT_SCOPES = ['one', 'following', 'all'] as const;
export type EditScope = (typeof EDIT_SCOPES)[number];

/** A farm_event_occurrences row: what is different about one date of a series. */
export interface StoredOccurrence {
  event_id: string;
  original_date: IsoDate;
  moved_to?: IsoDate | null;
  at_time?: string | null;
  title?: string | null;
  note?: string | null;
  amount_bani?: number | null;
  cancelled?: boolean;
  done_at?: string | null;
  /** The real sale or expense this occurrence became („Da, am plătit”). */
  transaction_id?: string | null;
}

/** A farm_events row, with its occurrence rows. */
export interface StoredEvent {
  id: string;
  category: EventCategory;
  title: string;
  note?: string | null;
  starts_on: IsoDate;
  ends_on?: IsoDate | null;
  at_time?: string | null;
  repeat: EventRepeat;
  repeat_until?: IsoDate | null;
  remind_days_before?: number | null;
  crop_id?: string | null;
  plot_id?: string | null;
  direction?: 'in' | 'out' | null;
  amount_bani?: number | null;
  expense_category?: string | null;
  replaces_estimate?: boolean;
  created_at?: string | null;
  farm_event_occurrences?: StoredOccurrence[];
}

// ── Input ─────────────────────────────────────────────────────────────────────

const MAX_EVENT_LEI = 10_000_000;
const Text = (max: number) => z.string().trim().min(1).max(max);
const Day = z.iso.date();
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const EventFields = {
  category: z.enum(EVENT_CATEGORIES),
  title: Text(80),
  note: Text(500).nullable().optional(),
  startsOn: Day,
  endsOn: Day.nullable().optional(),
  atTime: Time.nullable().optional(),
  repeat: z.enum(EVENT_REPEATS).default('none'),
  repeatUntil: Day.nullable().optional(),
  remindDaysBefore: z.number().int().min(0).max(60).nullable().optional(),
  cropId: Text(40).nullable().optional(),
  plotId: z.uuid().nullable().optional(),
  direction: z.enum(['in', 'out']).nullable().optional(),
  /** Whole lei, like the expense form. Stored as bani. */
  amountLei: z.number().int().positive().max(MAX_EVENT_LEI).nullable().optional(),
  expenseCategory: z
    .preprocess((v) => (typeof v === 'string' ? expenseCategory(v) : v), z.enum(EXPENSE_CATEGORIES))
    .nullable()
    .optional(),
  /** Out: in place of the plan's estimate for that crop and month. In: „E toată recolta”. */
  replacesEstimate: z.boolean().optional(),
};

type EventShape = {
  category: EventCategory;
  startsOn: string;
  endsOn?: string | null;
  repeat?: EventRepeat;
  repeatUntil?: string | null;
  direction?: 'in' | 'out' | null;
  amountLei?: number | null;
  expenseCategory?: string | null;
};
const eventRules = <T extends z.ZodType<EventShape>>(schema: T) =>
  schema
    .refine((e) => !e.endsOn || e.endsOn >= e.startsOn, { message: 'ends before it starts', path: ['endsOn'] })
    .refine((e) => !e.repeatUntil || e.repeatUntil >= e.startsOn, { message: 'repeat ends before start', path: ['repeatUntil'] })
    .refine((e) => (e.repeat ?? 'none') === 'none' || !e.endsOn, { message: 'a repeating event lasts one day', path: ['endsOn'] })
    .refine((e) => (e.category === 'money') === !!e.direction, { message: 'money needs a direction', path: ['direction'] })
    .refine((e) => e.category === 'money' || e.amountLei == null, { message: 'only money has a sum', path: ['amountLei'] })
    .refine((e) => !e.expenseCategory || e.direction === 'out', { message: 'a category is for money out', path: ['expenseCategory'] });

export const EventInputSchema = eventRules(z.strictObject({ ...EventFields, clientId: z.uuid().optional() }));
export type EventInput = z.infer<typeof EventInputSchema>;

/** Parcel work, sent through the same sheet. Same fields as OperationInputSchema (plots/model.ts). */
const PlotWorkSchema = z
  .strictObject({
    target: z.literal('plot'),
    plotId: z.uuid(),
    harvestYear: HarvestYearSchema,
    kind: z.enum(OPERATION_KINDS),
    status: z.enum(['done', 'planned']),
    onDate: Day.nullable().optional(),
    product: Text(120).nullable().optional(),
    dose: Text(60).nullable().optional(),
    note: Text(200).nullable().optional(),
    clientId: z.uuid().optional(),
  })
  .refine((o) => o.status === 'planned' || !!o.onDate, { message: 'done needs a date', path: ['onDate'] });

/** What „Adaugă” sends: parcel work goes to plot_operations, everything else to farm_events. */
export const AddToCalendarInputSchema = z.union([
  PlotWorkSchema,
  eventRules(z.strictObject({ target: z.literal('event'), ...EventFields, clientId: z.uuid().optional() })),
]);
export type AddToCalendarInput = z.infer<typeof AddToCalendarInputSchema>;

/** One date of a series, changed with „Doar asta”. Every field is optional; null clears it. */
export const OccurrenceInputSchema = z.strictObject({
  movedTo: Day.nullable().optional(),
  atTime: Time.nullable().optional(),
  title: Text(80).nullable().optional(),
  note: Text(500).nullable().optional(),
  amountLei: z.number().int().positive().max(MAX_EVENT_LEI).nullable().optional(),
  cancelled: z.boolean().optional(),
  done: z.boolean().optional(),
});
export type OccurrenceInput = z.infer<typeof OccurrenceInputSchema>;

/** „Toate” or „De acum înainte”: the fields that change on the series. */
const { repeat: _repeat, ...PatchFields } = EventFields;
export const EventPatchSchema = z
  .strictObject({ ...PatchFields, repeat: z.enum(EVENT_REPEATS) })
  .partial()
  .extend({
    scope: z.enum(['following', 'all']).default('all'),
    /** For „De acum înainte”: the date the change starts from (a date of the series). */
    from: Day.optional(),
    /** The id the new series gets on „De acum înainte”, set by the phone so a resend doesn't split twice. */
    newId: z.uuid().optional(),
  })
  .refine((p) => p.scope === 'all' || (!!p.from && !!p.newId), { message: 'from and newId for „De acum înainte”', path: ['from'] });
export type EventPatch = z.infer<typeof EventPatchSchema>;

/** „Da, am plătit / am primit”: the real sum and day, which may differ from the plan. */
export const ConfirmOccurrenceSchema = z.strictObject({
  amountLei: z.number().positive().max(MAX_EVENT_LEI),
  date: Day,
  clientId: z.uuid().optional(),
});
export type ConfirmOccurrence = z.infer<typeof ConfirmOccurrenceSchema>;

/** An occurrence id: `ev:<event id>:<original date>`. */
export const occurrenceId = (eventId: string, originalDate: IsoDate) => `ev:${eventId}:${originalDate}`;
export function parseOccurrenceId(id: string): { eventId: string; originalDate: IsoDate } | null {
  const m = /^ev:([0-9a-zA-Z:-]+):(\d{4}-\d{2}-\d{2})$/.exec(id);
  return m ? { eventId: m[1]!, originalDate: m[2]! } : null;
}

/** An EventInput as a farm_events row (without id / farmer). */
export function eventRow(input: Omit<EventInput, 'clientId'>) {
  const money = input.category === 'money';
  return {
    category: input.category,
    title: input.title,
    note: input.note ?? null,
    starts_on: input.startsOn,
    ends_on: input.endsOn ?? null,
    at_time: input.atTime ?? null,
    repeat: input.repeat ?? 'none',
    repeat_until: input.repeatUntil ?? null,
    remind_days_before: input.remindDaysBefore ?? null,
    crop_id: input.cropId ?? null,
    plot_id: input.plotId ?? null,
    direction: money ? (input.direction ?? null) : null,
    amount_bani: money && input.amountLei != null ? leiToBani(input.amountLei) : null,
    expense_category: money && input.direction === 'out' ? (input.expenseCategory ?? null) : null,
    replaces_estimate: money ? !!input.replacesEstimate : false,
  };
}

/** A patch's fields as farm_events columns (only those present). */
export function eventPatchRow(patch: EventPatch): Partial<ReturnType<typeof eventRow>> {
  const map: [keyof EventPatch, string, (v: unknown) => unknown][] = [
    ['category', 'category', (v) => v],
    ['title', 'title', (v) => v],
    ['note', 'note', (v) => v ?? null],
    ['startsOn', 'starts_on', (v) => v],
    ['endsOn', 'ends_on', (v) => v ?? null],
    ['atTime', 'at_time', (v) => v ?? null],
    ['repeat', 'repeat', (v) => v],
    ['repeatUntil', 'repeat_until', (v) => v ?? null],
    ['remindDaysBefore', 'remind_days_before', (v) => v ?? null],
    ['cropId', 'crop_id', (v) => v ?? null],
    ['plotId', 'plot_id', (v) => v ?? null],
    ['direction', 'direction', (v) => v ?? null],
    ['amountLei', 'amount_bani', (v) => (v == null ? null : leiToBani(v as number))],
    ['expenseCategory', 'expense_category', (v) => v ?? null],
    ['replacesEstimate', 'replaces_estimate', (v) => !!v],
  ];
  const out: Record<string, unknown> = {};
  for (const [k, col, f] of map) if (patch[k] !== undefined) out[col] = f(patch[k]);
  return out as Partial<ReturnType<typeof eventRow>>;
}

/** The series after a patch, checked with the same rules as a new event. Null when it breaks one. */
export function patchedEvent(event: StoredEvent, patch: EventPatch): StoredEvent | null {
  const merged = { ...event, ...eventPatchRow(patch) } as StoredEvent;
  const check = EventInputSchema.safeParse(storedToInput(merged));
  return check.success ? merged : null;
}

/** A stored event back as input (for checks and for the edit sheet). */
export function storedToInput(e: StoredEvent): Omit<EventInput, 'clientId'> {
  return {
    category: e.category,
    title: e.title,
    note: e.note ?? null,
    startsOn: e.starts_on,
    endsOn: e.ends_on ?? null,
    atTime: e.at_time ? e.at_time.slice(0, 5) : null,
    repeat: e.repeat,
    repeatUntil: e.repeat_until ?? null,
    remindDaysBefore: e.remind_days_before ?? null,
    cropId: e.crop_id ?? null,
    plotId: e.plot_id ?? null,
    direction: e.direction ?? null,
    amountLei: e.amount_bani != null ? Math.round(e.amount_bani / 100) : null,
    expenseCategory: (e.expense_category as EventInput['expenseCategory']) ?? null,
    replacesEstimate: !!e.replaces_estimate,
  };
}

// ── Dates of a series ─────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const ms = (d: IsoDate) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: IsoDate, n: number) => iso(ms(d) + n * 86_400_000);
export const daysBetween = (a: IsoDate, b: IsoDate) => Math.round((ms(b) - ms(a)) / 86_400_000);

/** The k-th date of a series. A monthly 31st falls on the month's last day; a yearly 29 Feb on the 28th. */
export function nthDate(start: IsoDate, repeat: EventRepeat, k: number): IsoDate {
  if (repeat === 'none') return start;
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  const idx = y * 12 + (m - 1) + (repeat === 'monthly' ? k : 12 * k);
  const key = `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
  const last = Number(lastDay(key).slice(8));
  return `${key}-${pad(Math.min(d, last))}`;
}

/** The series' own dates inside [from, to] (before moves and cancellations). */
export function seriesDates(e: Pick<StoredEvent, 'starts_on' | 'repeat' | 'repeat_until' | 'ends_on'>, from: IsoDate, to: IsoDate): IsoDate[] {
  if (e.repeat === 'none') return e.starts_on <= to && (e.ends_on ?? e.starts_on) >= from ? [e.starts_on] : [];
  const out: IsoDate[] = [];
  const stop = e.repeat_until && e.repeat_until < to ? e.repeat_until : to;
  // Skip ahead to near `from` so a long series doesn't walk every past month.
  const [sy, sm] = e.starts_on.split('-').map(Number) as [number, number];
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const gap = (fy - sy) * 12 + (fm - sm);
  let k = Math.max(0, e.repeat === 'monthly' ? gap - 1 : Math.floor(gap / 12) - 1);
  for (; ; k++) {
    const d = nthDate(e.starts_on, e.repeat, k);
    if (d > stop) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** True when `date` is one of the series' own dates. */
export function isSeriesDate(e: StoredEvent, date: IsoDate): boolean {
  return seriesDates(e, date, date).includes(date);
}

export interface Occurrence {
  id: string;
  eventId: string;
  originalDate: IsoDate;
  /** The day it falls on, after a move. */
  date: IsoDate;
  /** Last day, for an event over several days; same as `date` otherwise. */
  endDate: IsoDate;
  atTime: string | null;
  title: string;
  note: string | null;
  /** Bani, for money; null otherwise. */
  amount: Bani | null;
  cancelled: boolean;
  done: boolean;
  transactionId: string | null;
  /** True when this date has its own changes („Doar asta”). */
  changed: boolean;
  event: StoredEvent;
}

/**
 * Every occurrence that overlaps [from, to], with its own changes applied, soonest first.
 * Cancelled ones are included (flagged) so callers can show or skip them.
 */
export function occurrences(e: StoredEvent, from: IsoDate, to: IsoDate): Occurrence[] {
  const rows = new Map((e.farm_event_occurrences ?? []).map((r) => [r.original_date, r]));
  const span = e.ends_on ? daysBetween(e.starts_on, e.ends_on) : 0;
  const originals = new Set(seriesDates(e, addDays(from, -span), to));
  // A date moved into the window from outside it.
  for (const r of rows.values()) if (r.moved_to && r.moved_to >= addDays(from, -span) && r.moved_to <= to && isSeriesDate(e, r.original_date)) originals.add(r.original_date);
  const out: Occurrence[] = [];
  for (const original of originals) {
    const r = rows.get(original);
    const date = r?.moved_to ?? original;
    const endDate = addDays(date, span);
    if (date > to || endDate < from) continue;
    out.push({
      id: occurrenceId(e.id, original),
      eventId: e.id,
      originalDate: original,
      date,
      endDate,
      atTime: (r?.at_time ?? e.at_time ?? null)?.slice(0, 5) ?? null,
      title: r?.title ?? e.title,
      note: r?.note ?? e.note ?? null,
      amount: e.category === 'money' ? (r?.amount_bani ?? e.amount_bani ?? null) : null,
      cancelled: !!r?.cancelled,
      done: !!r?.done_at || !!r?.transaction_id,
      transactionId: r?.transaction_id ?? null,
      changed: !!r && (!!r.moved_to || !!r.title || !!r.note || r.amount_bani != null || !!r.at_time || !!r.cancelled),
      event: e,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// ── Editing a series ──────────────────────────────────────────────────────────

/**
 * „Toate” changes the series. Occurrence rows whose date is no longer in the new series are dropped,
 * unless they are done or became a transaction. Returns the rows to keep and how many are lost,
 * so the sheet can warn before saving.
 */
export function rowsAfterSeriesChange(before: StoredEvent, after: StoredEvent): { keep: StoredOccurrence[]; lost: StoredOccurrence[] } {
  const keep: StoredOccurrence[] = [];
  const lost: StoredOccurrence[] = [];
  for (const r of before.farm_event_occurrences ?? []) {
    const kept = !!r.done_at || !!r.transaction_id || isSeriesDate(after, r.original_date);
    (kept ? keep : lost).push(r);
  }
  return { keep, lost };
}

/**
 * „De acum înainte” from `from`: the old series stops the day before, a new one starts on `from`
 * with the changes. Occurrence rows on or after `from` move to the new series when that date is
 * still in it; the rest of them are lost (done ones stay on the old series, which keeps its history).
 */
export function splitSeries(
  event: StoredEvent,
  from: IsoDate,
  patch: EventPatch,
  newId: string,
): { old: StoredEvent; next: StoredEvent; lost: StoredOccurrence[] } | null {
  if (event.repeat === 'none' || !isSeriesDate(event, from) || from === event.starts_on) return null;
  const rows = event.farm_event_occurrences ?? [];
  const before = rows.filter((r) => r.original_date < from || r.done_at || r.transaction_id);
  const after = rows.filter((r) => !before.includes(r));
  const old: StoredEvent = { ...event, repeat_until: addDays(from, -1), farm_event_occurrences: before };
  const base: StoredEvent = { ...event, id: newId, starts_on: from, farm_event_occurrences: [] };
  const next = patchedEvent(base, { ...patch, startsOn: patch.startsOn ?? from });
  if (!next) return null;
  const moved: StoredOccurrence[] = [];
  const lost: StoredOccurrence[] = [];
  for (const r of after) (isSeriesDate(next, r.original_date) ? moved : lost).push({ ...r, event_id: newId });
  next.farm_event_occurrences = moved;
  return { old, next, lost };
}

/** The occurrence row after a „Doar asta” change (merged on the old row). */
export function occurrenceRow(eventId: string, originalDate: IsoDate, input: OccurrenceInput, old?: StoredOccurrence, now = new Date()): StoredOccurrence {
  const row: StoredOccurrence = { ...(old ?? { event_id: eventId, original_date: originalDate }) };
  if (input.movedTo !== undefined) row.moved_to = input.movedTo === originalDate ? null : input.movedTo;
  if (input.atTime !== undefined) row.at_time = input.atTime;
  if (input.title !== undefined) row.title = input.title;
  if (input.note !== undefined) row.note = input.note;
  if (input.amountLei !== undefined) row.amount_bani = input.amountLei == null ? null : leiToBani(input.amountLei);
  if (input.cancelled !== undefined) row.cancelled = input.cancelled;
  if (input.done !== undefined) row.done_at = input.done ? (row.done_at ?? now.toISOString()) : null;
  return row;
}

// ── Applying a write on the phone ─────────────────────────────────────────────

/** The event writes, by registry name (functions/events.ts). */
export const EVENT_WRITES = ['add_event', 'update_event', 'delete_event', 'set_occurrence', 'confirm_occurrence'] as const;
export type EventWriteName = (typeof EVENT_WRITES)[number];
export const isEventWrite = (name: string): name is EventWriteName => (EVENT_WRITES as readonly string[]).includes(name);

/**
 * The events as they will be once a write is saved: the queue shows a write before it is sent, and
 * a farm off the server keeps its events this way. An add's id is its client id, so later writes in
 * the queue can name it. A write that no longer applies (its event is gone) changes nothing.
 */
export function applyEventWrite(events: readonly StoredEvent[], name: string, raw: unknown, now: Date): StoredEvent[] {
  const list = [...events];
  const at = (id: unknown) => list.findIndex((e) => e.id === id);
  const input = raw as Record<string, unknown>;
  switch (name) {
    case 'add_event': {
      const parsed = EventInputSchema.safeParse(input);
      if (!parsed.success) return list;
      const { clientId, ...rest } = parsed.data;
      const id = clientId ?? `local-${now.getTime()}`;
      if (at(id) >= 0) return list;
      return [...list, { id, ...eventRow(rest), created_at: now.toISOString(), farm_event_occurrences: [] } as StoredEvent];
    }
    case 'update_event': {
      const i = at(input.id);
      const parsed = EventPatchSchema.safeParse(input.patch);
      if (i < 0 || !parsed.success) return list;
      const patch = parsed.data;
      const event = list[i]!;
      if (patch.scope === 'following') {
        if (at(patch.newId) >= 0) return list;
        const split = splitSeries(event, patch.from!, patch, patch.newId!);
        if (!split) return list;
        list[i] = split.old;
        list.push({ ...split.next, created_at: now.toISOString() });
        return list;
      }
      const after = patchedEvent(event, patch);
      if (!after) return list;
      list[i] = { ...after, farm_event_occurrences: rowsAfterSeriesChange(event, after).keep };
      return list;
    }
    case 'delete_event':
      return list.filter((e) => e.id !== input.id);
    case 'set_occurrence': {
      const i = at(input.eventId);
      const parsed = OccurrenceInputSchema.safeParse(input.change);
      const date = String(input.date ?? '');
      if (i < 0 || !parsed.success || !isSeriesDate(list[i]!, date)) return list;
      const rows = list[i]!.farm_event_occurrences ?? [];
      const row = occurrenceRow(list[i]!.id, date, parsed.data, rows.find((r) => r.original_date === date), now);
      list[i] = { ...list[i]!, farm_event_occurrences: [...rows.filter((r) => r.original_date !== date), row] };
      return list;
    }
    case 'confirm_occurrence': {
      const i = at(input.eventId);
      const date = String(input.originalDate ?? '');
      if (i < 0 || !isSeriesDate(list[i]!, date)) return list;
      const rows = list[i]!.farm_event_occurrences ?? [];
      const old = rows.find((r) => r.original_date === date);
      const row = { ...occurrenceRow(list[i]!.id, date, { done: true }, old, now), transaction_id: old?.transaction_id ?? String(input.clientId ?? `local-${now.getTime()}`) };
      list[i] = { ...list[i]!, farm_event_occurrences: [...rows.filter((r) => r.original_date !== date), row] };
      return list;
    }
    default:
      return list;
  }
}

// ── Money for the plan ────────────────────────────────────────────────────────

/** A planned sum from a money event, as the timeline reads it (cashflow/timeline.ts). */
export interface PlannedMoney {
  /** The occurrence id. */
  id: string;
  title: string;
  direction: 'in' | 'out';
  amount: Bani;
  date: IsoDate;
  cropId?: string;
  /** Out: in place of the estimate for that crop and month. In: in place of the crop's estimated sale. */
  replacesPlanned: boolean;
  /** Its day passed and the farmer hasn't said yet whether it happened. */
  overdue: boolean;
}

const plannedCategories = new Set<string>(EXPENSE_CATEGORIES.slice(0, 5));

/**
 * The money events' sums inside [from, to], for the plan. Done, confirmed and cancelled dates are
 * left out (a confirmed one is a recorded transaction now). A date that passed without an answer
 * stays expected on `from`, when it is at most `carryDays` old and came after the event was made.
 */
export function plannedMoney(events: readonly StoredEvent[], from: IsoDate, to: IsoDate, carryDays: number): PlannedMoney[] {
  const out: PlannedMoney[] = [];
  const back = addDays(from, -carryDays);
  for (const e of events) {
    if (e.category !== 'money' || !e.direction) continue;
    const made = e.created_at ? e.created_at.slice(0, 10) : null;
    for (const o of occurrences(e, back, to)) {
      if (o.cancelled || o.done || !o.amount || o.amount <= 0) continue;
      const overdue = o.date < from;
      if (overdue && made && o.date < made) continue;
      const replaces = !!e.replaces_estimate && !!e.crop_id && (e.direction === 'in' || plannedCategories.has(expenseCategory(e.expense_category) ?? ''));
      out.push({
        id: o.id,
        title: o.title,
        direction: e.direction,
        amount: o.amount,
        date: overdue ? from : o.date,
        cropId: e.crop_id ?? undefined,
        replacesPlanned: replaces,
        overdue,
      });
    }
  }
  return out;
}

/** Money occurrences whose day passed with no answer yet: „Ai plătit?” / „Ai primit banii?”. */
export function awaitingAnswer(events: readonly StoredEvent[], today: IsoDate, carryDays: number): Occurrence[] {
  return events
    .filter((e) => e.category === 'money' && e.direction)
    .flatMap((e) => occurrences(e, addDays(today, -carryDays), addDays(today, -1)))
    .filter((o) => !o.cancelled && !o.done && (!o.event.created_at || o.date >= o.event.created_at.slice(0, 10)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Calendar rows ─────────────────────────────────────────────────────────────

export interface EventItem {
  id: string;
  source: 'event' | 'operation';
  date: IsoDate | null;
  endDate: IsoDate | null;
  month: string | null;
  title: string;
  category: EventCategory | 'plot';
  cropId: string | null;
  plotId: string | null;
  /** The day to remind on, when the farmer asked for a reminder. */
  remindOn: IsoDate | null;
  direction: 'in' | 'out' | 'none';
  amount: Bani | null;
  done: boolean;
  repeat: EventRepeat;
  occurrence: Occurrence | null;
  operation: StoredOperation | null;
}

const OPERATION_CROP = (op: StoredOperation, seasons: readonly StoredSeason[]) =>
  seasons.find((s) => s.plot_id === op.plot_id && s.harvest_year === op.harvest_year)?.crop_id ?? null;

/** Both stores as calendar rows inside [from, to]. Cancelled dates are left out. */
export function eventItems(
  events: readonly StoredEvent[],
  operations: readonly StoredOperation[],
  plots: readonly Pick<StoredPlot, 'id' | 'archived_at'>[],
  seasons: readonly StoredSeason[],
  from: IsoDate,
  to: IsoDate,
): EventItem[] {
  const items: EventItem[] = [];
  for (const e of events) {
    for (const o of occurrences(e, from, to)) {
      if (o.cancelled) continue;
      items.push({
        id: o.id,
        source: 'event',
        date: o.date,
        endDate: o.endDate,
        month: monthKey(o.date),
        title: o.title,
        category: e.category,
        cropId: e.crop_id ?? null,
        plotId: e.plot_id ?? null,
        remindOn: e.remind_days_before != null ? addDays(o.date, -e.remind_days_before) : null,
        direction: e.category === 'money' && e.direction ? e.direction : 'none',
        amount: o.amount,
        done: o.done,
        repeat: e.repeat,
        occurrence: o,
        operation: null,
      });
    }
  }
  const live = new Set(plots.map((p) => p.id));
  for (const op of operations) {
    if (!live.has(op.plot_id)) continue;
    if (op.on_date && (op.on_date < from || op.on_date > to)) continue;
    items.push({
      id: `op:${op.id}`,
      source: 'operation',
      date: op.on_date,
      endDate: op.on_date,
      month: op.on_date ? monthKey(op.on_date) : null,
      title: op.product ?? op.kind,
      category: 'plot',
      cropId: OPERATION_CROP(op, seasons),
      plotId: op.plot_id,
      remindOn: null,
      direction: 'none',
      amount: null,
      done: op.status === 'done',
      repeat: 'none',
      occurrence: null,
      operation: op,
    });
  }
  return items.sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9') || a.id.localeCompare(b.id));
}

/** What the crop view shows: events with that crop, plus anything on a parcel growing it. */
export function forCrop(items: readonly EventItem[], cropId: string, seasons: readonly StoredSeason[]): EventItem[] {
  return items.filter((i) => {
    if (i.cropId === cropId) return true;
    if (!i.plotId || !i.date) return false;
    return seasons.some((s) => s.plot_id === i.plotId && s.crop_id === cropId);
  });
}

/** Open items whose reminder day has come, and that haven't happened yet. */
export function dueReminders(items: readonly EventItem[], today: IsoDate): EventItem[] {
  return items.filter((i) => !i.done && i.remindOn && i.remindOn <= today && i.date && i.date >= today);
}
