import type { AppData, CalendarEvent, Crop } from '../data';
import type { Bani, Range } from '../money';
import type { Parcel, SubsidyResult } from '../subsidies';
import {
  addMonths,
  addYears,
  dayInMonth,
  firstDay,
  lastDay,
  maxDate,
  midpoint,
  monthKey,
  monthOf,
  type IsoDate,
  type MonthKey,
} from './dates';

/** Which values to use: good year, normal year, bad (drought) year. See docs/07 §5. */
export type AmountScenario = 'good' | 'medium' | 'bad';
/** When money with a payment window arrives: first day, middle, or last day. */
export type Timing = 'early' | 'mid' | 'late';

export type EntryKind =
  | 'apia_advance'
  | 'apia_balance'
  | 'crop_sale'
  | 'input_cost'
  | 'credit'
  | 'loan_repayment'
  | 'deadline'
  | 'admin';

export interface TimelineEntry {
  id: string;
  kind: EntryKind;
  direction: 'in' | 'out' | 'none';
  /** min / probable / max in bani; null for deadlines. Costs: min = cheapest. */
  amount: Range | null;
  /** The amount used for this scenario (bani), 0 for deadlines. */
  value: Bani;
  /** Date used for planning in this timing scenario. */
  date: IsoDate;
  /** Payment or deadline window, when the real date is uncertain. */
  window: { start: IsoDate; end: IsoDate } | null;
  cropId?: string;
  schemeCode?: string;
  /** Calendar event id (for titles from data). */
  eventId?: string;
  /** Short description from data (e.g. "îngrășăminte de primăvară"). */
  what?: string;
  /** Projected from last year's dates; real dates not announced yet. */
  estimated: boolean;
  /** Based on a DE-VERIFICAT figure or rule. */
  unverified: boolean;
}

export interface MonthPlan {
  key: MonthKey;
  entries: TimelineEntry[];
  in: Bani;
  out: Bani;
  net: Bani;
  /** Projected balance at month end (no salary, no envelopes). */
  balanceEnd: Bani;
  /** Part of the hardest stretch: money keeps going out until the lowest point. */
  hard: boolean;
}

export interface Timeline {
  months: MonthPlan[];
  startBalance: Bani;
  lowest: { key: MonthKey; balance: Bani };
  hardMonths: MonthKey[];
}

/** Payments the farmer declared (e.g. a credit and its repayment). */
export interface ExtraPayment {
  id: string;
  kind: 'credit' | 'loan_repayment';
  direction: 'in' | 'out';
  amount: Bani;
  date: IsoDate;
}

/** Income already received (recorded through Stripe): its planned entry is dropped. */
export interface ReceivedIncome {
  kind: 'apia_advance' | 'apia_balance' | 'crop_sale';
  date: IsoDate;
  cropId?: string;
}

export interface TimelineInput {
  parcels: Parcel[];
  subsidies: SubsidyResult;
  /** Money on hand at the start, including everything already received. */
  startBalance: Bani;
  extras?: ExtraPayment[];
  received?: ReceivedIncome[];
  /** Ids of planned cost entries already paid (recorded as expenses). */
  paidCostIds?: ReadonlySet<string>;
}

/** True when a planned income has already arrived (same kind, inside its window or month). */
function alreadyReceived(
  received: ReceivedIncome[],
  kind: ReceivedIncome['kind'],
  window: { start: IsoDate; end: IsoDate },
  cropId?: string,
): boolean {
  return received.some(
    (r) => r.kind === kind && (cropId === undefined || r.cropId === cropId) && r.date >= window.start && r.date <= window.end,
  );
}

export interface TimelineOptions {
  start: MonthKey;
  months: number;
  amounts: AmountScenario;
  timing: Timing;
}

/** Stable id of a planned crop cost (so a recorded payment can replace it). */
export const costEntryId = (cropId: string, date: IsoDate) => `cost:${cropId}:${date}`;

/** Costs and sales are planned mid-month (product assumption, docs/11 P-list). */
const MID_MONTH_DAY = 15;

