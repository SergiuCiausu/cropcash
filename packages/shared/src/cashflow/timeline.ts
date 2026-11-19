import { isFallow, type AppData, type CalendarEvent, type Crop, type PlanParamsFile, type RangeEnd, type YearKind } from '../data';
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
import { firstSaleMonth, growingMonths } from './seasons';
import { harvestYear } from '../farm/harvests';
import { plannedMoney, type PlannedMoney, type StoredEvent } from '../calendar/events';
import { payrollMonth, type StoredEmployee } from '../payroll';
import { rentPayments, type PlannedRent } from '../arenda/schedule';
import type { StoredContract } from '../arenda/contracts';
import type { StoredContractPayment, StoredFarmContract, StoredParty } from '../contracts/model';
import { fromContract } from '../contracts/view';
import { UNKNOWN_TAX_PROFILE, type TaxProfile } from '../contracts/taxes';

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
  /** The pay of one of the farm's people (docs/employees-arenda-plan.md §1): their whole cost, on the pay day. */
  | 'payroll'
  /**
   * Arendă (docs/employees-arenda-plan.md §3.3): rent the farm pays in money, or grain it has to buy because it
   * doesn't grow the crop the rent is paid in. Rent paid in grain it grows lowers that crop's sale instead.
   */
  | 'rent'
  /** The tax withheld from the landowners' rent, paid to the state by the 25th of the next month (docs/15 §3). */
  | 'rent_tax'
  /** Rent the farm receives for land it gives (D5): money, or grain to sell. */
  | 'rent_in'
  /** Money with the other side of a contract (docs/contracts-plan.md §5.1): an advance, a delivery, a rate, a premium. */
  | 'contract_in'
  | 'contract_out'
  /** A contract's taxes and VAT: VAT that moves with an invoice, the D300 settling it, an SRL's micro tax. */
  | 'contract_tax'
  | 'deadline'
  | 'admin'
  /** A sum the farmer planned in the calendar (calendar/events.ts). */
  | 'farmer_in'
  | 'farmer_out'
  /** Something the farmer noted with no sum (a vet visit, the ITP). Only in lists, never in totals. */
  | 'farmer_note';

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
  /** A farmer's sum whose day passed with no answer yet; it stays expected this month. */
  overdue?: boolean;
  /** On a payroll entry: whose pay it is. `what` holds their name. */
  employeeId?: string;
  /** On a rent or contract entry: the contract. `what` holds the landowner's or the other side's name. */
  contractId?: string;
  /** On rent in grain (to buy, or received): the kg. */
  rentKg?: number;
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

/** A funding deadline the farmer put in the calendar. */
export interface FollowedDeadline {
  id: number;
  title: string;
  date: IsoDate;
}

/** Grain in the barn: the harvest is in, only the sale is left. */
export interface StoredGrain {
  id: string;
  cropId: string;
  kg: number;
}

/** Income already received (recorded through Stripe): its planned entry is dropped. */
export interface ReceivedIncome {
  kind: 'apia_advance' | 'apia_balance' | 'crop_sale';
  date: IsoDate;
  cropId?: string;
}

/** Money that really moved: a recorded sale or expense, or an APIA payment that arrived. */
export interface RecordedItem {
  kind: 'sale' | 'expense' | 'apia_advance' | 'apia_balance';
  amount: Bani;
  date: IsoDate;
  cropId?: string;
  /** False for money the plan never expected (rent, constructions, machine service, old stock). */
  replacesPlanned: boolean;
  /** A salaries expense that names the person: it takes their planned pay of its month off the plan. */
  employeeId?: string;
  /** A rent expense: it takes the planned money rent of its month off the plan. */
  rent?: boolean;
  /** A sale or expense filed under a contract (migration 048): it takes that contract's planned money of its month off. */
  contractId?: string;
}

