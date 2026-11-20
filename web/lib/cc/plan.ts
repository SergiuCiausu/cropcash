/* The plan as a page sees it: every figure on the pages comes from here (web/legacy/app.js,
   "The plan" to "Planned against real"). A view is built for one FarmState and one scope, and
   each figure is worked out once, on first use. A new FarmState gets a new view, so nothing can
   show figures from before a change. */
import type { AppData } from '../../../packages/shared/src/data/index';
import { isFallow } from '../../../packages/shared/src/data/schemas';
import { activePensionMonthly, finishedCost, harvestCosts, isOwnCrop, latestFinishedCost } from '../../../packages/shared/src/farm/index';
import { afterBadHarvest as afterBadHarvestFor, buildFarmPlan, farmData as farmDataFor, grainInBarn as grainInBarnFor, longForecast as longForecastFor, type FarmPlan } from '../../../packages/shared/src/functions/plan';
import { withCountyYields } from '../../../packages/shared/src/cashflow/county-yields';
import type { PlanFarm } from '../../../packages/shared/src/cashflow/farm-plan';
import { contractImpact } from '../../../packages/shared/src/contracts/impact';
import type { MonthPlan, Timeline, TimelineEntry } from '../../../packages/shared/src/cashflow/timeline';
import type { FarmState, PageFarm } from './farm';
import { between, date, group, MONTHS } from './format';
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
export const WHOLE_FARM_PAGES = ['/acasa', '/bani', '/salariu', '/date-plan', '/pensie', '/oportunitati', '/surse', '/rapoarte', '/de-raportat', '/harta', '/oameni', '/arenda', '/contracte', '/admin'] as const;
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
  /** A sum the farmer put in the calendar; its id is the occurrence id (ev:<event>:<date>). */
  own?: boolean;
  /** Its day passed and the farmer hasn't said whether it happened. */
  overdue?: boolean;
}