/** Income: bad -> min, medium -> probable, good -> max. Cost: bad -> max, good -> min. */
export function pick(range: Range, direction: 'in' | 'out', scenario: AmountScenario): Bani {
  if (scenario === 'medium') return range.probable;
  const high = (direction === 'in') === (scenario === 'good');
  return high ? range.max : range.min;
}

function windowDate(start: IsoDate, end: IsoDate, timing: Timing): IsoDate {
  return timing === 'early' ? start : timing === 'late' ? end : midpoint(start, end);
}

/**
 * Crop sale value range (bani). Drought (min) = minimum yield at the MEAN price:
 * when national output drops, prices tend not to drop (docs/07 §5, assumption P4).
 */
export function cropSaleRange(crop: Crop, areaAri: number): Range {
  const value = (tPerHa: number, leiPerKg: number) => Math.round(areaAri * tPerHa * leiPerKg * 1000);
  return {
    min: value(crop.yield_t_per_ha.min, crop.price_lei_per_kg.mean),
    probable: value(crop.yield_t_per_ha.mean, crop.price_lei_per_kg.mean),
    max: value(crop.yield_t_per_ha.max, crop.price_lei_per_kg.max),
  };
}

export function cropCostRange(crop: Crop, areaAri: number, sharePct: number): Range {
  const value = (leiPerHa: number) => Math.round((areaAri * leiPerHa * sharePct) / 100);
  return {
    min: value(crop.cost_lei_per_ha.min),
    probable: value(crop.cost_lei_per_ha.mean),
    max: value(crop.cost_lei_per_ha.max),
  };
}

/** Yearly occurrences of a dated calendar event that overlap [from, to]: the real one, plus projections. */
function occurrences(ev: CalendarEvent, from: IsoDate, to: IsoDate) {
  if (!ev.end) return [];
  const start = ev.start ?? ev.end;
  const out: { start: IsoDate; end: IsoDate; estimated: boolean }[] = [];
  for (let k = 0; k <= 2; k++) {
    const s = addYears(start, k);
    const e = addYears(ev.end, k);
    if (e >= from && s <= to) out.push({ start: s, end: e, estimated: k > 0 });
  }
  return out;
}

/** Events that only apply when something else exists (e.g. a declared credit). */
const CONDITIONAL_EVENTS = new Set(['credit-adeverinta-scadenta']);