export interface TimelineInput {
  parcels: Parcel[];
  subsidies: SubsidyResult;
  /** Money on hand at the start, including everything already received. */
  startBalance: Bani;
  extras?: ExtraPayment[];
  followed?: FollowedDeadline[];
  recorded?: RecordedItem[];
  received?: ReceivedIncome[];
  /** Harvest already gathered and not sold yet: counted as sold in the first month (P28). */
  stored?: StoredGrain[];
  /** The farmer's money events, expanded over the plan's months. */
  farmerEvents?: FarmerEventsInput;
  /**
   * Share (0–1) of a crop's sown hectares that won't reach harvest in a harvest year
   * (docs/crop-loss-plan.md). Only the sale shrinks: the costs are spent on everything sown.
   */
  lossShare?: (cropId: string, harvestYear: number) => number;
  /** The farm's people (migration 026). Their pay goes out every pay day, before the farmer's own salary. */
  employees?: StoredEmployee[];
  /** The farm's lease contracts (migration 033), its county (for the in-kind prices) and the landowners' names. */
  rent?: RentInput;
  /** The farm's other contracts (migration 048), their schedules and parties, and what the farm told us for its taxes. */
  contracts?: ContractsInput;
}

export interface ContractsInput {
  contracts: readonly StoredFarmContract[];
  payments: readonly StoredContractPayment[];
  parties?: Readonly<Record<string, Pick<StoredParty, 'name' | 'kind' | 'cui'>>>;
  profile?: TaxProfile;
}

export interface RentInput {
  contracts: readonly StoredContract[];
  county: string | null;
  owners?: Readonly<Record<string, string>>;
}

/** The hectares (in ari) that reach harvest when `share` of them is lost. */
export function harvestedAri(areaAri: number, share: number): number {
  return Math.round(areaAri * (1 - Math.min(1, Math.max(0, share))));
}

/** The harvest year of the crop's last harvest on or before `key`: the one a sale in `key` comes from. */
export function saleHarvestYear(crop: Pick<Crop, 'harvest_month'>, key: MonthKey): number {
  const year = Number(key.slice(0, 4)) - (monthOf(key) < crop.harvest_month ? 1 : 0);
  return harvestYear(`${year}-${String(crop.harvest_month).padStart(2, '0')}-01`);
}

/** The harvest year of the crop's next harvest from `key` on. */
export function nextHarvestYear(crop: Pick<Crop, 'harvest_month'>, key: MonthKey): number {
  const year = Number(key.slice(0, 4)) + (monthOf(key) > crop.harvest_month ? 1 : 0);
  return harvestYear(`${year}-${String(crop.harvest_month).padStart(2, '0')}-01`);
}

