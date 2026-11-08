/* The plan as a page sees it: every figure on the pages comes from here (web/legacy/app.js,
   "The plan" to "Planned against real"). A view is built for one FarmState and one scope, and
   each figure is worked out once, on first use. A new FarmState gets a new view, so nothing can
   show figures from before a change. */
import type { AppData } from '../../../packages/shared/src/data/index';
import { activePensionMonthly, isOwnCrop } from '../../../packages/shared/src/farm/index';
import { buildFarmPlan, farmData as farmDataFor, grainInBarn as grainInBarnFor, longForecast as longForecastFor, type FarmPlan } from '../../../packages/shared/src/functions/plan';
import type { PlanFarm } from '../../../packages/shared/src/cashflow/farm-plan';
import type { MonthPlan, Timeline, TimelineEntry } from '../../../packages/shared/src/cashflow/timeline';
import type { FarmState, PageFarm } from './farm';
import { between, date, MONTHS } from './format';
import {
  areaShare,
  cropParcel,
  harvestMonth,
  harvestScope,
  moneyIn,
  moneyOut,
  openHarvests,
  projectClosed,
  toParcel,
  toTransaction,
  type Harvest,
  type HarvestState,
  type PageRecord,
  type Planned,
} from './harvests';

export type { FarmPlan };

/** Pages that show the whole farm, whatever harvest is picked. The others follow the picker. */
export const WHOLE_FARM_PAGES = ['/acasa', '/bani', '/salariu', '/date-plan', '/pensie', '/oportunitati', '/surse'] as const;
export type Scope = 'farm' | 'picked';
export const scopeOf = (page: string): Scope => ((WHOLE_FARM_PAGES as readonly string[]).includes(page) ? 'farm' : 'picked');

const isApia = (e: Pick<TimelineEntry, 'kind'>) => e.kind === 'apia_advance' || e.kind === 'apia_balance';

/** One crop's months: its own entries, plus its part of the APIA money by hectares. */
export function cropMonths(t: Pick<Timeline, 'months'>, h: Pick<Harvest, 'parcels'>, cropId: string): MonthPlan[] {
  const part = (b: number) => areaShare(b, h.parcels, cropId);
  return t.months.map((m) => {
    const entries = m.entries
      .filter((e) => e.cropId === cropId || isApia(e))
      .map((e) => (isApia(e) ? { ...e, value: part(e.value), amount: e.amount && { min: part(e.amount.min), probable: part(e.amount.probable), max: part(e.amount.max) } } : e));
    const add = (direction: string) => entries.filter((e) => e.direction === direction).reduce((s, e) => s + e.value, 0);
    /* A crop has no balance of its own, and "hard months" are about the account. */
    return { ...m, entries, in: add('in'), out: add('out'), hard: false };
  });
}

export interface PlanItem {
  id: string;
  kind: TimelineEntry['kind'];
  month: string;
  date: string;
  window: TimelineEntry['window'];
  amount: TimelineEntry['amount'];
  value: number;
  direction: TimelineEntry['direction'];
  estimated: boolean;
  unverified: boolean;
  event: AppData['calendar']['events'][number] | null | undefined;
  title: string;
  sub: string;
  icon: string;
  tone: '' | 'b' | 'c';
  task: boolean;
  exactDay: boolean;
}