export function buildTimeline(input: TimelineInput, data: AppData, opts: TimelineOptions): Timeline {
  const keys = Array.from({ length: opts.months }, (_, i) => addMonths(opts.start, i));
  const from = firstDay(keys[0]!);
  const to = lastDay(keys[keys.length - 1]!);
  const entries: TimelineEntry[] = [];
  const crops = new Map(data.crops.crops.map((c) => [c.id, c]));

  // ── Crops: cyclic monthly costs and the yearly sale ────────────────────────
  for (const parcel of input.parcels) {
    const crop = crops.get(parcel.cropId);
    if (!crop) continue;
    for (const key of keys) {
      const month = monthOf(key);
      const date = dayInMonth(key, MID_MONTH_DAY);
      for (const exp of crop.expense_months.filter((e) => e.month === month)) {
        const id = costEntryId(crop.id, date);
        if (input.paidCostIds?.has(id)) continue;
        const amount = cropCostRange(crop, parcel.areaAri, exp.share_pct);
        entries.push({
          id,
          kind: 'input_cost',
          direction: 'out',
          amount,
          value: pick(amount, 'out', opts.amounts),
          date,
          window: null,
          cropId: crop.id,
          what: exp.what_ro,
          estimated: false,
          // Monthly cost split is a product assumption, flagged once on the screen
          // rather than on every line (see crops-reference.json meta.months_status).
          unverified: false,
        });
      }
      if (
        crop.sale_month_default === month &&
        !alreadyReceived(input.received ?? [], 'crop_sale', { start: firstDay(key), end: lastDay(key) }, crop.id)
      ) {
        const amount = cropSaleRange(crop, parcel.areaAri);
        entries.push({
          id: `sale:${crop.id}:${date}`,
          kind: 'crop_sale',
          direction: 'in',
          amount,
          value: pick(amount, 'in', opts.amounts),
          date,
          window: null,
          cropId: crop.id,
          estimated: false,
          unverified: false,
        });
      }
    }
  }

  // ── APIA payments and deadlines from the calendar ──────────────────────────
  const { totals } = input.subsidies;
  const subsidyAmount: Partial<Record<string, Range>> = {
    'apia-avans': { min: totals.advanceLei, probable: totals.advanceLei, max: totals.advanceLei },
    'apia-sold': totals.balanceLei,
  };

  for (const ev of data.calendar.events) {
    if (CONDITIONAL_EVENTS.has(ev.id)) continue;
    for (const occ of occurrences(ev, from, to)) {
      if (ev.type === 'income') {
        const amount = subsidyAmount[ev.id];
        if (!amount || amount.max === 0) continue;
        const kind = ev.id === 'apia-avans' ? 'apia_advance' : 'apia_balance';
        if (alreadyReceived(input.received ?? [], kind, occ)) continue;
        // A window already open: the money can still come, but not before today's month.
        const date = maxDate(windowDate(occ.start, occ.end, opts.timing), from);
        if (date > to) continue;
        entries.push({
          id: `${ev.id}:${occ.start}`,
          kind: ev.id === 'apia-avans' ? 'apia_advance' : 'apia_balance',
          direction: 'in',
          amount,
          value: pick(amount, 'in', opts.amounts),
          date,
          window: { start: occ.start, end: occ.end },
          eventId: ev.id,
          estimated: occ.estimated,
          unverified: ev.status === 'DE-VERIFICAT' || input.subsidies.rates.FEGA.confirmed === false,
        });
      } else {
        // Deadlines sit on their last day; admin periods (controls) on their first.
        const date = ev.type === 'deadline' ? occ.end : maxDate(occ.start, from);
        if (date < from || date > to) continue;
        entries.push({
          id: `${ev.id}:${occ.start}`,
          kind: ev.type,
          direction: 'none',
          amount: null,
          value: 0,
          date,
          window: occ.start !== occ.end ? { start: occ.start, end: occ.end } : null,
          eventId: ev.id,
          estimated: occ.estimated,
          unverified: ev.status === 'DE-VERIFICAT',
        });
      }
    }
  }

  // ── Declared by the farmer (credits): exact amounts, no scenario ───────────
  for (const x of input.extras ?? []) {
    if (x.date < from || x.date > to) continue;
    const amount = { min: x.amount, probable: x.amount, max: x.amount };
    entries.push({
      id: `${x.kind}:${x.id}`,
      kind: x.kind,
      direction: x.direction,
      amount,
      value: x.amount,
      date: x.date,
      window: null,
      estimated: false,
      unverified: false,
    });
  }

  entries.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));

  // ── Monthly totals and running balance ─────────────────────────────────────
  let balance = input.startBalance;
  const months: MonthPlan[] = keys.map((key) => {
    const list = entries.filter((e) => monthKey(e.date) === key);
    const inSum = list.filter((e) => e.direction === 'in').reduce((s, e) => s + e.value, 0);
    const outSum = list.filter((e) => e.direction === 'out').reduce((s, e) => s + e.value, 0);
    balance += inSum - outSum;
    return { key, entries: list, in: inSum, out: outSum, net: inSum - outSum, balanceEnd: balance, hard: false };
  });

  // Hardest stretch: the run of money-losing months that ends at the lowest balance.
  let lowestIdx = 0;
  months.forEach((m, i) => {
    if (m.balanceEnd < months[lowestIdx]!.balanceEnd) lowestIdx = i;
  });
  for (let i = lowestIdx; i >= 0 && months[i]!.net < 0; i--) months[i]!.hard = true;

  return {
    months,
    startBalance: input.startBalance,
    lowest: { key: months[lowestIdx]!.key, balance: months[lowestIdx]!.balanceEnd },
    hardMonths: months.filter((m) => m.hard).map((m) => m.key),
  };
}