export interface FarmerEventsInput {
  events: StoredEvent[];
  /** How many days a passed, unanswered sum stays expected (plan-params farmer_events.carry_days). */
  carryDays: number;
  /** How far apart a „toată recolta” sale and the plan's sale may be (farmer_events.whole_harvest_window_months). */
  wholeHarvestWindowMonths: number;
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

/** Income: bad -> min, medium -> probable, good -> max. Cost: bad -> max, good -> min. */
export function pick(range: Range, direction: 'in' | 'out', scenario: AmountScenario): Bani {
  if (scenario === 'medium') return range.probable;
  const high = (direction === 'in') === (scenario === 'good');
  return high ? range.max : range.min;
}

function windowDate(start: IsoDate, end: IsoDate, timing: Timing): IsoDate {
  return timing === 'early' ? start : timing === 'late' ? end : midpoint(start, end);
}

/** What bad, normal and good mean (plan-params.json forecast.years, docs/11 P4). */
export type YearKinds = PlanParamsFile['forecast']['years'];

/** A subsidy Range calls its middle "probable"; the data files call it "mean". */
const RANGE_KEY: Record<RangeEnd, keyof Range> = { min: 'min', mean: 'probable', max: 'max' };

/**
 * A range that pick() reads back as each kind of year's own figure. Income puts the bad year at
 * min and the good one at max; a cost the other way round, so pick() keeps its meaning.
 */
function byYear(direction: 'in' | 'out', years: YearKinds, value: (kind: YearKind) => Bani): Range {
  const bad = value(years.bad);
  const probable = value(years.medium);
  const good = value(years.good);
  return direction === 'in' ? { min: bad, probable, max: good } : { min: good, probable, max: bad };
}

/** One crop's sale in bani, at the chosen ends of its yield and price. */
export function cropSaleValue(crop: Crop, areaAri: number, yieldEnd: RangeEnd, priceEnd: RangeEnd): Bani {
  return Math.round(areaAri * crop.yield_t_per_ha[yieldEnd] * crop.price_lei_per_kg[priceEnd] * 1000);
}

/** One crop's cost in bani (a share of the year's cost per ha), at the chosen end. */
export function cropCostValue(crop: Crop, areaAri: number, sharePct: number, costEnd: RangeEnd): Bani {
  return Math.round((areaAri * crop.cost_lei_per_ha[costEnd] * sharePct) / 100);
}

/**
 * Crop sale value range (bani). By default a kind of year is its harvest: only the yield moves, and
 * the price stays the mean, because prices barely follow the national yield (docs/07 §5, P4).
 */
export function cropSaleRange(crop: Crop, areaAri: number, years: YearKinds): Range {
  return byYear('in', years, (k) => cropSaleValue(crop, areaAri, k.yield, k.price));
}

/** The kilograms are known, so only the price can differ between kinds of year. */
function storedGrainRange(crop: Crop, kg: number, years: YearKinds): Range {
  return byYear('in', years, (k) => Math.round(kg * crop.price_lei_per_kg[k.price] * 100));
}

/** By default the money goes out before anyone knows the harvest, so costs are the mean in every kind of year (P4). */
export function cropCostRange(crop: Crop, areaAri: number, sharePct: number, years: YearKinds): Range {
  return byYear('out', years, (k) => cropCostValue(crop, areaAri, sharePct, k.cost));
}

/** Yearly occurrences of a dated calendar event that overlap [from, to]: the real one, plus projections. */
function occurrences(ev: CalendarEvent, from: IsoDate, to: IsoDate) {
  if (!ev.end) return [];
  const start = ev.start ?? ev.end;
  const out: { start: IsoDate; end: IsoDate; estimated: boolean }[] = [];
  for (let k = 0; addYears(start, k) <= to; k++) {
    const s = addYears(start, k);
    const e = addYears(ev.end, k);
    if (e >= from) out.push({ start: s, end: e, estimated: k > 0 });
  }
  return out;
}

/**
 * The real money is already in the start balance, so a record takes the planned entry of its own
 * month off the plan. Anything beyond the plan just stays in the balance.
 * APIA pays inside a window that can span months, so a payment matches on the window instead.
 */
function withoutRecorded(entries: TimelineEntry[], recorded: RecordedItem[]): TimelineEntry[] {
  for (const r of recorded) {
    if (!r.replacesPlanned) continue;
    const apia = r.kind === 'apia_advance' || r.kind === 'apia_balance';
    const pay = r.kind === 'expense' && !!r.employeeId;
    const rent = r.kind === 'expense' && !!r.rent;
    const contract = !!r.contractId;
    const plain: EntryKind = pay ? 'payroll' : rent ? 'rent' : r.kind === 'sale' ? 'crop_sale' : r.kind === 'expense' ? 'input_cost' : r.kind;
    const kind: EntryKind = contract ? (r.kind === 'expense' ? 'contract_out' : 'contract_in') : plain;
    const matches = (e: TimelineEntry) =>
      contract
        ? e.contractId === r.contractId && monthKey(e.date) === monthKey(r.date)
        : pay
        ? e.employeeId === r.employeeId && monthKey(e.date) === monthKey(r.date)
        : rent
        ? monthKey(e.date) === monthKey(r.date)
        : apia
        ? !!e.window && r.date >= e.window.start && r.date <= e.window.end
        : monthKey(e.date) === monthKey(r.date) && (!r.cropId || e.cropId === r.cropId);
    let left = r.amount;
    for (const e of entries) {
      if (e.kind !== kind || !matches(e)) continue;
      const used = Math.min(left, e.value);
      e.value -= used;
      left -= used;
    }
  }
  return entries.filter((e) => e.value > 0 || !CAN_BE_RECORDED.has(e.kind));
}

const CAN_BE_RECORDED = new Set<EntryKind>(['crop_sale', 'input_cost', 'apia_advance', 'apia_balance', 'payroll', 'rent', 'contract_in', 'contract_out']);

/** Events that only apply when something else exists (e.g. a declared credit). */
const CONDITIONAL_EVENTS = new Set(['credit-adeverinta-scadenta']);

export function buildTimeline(input: TimelineInput, data: AppData, opts: TimelineOptions): Timeline {
  const keys = Array.from({ length: opts.months }, (_, i) => addMonths(opts.start, i));
  const from = firstDay(keys[0]!);
  const to = lastDay(keys[keys.length - 1]!);
  let entries: TimelineEntry[] = [];
  const crops = new Map(data.crops.crops.map((c) => [c.id, c]));
  const { years, entry_day } = data.params.forecast;

  // ── Crops: cyclic monthly costs and the yearly sale ────────────────────────
  for (const parcel of input.parcels) {
    const crop = crops.get(parcel.cropId);
    // Fallow land costs and sells nothing; it only counts for the subsidies.
    if (!crop || isFallow(crop)) continue;
    const firstSale = parcel.plantedMonth ? firstSaleMonth(crop, parcel.plantedMonth, keys[0]!) : null;
    // The normal yearly sale starts once the next crop has had time to grow.
    const yearlyFrom = firstSale ? addMonths(firstSale, growingMonths(crop)) : keys[0]!;
    for (const key of keys) {
      const month = monthOf(key);
      const date = dayInMonth(key, entry_day.value);
      for (const exp of crop.expense_months.filter((e) => e.month === month)) {
        const id = costEntryId(crop.id, date);
        const amount = cropCostRange(crop, parcel.areaAri, exp.share_pct, years);
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
        (key === firstSale || (crop.sale_month_default === month && key >= yearlyFrom)) &&
        !alreadyReceived(input.received ?? [], 'crop_sale', { start: firstDay(key), end: lastDay(key) }, crop.id)
      ) {
        const lost = input.lossShare?.(crop.id, saleHarvestYear(crop, key)) ?? 0;
        const amount = cropSaleRange(crop, harvestedAri(parcel.areaAri, lost), years);
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

  for (const grain of input.stored ?? []) {
    const crop = crops.get(grain.cropId);
    if (!crop || !(grain.kg > 0)) continue;
    const amount = storedGrainRange(crop, grain.kg, years);
    const date = dayInMonth(keys[0]!, entry_day.value);
    entries.push({
      id: `stored:${grain.id}:${date}`,
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

  // ── APIA payments and deadlines from the calendar ──────────────────────────
  const { totals } = input.subsidies;
  const subsidyAmount: Partial<Record<string, Range>> = {
    'apia-avans': { min: totals.advanceLei, probable: totals.advanceLei, max: totals.advanceLei },
    'apia-sold': byYear('in', years, (k) => totals.balanceLei[RANGE_KEY[k.apia_balance]]),
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

  // ── The farm's people: exact sums, no scenario ──────────────────────────────
  if (input.employees?.length) {
    const names = new Map(input.employees.map((e) => [e.id, e.name]));
    for (const key of keys) {
      for (const p of payrollMonth(input.employees, key).payments) {
        const amount = { min: p.amount, probable: p.amount, max: p.amount };
        entries.push({
          id: `payroll:${p.employeeId}:${p.workMonth}`,
          kind: 'payroll',
          direction: 'out',
          amount,
          value: p.amount,
          date: p.date,
          window: null,
          employeeId: p.employeeId,
          what: names.get(p.employeeId),
          estimated: false,
          unverified: false,
        });
      }
    }
  }

  if (input.rent?.contracts.length) {
    const payments = rentPayments(input.rent.contracts, keys[0]!, keys[keys.length - 1]!, input.rent.county, data, entry_day.value);
    entries.push(...rentEntries(payments, entries, input.rent.owners ?? {}, crops, years, opts.amounts, to));
  }

  if (input.contracts?.contracts.length) {
    entries.push(...contractEntries(input.contracts, entries, data, crops, years, opts.amounts, from, to));
  }

  for (const f of input.followed ?? []) {
    if (f.date < from || f.date > to) continue;
    entries.push({
      id: `opportunity:${f.id}`,
      kind: 'deadline',
      direction: 'none',
      amount: null,
      value: 0,
      date: f.date,
      window: null,
      eventId: `opportunity-${f.id}`,
      what: f.title,
      estimated: false,
      unverified: false,
    });
  }

  entries = withoutRecorded(entries, input.recorded ?? []);
  if (input.farmerEvents) {
    const { events, carryDays, wholeHarvestWindowMonths } = input.farmerEvents;
    entries = withPlanned(entries, plannedMoney(events, from, to, carryDays), wholeHarvestWindowMonths);
  }
  return finishTimeline(entries, keys, input.startBalance);
}

const exact = (v: Bani): Range => ({ min: v, probable: v, max: v });

/** Grain the farm has to buy: a cost, so the bad year takes the dearest price. */
function grainCostRange(crop: Crop, kg: number, years: YearKinds): Range {
  return byYear('out', years, (k) => Math.round(kg * crop.price_lei_per_kg[k.price] * 100));
}

/**
 * Rent paid in grain the farm grows doesn't leave as money: it lowers that crop's sale. The sale just before the pay
 * day goes first (the grain comes from that harvest), then the ones after it. What no sale covers is grain to buy.
 * Returns the kg left over. `entries` are changed in place.
 */
function takeFromSales(entries: TimelineEntry[], crop: Crop, kg: number, payDay: IsoDate, years: YearKinds, amounts: AmountScenario): number {
  const sales = entries.filter((e) => e.kind === 'crop_sale' && e.cropId === crop.id && e.value > 0);
  const order = [
    ...sales.filter((e) => e.date <= payDay).sort((a, b) => b.date.localeCompare(a.date)),
    ...sales.filter((e) => e.date > payDay).sort((a, b) => a.date.localeCompare(b.date)),
  ];
  return takeFrom(order, crop, kg, years, amounts);
}

/**
 * Tonnes a sale contract sold at its own price come off the forecast's sale of the harvest they're from, so the
 * forecast sells at the market only what's left (docs/contracts-plan.md §5.1). Returns the kg the forecast didn't have.
 */
function takeFromHarvest(entries: TimelineEntry[], crop: Crop, kg: number, harvest: number, years: YearKinds, amounts: AmountScenario): number {
  const order = entries
    .filter((e) => e.kind === 'crop_sale' && e.cropId === crop.id && e.value > 0 && e.id.startsWith('sale:') && saleHarvestYear(crop, monthKey(e.date)) === harvest)
    .sort((a, b) => a.date.localeCompare(b.date));
  return takeFrom(order, crop, kg, years, amounts);
}

/** Lowers the sales in `order`, first ones first, by `kg` at the plan's price. Returns the kg they didn't cover. */
function takeFrom(order: TimelineEntry[], crop: Crop, kg: number, years: YearKinds, amounts: AmountScenario): number {
  const perKg = pick(storedGrainRange(crop, 1000, years), 'in', amounts) / 1000;
  if (!(perKg > 0)) return kg;
  let left = kg;
  for (const e of order) {
    if (left <= 0) break;
    const want = Math.round(left * perKg);
    const less = Math.min(e.value, want);
    const takenKg = less === want ? left : Math.floor(less / perKg);
    const r = storedGrainRange(crop, takenKg, years);
    e.value -= less;
    if (e.amount) e.amount = { min: Math.max(0, e.amount.min - r.min), probable: Math.max(0, e.amount.probable - r.probable), max: Math.max(0, e.amount.max - r.max) };
    left -= takenKg;
  }
  return left;
}

/** The plan's entries for the rent payments (docs/employees-arenda-plan.md §3.3–3.4). */
function rentEntries(
  payments: PlannedRent[],
  entries: TimelineEntry[],
  owners: Readonly<Record<string, string>>,
  crops: Map<string, Crop>,
  years: YearKinds,
  amounts: AmountScenario,
  to: IsoDate,
): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const p of payments) {
    const given = p.direction === 'given';
    const base = { date: p.date, window: null, what: owners[p.landownerId], contractId: p.contractId, estimated: p.guessedMonth, unverified: false };
    if (p.paidBani > 0) {
      out.push({ ...base, id: `rent:${p.contractId}:${p.date}`, kind: given ? 'rent_in' : 'rent', direction: given ? 'in' : 'out', amount: exact(p.paidBani), value: p.paidBani });
    }
    const crop = p.cropId ? crops.get(p.cropId) : undefined;
    if (p.cropId && p.paidKg > 0) {
      if (given) {
        // Grain that comes in is sold at the plan's price; a crop with no figures at the county price.
        const amount = crop ? storedGrainRange(crop, p.paidKg, years) : p.priceBaniPerKg ? exact(p.paidKg * p.priceBaniPerKg) : null;
        if (amount) {
          out.push({ ...base, id: `rent-kind:${p.contractId}:${p.date}`, kind: 'rent_in', direction: 'in', amount, value: pick(amount, 'in', amounts), cropId: p.cropId, rentKg: p.paidKg });
        }
      } else {
        const left = crop ? takeFromSales(entries, crop, p.paidKg, p.date, years, amounts) : p.paidKg;
        const amount = left <= 0 ? null : crop ? grainCostRange(crop, left, years) : p.priceBaniPerKg ? exact(left * p.priceBaniPerKg) : null;
        if (amount) {
          out.push({ ...base, id: `rent-buy:${p.contractId}:${p.date}`, kind: 'rent', direction: 'out', amount, value: pick(amount, 'out', amounts), cropId: p.cropId, rentKg: left });
        }
      }
    }
    if (!given && p.taxBani && p.taxDueOn && p.taxDueOn <= to) {
      out.push({ ...base, id: `rent-tax:${p.contractId}:${p.date}`, kind: 'rent_tax', direction: 'out', date: p.taxDueOn, amount: exact(p.taxBani), value: p.taxBani, estimated: false });
    }
  }
  return out;
}

/**
 * The plan's entries for the farm's other contracts (docs/contracts-plan.md §5.1):
 * - money with the other side on its days, while the contract runs (end.ts: renewals, decisions, archive);
 * - a sale's tonnes sold at its price come off the market sale of their harvest; a delivery with no price stays
 *   in the forecast at the market price;
 * - grain paid in kind lowers that crop's sale, as rent in kind does; what no sale covers is grain to buy;
 * - taxes with an amount: VAT moves with the invoice and the D300 settles it on its due day; VAT the farm can't get
 *   back is a cost; the micro tax on its day. Lines with no amount aren't planned (the Taxe tab counts them).
 */
function contractEntries(
  input: ContractsInput,
  entries: TimelineEntry[],
  data: AppData,
  crops: Map<string, Crop>,
  years: YearKinds,
  amounts: AmountScenario,
  from: IsoDate,
  to: IsoDate,
): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const inside = (d: IsoDate | null | undefined): d is IsoDate => !!d && d >= from && d <= to;
  const cropOf = (id: string | null) => (id ? crops.get(id) : undefined);
  for (const c of input.contracts) {
    const party = input.parties?.[c.party_id] ?? { name: '', kind: 'company' as const, cui: null };
    const view = fromContract(c, input.payments, party, data, { today: from, from, to }, input.profile ?? UNKNOWN_TAX_PROFILE);
    const base = { window: null, what: party.name || undefined, contractId: c.id, estimated: false, unverified: false };

    for (const f of view.flows) {
      const id = `contract:${c.id}:${f.paymentId ?? f.label ?? 'x'}:${f.date}`;
      const cropId = f.cropId ?? (c.kind === 'sale' ? c.crop_id : null) ?? undefined;
      if (f.amountBani) {
        out.push({ ...base, id, kind: f.direction === 'in' ? 'contract_in' : 'contract_out', direction: f.direction, amount: exact(f.amountBani), value: f.amountBani, date: f.date, cropId });
      }
      const crop = cropOf(f.cropId);
      if (!crop || !(f.kg > 0)) continue;
      if (f.direction === 'in' && c.kind === 'sale' && f.amountBani) {
        takeFromHarvest(entries, crop, f.kg, saleHarvestYear(crop, monthKey(f.date)), years, amounts);
      } else if (f.direction === 'out') {
        const left = takeFromSales(entries, crop, f.kg, f.date, years, amounts);
        if (left > 0) {
          const amount = grainCostRange(crop, left, years);
          out.push({ ...base, id: `contract-buy:${id}`, kind: 'contract_out', direction: 'out', amount, value: pick(amount, 'out', amounts), date: f.date, cropId: crop.id, rentKg: left });
        }
      }
    }

    // A sale that names its tonnes but delivers none in kind on its schedule: they come from the harvest of its last day.
    const saleCrop = c.kind === 'sale' ? cropOf(c.crop_id) : undefined;
    const pricedIn = view.flows.filter((f) => f.direction === 'in' && f.amountBani);
    if (saleCrop && c.quantity_kg && pricedIn.length && !view.flows.some((f) => f.direction === 'in' && f.kg > 0)) {
      const last = c.ends_on ?? pricedIn[pricedIn.length - 1]!.date;
      takeFromHarvest(entries, saleCrop, c.quantity_kg, saleHarvestYear(saleCrop, monthKey(last)), years, amounts);
    }

    for (const l of view.taxes) {
      if (!l.amountBani || l.effect === 'other_side') continue;
      const tax = { ...base, kind: 'contract_tax' as const, amount: exact(l.amountBani), value: l.amountBani, unverified: l.status === 'DE-VERIFICAT' };
      const key = `${c.id}:${l.tax}:${l.invoicedOn ?? l.dueOn}`;
      // VAT collected from the buyer, or paid to the supplier, with the invoice.
      if (l.tax === 'vat' && l.effect !== 'cost' && inside(l.invoicedOn)) {
        out.push({ ...tax, id: `contract-vat:${key}`, direction: l.effect === 'owed' ? 'in' : 'out', date: l.invoicedOn });
      }
      if (l.effect === 'cost' && inside(l.invoicedOn)) out.push({ ...tax, id: `contract-vat-cost:${key}`, direction: 'out', date: l.invoicedOn });
      // Paid to the state, or got back, on the due day.
      if ((l.effect === 'owed' || l.effect === 'withheld' || l.effect === 'deductible') && inside(l.dueOn)) {
        out.push({ ...tax, id: `contract-tax:${key}`, direction: l.effect === 'deductible' ? 'in' : 'out', date: l.dueOn });
      }
    }
  }
  return out;
}

/**
 * The farmer's planned sums go on their own day. One that stands for an estimate takes it off:
 * a cost lowers the crop's planned cost of its month (as a recorded expense does), and a sale
 * marked „toată recolta” removes the crop's estimated sale nearest to it.
 */
function withPlanned(entries: TimelineEntry[], planned: PlannedMoney[], windowMonths: number): TimelineEntry[] {
  const monthIndex = (d: IsoDate) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
  for (const p of planned) {
    if (p.replacesPlanned && p.cropId) {
      if (p.direction === 'out') {
        let left = p.amount;
        for (const e of entries) {
          if (e.kind !== 'input_cost' || e.cropId !== p.cropId || monthKey(e.date) !== monthKey(p.date)) continue;
          const used = Math.min(left, e.value);
          e.value -= used;
          left -= used;
        }
      } else {
        const near = entries
          .filter((e) => e.kind === 'crop_sale' && e.cropId === p.cropId && !e.id.startsWith('stored:') && e.value > 0)
          .map((e) => ({ e, gap: Math.abs(monthIndex(e.date) - monthIndex(p.date)) }))
          .filter((x) => x.gap <= windowMonths)
          .sort((a, b) => a.gap - b.gap)[0];
        if (near) near.e.value = 0;
      }
    }
    entries.push({
      id: p.id,
      kind: p.direction === 'in' ? 'farmer_in' : 'farmer_out',
      direction: p.direction,
      amount: { min: p.amount, probable: p.amount, max: p.amount },
      value: p.amount,
      date: p.date,
      window: null,
      cropId: p.cropId,
      what: p.title,
      estimated: false,
      unverified: false,
      ...(p.overdue ? { overdue: true } : {}),
    });
  }
  return entries.filter((e) => e.value > 0 || !CAN_BE_RECORDED.has(e.kind));
}

/** Sorts the entries into months and works out the totals, the running balance and the hard stretch. */
export function finishTimeline(all: TimelineEntry[], keys: MonthKey[], startBalance: Bani): Timeline {
  const entries = [...all].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));

  // ── Monthly totals and running balance ─────────────────────────────────────
  let balance = startBalance;
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
    startBalance,
    lowest: { key: months[lowestIdx]!.key, balance: months[lowestIdx]!.balanceEnd },
    hardMonths: months.filter((m) => m.hard).map((m) => m.key),
  };
}