/** Builds the view of one FarmState for one scope. Throws if there's no farm (the guard comes first). */
export function farmView(state: FarmState, scope: Scope) {
  if (!state.baseFarm || !state.harvests) throw new Error('No farm to show: the sign-in guard runs before the pages.');
  const { me, today, baseYear, farmData: base } = state;
  const harvests: HarvestState = state.harvests;
  const wholeFarm = scope === 'farm';
  const { selected, selectedCrop, scope: scoped, records: scopeRecords } = harvestScope(harvests, baseYear, wholeFarm);
  const current = harvests.items.find((h) => h.year === baseYear) ?? selected;
  const farm: PageFarm = { ...state.baseFarm, parcels: scoped.parcels, startBalanceBani: scoped.openingBani, summary: scoped.summary };

  const once = <T>(make: () => T) => {
    let value: { v: T } | null = null;
    return () => (value ??= { v: make() }).v;
  };

  /* The farmer's own yield and price replace the averages, so every page follows them (P26). */
  const data = once(() => (me ? farmDataFor(me as unknown as PlanFarm, base) : farmDataFor({ harvests: { years: [], gathered: harvests.gathered, expected: harvests.expected } }, base)));
  /* The figures as they'd be without the farmer's own expectation: Recolte, or the averages. */
  const dataWithout = once(() => farmDataFor({ harvests: { years: [], gathered: harvests.gathered } }, base));

  const cropName = (id: string) => base.crops.crops.find((c) => c.id === id)?.name_ro ?? '';

  /** Where a crop's figures come from, for the words beside them. */
  function figureSource(cropId: string, withOwn = true): 'own' | 'gathered' | 'average' {
    if (isOwnCrop(cropId)) return 'own';
    const own = harvests.expected.find((e) => e.cropId === cropId);
    if (withOwn && own && (own.yieldTPerHa !== null || own.priceLeiPerKg !== null)) return 'own';
    return harvests.gathered.some((g) => g.cropId === cropId && (g.tonnes || g.priceLeiPerKg)) ? 'gathered' : 'average';
  }

  /* The demo pension is for farms not on the server. A real farm shows only what it really pays,
     or the screen would promise less than Stripe sends (P24). */
  const pensionBani = once(() => (me ? activePensionMonthly(me.pension_plans as Parameters<typeof activePensionMonthly>[0]) : state.ownPension ?? data().params.pension_demo_lei.value * 100));

  const grainInBarn = (h: Harvest, transactions: ReturnType<typeof toTransaction>[]) =>
    h.year === baseYear ? grainInBarnFor(harvests.gathered, transactions, data()) : [];

  /* A signed-in farm plans from the server's records, exactly as its salary is paid, on any day. */
  const paidFarm = me && !selectedCrop && scoped.year === baseYear ? me : null;
  const storedFarm = once((): PlanFarm => {
    if (paidFarm) return paidFarm as unknown as PlanFarm;
    const transactions = scopeRecords.map(toTransaction);
    return {
      birth_year: +today.slice(0, 4) - farm.age,
      start_balance_bani: farm.startBalanceBani,
      parcels: farm.parcels.map(toParcel),
      transactions,
      stored_grain: grainInBarn(scoped, transactions),
      pension_plans: { monthly_bani: pensionBani(), status: 'active' },
      apia_decision: me?.apia_decision ?? null,
    } as PlanFarm;
  });
  const planMonth = () => (paidFarm ? today.slice(0, 7) : harvestMonth(scoped.year));
  const plan = once(() => buildFarmPlan(storedFarm(), data(), { month: planMonth() }));
  const farmPlan = (f?: PlanFarm) => (f ? buildFarmPlan(f, data(), { month: planMonth() }) : plan());

  /** The plan with figures that aren't saved yet (Datele planului). A farm on the server keeps its real pension. */
  function previewPlan({ openingBani, expected, pension }: { openingBani: number; expected: HarvestState['expected']; pension: number }) {
    const f = storedFarm();
    return buildFarmPlan(
      {
        ...f,
        start_balance_bani: openingBani,
        pension_plans: me ? f.pension_plans : { monthly_bani: pension, status: 'active' },
        harvests: { years: [], ...f.harvests, gathered: harvests.gathered, expected },
      } as PlanFarm,
      base,
      { month: planMonth() },
    );
  }
  /** Each kind of year, repeated, for the slider on Prognoză. */
  const longForecast = once(() => longForecastFor(storedFarm(), data(), { month: planMonth() }));

  /** A plan entry as Calendar and Acasă show it. */
  function planItem(e: TimelineEntry, month: string): PlanItem {
    const event = e.eventId ? base.calendar.events.find((x) => x.id === e.eventId) : null;
    const apiaTitle = (text: string) => (crop ? `${text}, partea pentru ${crop.name.toLowerCase()}` : text);
    const item = { id: e.id, kind: e.kind, month, date: e.date, window: e.window, amount: e.amount, value: e.value, direction: e.direction, estimated: e.estimated, unverified: e.unverified, event };
    if (e.kind === 'apia_advance') return { ...item, title: apiaTitle('Avansul de la APIA'), sub: between(e.window!, today), icon: 'down', tone: '', task: false, exactDay: true };
    if (e.kind === 'apia_balance') return { ...item, title: apiaTitle('Restul de la APIA'), sub: between(e.window!, today), icon: 'down', tone: '', task: false, exactDay: true };
    if (e.kind === 'crop_sale') return { ...item, title: `Vinzi ${base.crops.crops.find((c) => c.id === e.cropId)?.name_ro_art ?? cropName(e.cropId!).toLowerCase()}`, sub: 'Sumă estimată, în cursul lunii', icon: 'sack', tone: '', task: false, exactDay: false };
    if (e.kind === 'input_cost') return { ...item, title: `${cropName(e.cropId!)}: ${e.what}`, sub: 'Sumă estimată, în cursul lunii', icon: 'tool', tone: 'c', task: false, exactDay: false };
    const admin = e.kind === 'admin';
    const taskId = `${e.eventId}:${(e.window?.end ?? e.date).slice(0, 4)}`;
    return { ...item, id: taskId, title: event?.title_ro ?? '', sub: `${admin ? 'Din' : 'Până pe'} ${date(e.date)}${e.estimated ? ', dată estimată' : ''}`, icon: 'cal', tone: 'b', task: !admin, exactDay: true };
  }

  /** The picked crop, when a crop project is open on a page that follows the picker. */
  const cropOf = (h: Harvest, id: string) => ({
    id,
    name: cropName(id),
    ari: Math.round(cropParcel(h, id)!.areaHa * 100),
    totalAri: h.parcels.reduce((s, p) => s + Math.round(p.areaHa * 100), 0),
    share: (bani: number) => areaShare(bani, h.parcels, id),
    months: (t: Pick<Timeline, 'months'>) => cropMonths(t, h, id),
  });
  const crop = selectedCrop ? cropOf(selected, selectedCrop) : null;

  /** The crop on the strip of tabs. Acasă has one too, though its salary and balance stay the whole farm's. */
  const tabCrop = harvests.crop && cropParcel(scoped, harvests.crop) ? harvests.crop : null;
  const tabbedCrop = tabCrop ? cropOf(scoped, tabCrop) : null;

  /** The whole harvest year. Each crop and the farm's total read this one plan, so they add up. */
  const harvestYearPlan = once(() => harvestPlan(scoped, scopeRecords));

  /** One row per crop, what belongs to no crop (credits, shared costs), and the total. */
  function cropBreakdown(year: keyof FarmPlan['timelines'] = 'medium') {
    const t = harvestYearPlan().timelines[year];
    const sum = (months: Pick<MonthPlan, 'in' | 'out'>[], key: 'in' | 'out') => months.reduce((s, m) => s + m[key], 0);
    const rows = scoped.parcels.map((p) => {
      const months = cropMonths(t, scoped, p.cropId);
      const inBani = sum(months, 'in');
      const outBani = sum(months, 'out');
      return { cropId: p.cropId, name: cropName(p.cropId), areaAri: Math.round(p.areaHa * 100), inBani, outBani, leftBani: inBani - outBani, closed: projectClosed(scoped, p.cropId) };
    });
    const inBani = sum(t.months, 'in');
    const outBani = sum(t.months, 'out');
    return {
      rows,
      shared: { inBani: inBani - rows.reduce((s, r) => s + r.inBani, 0), outBani: outBani - rows.reduce((s, r) => s + r.outBani, 0) },
      total: { inBani, outBani, leftBani: inBani - outBani },
    };
  }

  /* ---- Planned against real ---- */
  function harvestPlan(h: Harvest, records: PageRecord[]) {
    const transactions = records.map(toTransaction);
    const f = { ...storedFarm(), start_balance_bani: h.openingBani, transactions, parcels: h.parcels.map(toParcel), stored_grain: grainInBarn(h, transactions) } as PlanFarm;
    return buildFarmPlan(f, data(), { month: harvestMonth(h.year) });
  }
  /** What should be left when a harvest ends: its records count, and so do salary and pension. */
  function harvestEnd(h: Harvest) {
    const p = harvestPlan(h, h.records);
    const months = p.timelines.medium.months;
    return Math.max(0, months[months.length - 1].balanceEnd - months.length * (p.salary.salary + pensionBani()));
  }
  function harvestPlanned(h: Harvest, cropId: string | null = null): Planned {
    const saved = cropId ? cropParcel(h, cropId)?.planned : h.planned;
    if (saved) return saved;
    const t = harvestPlan(h, []).timelines.medium;
    if (cropId) {
      const months = cropMonths(t, h, cropId);
      return { inBani: months.reduce((s, m) => s + m.in, 0), outBani: months.reduce((s, m) => s + m.out, 0) };
    }
    return { inBani: t.months.reduce((s, m) => s + m.in, 0), outBani: t.months.reduce((s, m) => s + m.out, 0), endBani: t.months[t.months.length - 1].balanceEnd };
  }
  /** Costs shared across crops only reach a crop in its closed result, split by hectares. */
  function harvestActual(h: Harvest, cropId: string | null = null) {
    if (!cropId) return { inBani: moneyIn(h.records), outBani: moneyOut(h.records) };
    const own = h.records.filter((r) => r.cropId === cropId);
    const shared = h.records.filter((r) => !r.cropId);
    const part = (b: number) => areaShare(b, h.parcels, cropId);
    return { inBani: moneyIn(own) + part(moneyIn(shared)), outBani: moneyOut(own) + (projectClosed(h, cropId) ? part(moneyOut(shared)) : 0) };
  }
  /** The rows of the "Plan și realitate" table. Mid-year the gap only shows once the harvest is closed. */
  function compare(h: Harvest, cropId: string | null = null) {
    const p = harvestPlanned(h, cropId);
    const a = harvestActual(h, cropId);
    const ari = (cropId ? h.parcels.filter((x) => x.cropId === cropId) : h.parcels).reduce((s, x) => s + Math.round(x.areaHa * 100), 0);
    const perHa = (bani: number) => Math.round((bani * 100) / (ari || 1));
    const closed = projectClosed(h, cropId);
    return {
      closed,
      rows: [
        { label: 'Intrat', planned: p.inBani, real: a.inBani },
        { label: 'Ieșit', planned: p.outBani, real: a.outBani },
        { label: 'Rămas', planned: p.inBani - p.outBani, real: a.inBani - a.outBani },
        { label: 'Rămas pe hectar', planned: perHa(p.inBani - p.outBani), real: perHa(a.inBani - a.outBani) },
      ],
      note: !cropId ? null : closed ? 'Subvenția și cheltuielile comune sunt împărțite după hectare.' : 'Subvenția e împărțită după hectare. Cheltuielile comune stau la Toată ferma.',
    };
  }

  /** Closes a project on a draft of the harvests, keeping its plan (app.js closeProject). */
  function closeProject(h: Harvest, cropId: string | null = null) {
    for (const p of h.parcels) {
      if ((cropId && p.cropId !== cropId) || projectClosed(h, p.cropId)) continue;
      p.planned = harvestPlanned(h, p.cropId);
      p.status = 'closed';
    }
    if (h.parcels.every((p) => p.status === 'closed')) {
      h.planned = harvestPlanned(h);
      h.status = 'closed';
    }
  }

  const projectName = (h: Pick<Harvest, 'year'>, cropId: string | null = null) => (cropId ? `${cropName(cropId)} ${h.year}` : `Toată ferma ${h.year}`);

  return {
    scope,
    farm,
    today,
    baseYear,
    harvests,
    selected,
    selectedCrop,
    /** The harvest the page works on. */
    scoped,
    crop,
    tabCrop,
    tabbedCrop,
    harvestYearPlan,
    cropBreakdown,
    /** A closed project on a picker page shows only "Plan și realitate" (app.js closedView). */
    closed: !wholeFarm && projectClosed(selected, selectedCrop),
    /** A later harvest is an estimate: only the 2026 rates and dates exist (app.js futureNote). */
    future: !wholeFarm && selected.status === 'open' && selected.year > baseYear,
    nextOpen: openHarvests(harvests)[0] ?? null,
    baseData: () => base,
    data,
    dataWithout,
    cropName,
    figureSource,
    pensionBani,
    storedFarm,
    farmPlan,
    previewPlan,
    longForecast,
    planItem,
    harvestEnd,
    compare,
    closeProject,
    projectName,
  };
}

export type FarmView = ReturnType<typeof farmView>;

/** Reopens a project on a draft of the harvests (app.js reopenProject). Needs no plan. */
export function reopenProject(h: Harvest, cropId: string | null = null) {
  for (const p of h.parcels) {
    p.status ??= h.status;
    if (cropId && p.cropId !== cropId) continue;
    p.status = 'open';
    delete p.planned;
  }
  h.status = 'open';
  delete h.planned;
}

/** A view per FarmState and scope, so every component on a page shares one plan. */
const views = new WeakMap<FarmState, Map<Scope, FarmView>>();
export function viewFor(state: FarmState, scope: Scope): FarmView {
  let byScope = views.get(state);
  if (!byScope) views.set(state, (byScope = new Map()));
  let view = byScope.get(scope);
  if (!view) byScope.set(scope, (view = farmView(state, scope)));
  return view;
}