/** Builds the view of one FarmState for one scope. Throws if there's no farm (the guard comes first). */
export function farmView(state: FarmState, scope: Scope) {
  if (!state.baseFarm || !state.harvests) throw new Error('No farm to show: the sign-in guard runs before the pages.');
  const { me, today, baseYear, farmData: appData } = state;
  /* Every figure below plans with this county's yields. The farm holds the county's name or its code. */
  const countyName = state.baseFarm.county;
  const base = withCountyYields(appData, appData.counties.counties.find((c) => c.name_ro === countyName || c.code === countyName)?.code);
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
      /* The farmer's own planned sums: in a crop's project, only that crop's. */
      farm_events: selectedCrop ? state.events.filter((e) => e.crop_id === selectedCrop) : state.events,
      /* The diesel refund: the whole farm's diesel, so not in one crop's project (docs/accize-plan.md §3). */
      ...(!selectedCrop ? { farm_excise_schemes: state.excise } : {}),
      /* Ion's example contracts (a signed-in farm plans from its copy above). Not in one crop's project. */
      ...(state.isIon && !selectedCrop
        ? { parties: state.contracts.parties, contracts: state.contracts.contracts, contract_payments: state.contracts.payments, tax_profile: state.contracts.profile }
        : {}),
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
  /** What one contract weighs: per year, its share, the salary without it, what's left (docs/contracts-plan.md §5.2). */
  const contractImpactOf = (id: string) => contractImpact(storedFarm(), data(), id, { month: planMonth() });
  /** Each kind of year, repeated, for the slider on Prognoză. */
  const longForecast = once(() => longForecastFor(storedFarm(), data(), { month: planMonth() }));
  /** What a bad harvest does in the spring after it. */
  const afterBadHarvest = once(() => afterBadHarvestFor(storedFarm(), data(), { month: planMonth() }));

  /** A plan entry as Calendar and Acasă show it. */
  function planItem(e: TimelineEntry, month: string): PlanItem {
    const event = e.eventId ? base.calendar.events.find((x) => x.id === e.eventId) : null;
    const apiaTitle = (text: string) => (crop ? `${text}, partea pentru ${crop.name.toLowerCase()}` : text);
    const item = { id: e.id, kind: e.kind, month, date: e.date, window: e.window, amount: e.amount, value: e.value, direction: e.direction, estimated: e.estimated, unverified: e.unverified, event };
    if (e.kind === 'apia_advance') return { ...item, title: apiaTitle('Avansul de la APIA'), sub: between(e.window!, today), icon: 'down', tone: '', task: false, exactDay: true };
    if (e.kind === 'apia_balance') return { ...item, title: apiaTitle('Restul de la APIA'), sub: between(e.window!, today), icon: 'down', tone: '', task: false, exactDay: true };
    if (e.kind === 'crop_sale') return { ...item, title: `Vinzi ${base.crops.crops.find((c) => c.id === e.cropId)?.name_ro_art ?? cropName(e.cropId!).toLowerCase()}`, sub: 'Sumă estimată, în cursul lunii', icon: 'sack', tone: '', task: false, exactDay: false };
    if (e.kind === 'farmer_in' || e.kind === 'farmer_out')
      return { ...item, title: e.what ?? '', sub: e.overdue ? (e.direction === 'in' ? 'Ziua a trecut. Ai primit banii?' : 'Ziua a trecut. Ai plătit?') : 'Suma ta', icon: e.direction === 'in' ? 'down' : 'tool', tone: e.direction === 'in' ? '' : 'c', task: false, exactDay: !e.overdue, own: true, ...(e.overdue ? { overdue: true } : {}) };
    if (e.kind === 'payroll') return { ...item, title: `Salariu: ${e.what ?? 'un om de la fermă'}`, sub: 'Tot ce te costă, pe ziua de plată', icon: 'up', tone: 'c', task: false, exactDay: true };
    if (e.kind === 'rent' || e.kind === 'rent_in') {
      const kind = e.rentKg ? `${group(e.rentKg)} kg ${cropName(e.cropId!).toLowerCase()}` : '';
      const who = e.what ?? 'un proprietar';
      if (e.kind === 'rent_in') return { ...item, title: `Arenda de la ${who}`, sub: kind ? `${kind}, de vândut. Suma e estimată` : 'După ce își reține impozitul', icon: 'down', tone: '', task: false, exactDay: false };
      return {
        ...item,
        title: kind ? `Arenda pentru ${who}: ${kind} de cumpărat` : `Arenda pentru ${who}`,
        sub: kind ? 'Nu cultivi ce cere contractul, deci cumperi. Sumă estimată' : `În bani, fără impozitul pe care îl reții${e.estimated ? '. Luna e estimată' : ''}`,
        icon: 'up',
        tone: 'c',
        task: false,
        exactDay: false,
      };
    }
    if (e.kind === 'rent_tax') return { ...item, title: `Impozitul reținut din arenda lui ${e.what ?? 'un proprietar'}`, sub: `Îl plătești statului până pe ${date(e.date)}. Formularul ți-l spune contabilul`, icon: 'cal', tone: 'c', task: false, exactDay: true };
    if (e.kind === 'contract_in' || e.kind === 'contract_out') {
      const who = e.what ?? 'cealaltă parte';
      if (e.rentKg) return { ...item, title: `Contractul cu ${who}: ${group(e.rentKg)} kg ${cropName(e.cropId!).toLowerCase()} de cumpărat`, sub: 'Recolta nu ajunge pentru plata în natură. Sumă estimată', icon: 'up', tone: 'c', task: false, exactDay: false };
      return e.kind === 'contract_in'
        ? { ...item, title: `Bani de la ${who}`, sub: 'Din contract, fără TVA', icon: 'down', tone: '', task: false, exactDay: true }
        : { ...item, title: `Plata către ${who}`, sub: 'Din contract, fără TVA', icon: 'up', tone: 'c', task: false, exactDay: true };
    }
    if (e.kind === 'contract_tax') {
      const who = e.what ?? 'cealaltă parte';
      const tax = { ...item, icon: 'cal', tone: 'c' as PlanItem['tone'], task: false, exactDay: true };
      if (e.id.startsWith('contract-vat-cost:')) return { ...tax, title: `TVA pe factura de la ${who}`, sub: 'Nu-l primești înapoi: e un cost' };
      if (e.id.startsWith('contract-vat:'))
        return e.direction === 'in'
          ? { ...tax, title: `TVA încasat de la ${who}`, sub: 'Îl dai statului cu decontul, pe 25 a lunii de după' }
          : { ...tax, title: `TVA plătit lui ${who}`, sub: 'Îl primești înapoi prin decont' };
      if (e.id.includes(':micro_tax:')) return { ...tax, title: 'Impozitul micro', sub: `Pe vânzările către ${who}. Îl plătești până pe ${date(e.date)}` };
      return e.direction === 'in'
        ? { ...tax, tone: '', title: 'TVA înapoi de la stat', sub: `Pentru contractul cu ${who}, din decontul 300` }
        : { ...tax, title: 'TVA de plătit statului', sub: `Pentru contractul cu ${who}, decontul 300, până pe ${date(e.date)}` };
    }
    if (e.kind === 'excise_refund') {
      // e.what is the quarter, YYYY-Qn (cashflow/excise.ts).
      const q = e.what ? `trimestrul ${['I', 'II', 'III', 'IV'][Number(e.what.slice(-1)) - 1]} din ${e.what.slice(0, 4)}` : 'un trimestru';
      return { ...item, title: 'Banii înapoi de la motorină', sub: `${between(e.window!, today)}, pentru ${q}`, icon: 'down', tone: '', task: false, exactDay: false };
    }
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
    // Fallow land is never harvested, so it never holds a year open.
    if (h.parcels.every((p) => p.status === 'closed' || isFallow(p.cropId))) {
      h.planned = harvestPlanned(h);
      h.status = 'closed';
    }
  }

  /** The hectares a per-hectare figure is counted on, in ari: one crop's in a harvest, or all of them.
      The harvest the page works on unless another is given. 0 when the crop isn't in it. */
  const areaAri = (cropId: string | null = null, h: Pick<Harvest, 'parcels'> = scoped) =>
    h.parcels.filter((p) => !cropId || p.cropId === cropId).reduce((s, p) => s + Math.round(p.areaHa * 100), 0);

  const projectName = (h: Pick<Harvest, 'year'>, cropId: string | null = null) => (cropId ? `${cropName(cropId)} ${h.year}` : `Toată ferma ${h.year}`);

  /* ---- What each crop really cost, from what was noted ---- */
  function costsOf(h: Harvest, records: PageRecord[] = h.records) {
    return harvestCosts({ year: h.year, status: h.status, parcels: h.parcels, records: records.filter((r) => r.kind === 'expense') }, base.crops.crops, today);
  }
  const allCosts = once(() => harvests.items.map((h) => costsOf(h)));
  /** The figure "Folosește cifra asta" offers: the most recent finished harvest with such costs. */
  const latestOwnCost = (cropId: string) => latestFinishedCost(allCosts(), cropId);
  const costFromHarvest = (cropId: string, year: number) => finishedCost(allCosts(), cropId, year);

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
    contractImpact: contractImpactOf,
    longForecast,
    afterBadHarvest,
    planItem,
    harvestEnd,
    compare,
    closeProject,
    projectName,
    areaAri,
    costsOf,
    latestOwnCost,
    costFromHarvest,
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
