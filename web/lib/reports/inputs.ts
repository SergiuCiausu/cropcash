/* From the farm the pages read to a report. Everything comes from the saved farm and the whole-farm
   view (lib/cc/plan.ts), so a report works offline and on Ion's farm, and says what the pages say. */
import {
  currentPeriod,
  FuelExciseSchema,
  landOf,
  periodOf,
  recentPeriods,
  recordsInPeriod,
  treatmentsOf,
  type ExpectedSubsidy,
  type Period,
  type PeriodKind,
} from '../../../packages/shared/src/reports/index';
import type { FarmPlots } from '../../../packages/shared/src/plots/wire';
import { isFallow } from '../../../packages/shared/src/data/schemas';
import fuelExcise from '../../../docs/data/fuel-excise.json';
import { STALE_DAYS } from '../../components/app/NetBanner';
import type { FarmState } from '../cc/farm';
import type { FarmView } from '../cc/plan';
import { expenseLabel } from '../ui/categories';
import { cropMarginsReport, farmSummaryReport, fuelExciseReport, landSummaryReport, ledgerReport, phytoRegisterReport, subsidiesReport, type ReportId } from './build';

/** The diesel refund rate (docs/data/fuel-excise.json), DE-VERIFICAT. */
const FUEL_RATE = FuelExciseSchema.parse(fuelExcise);

/** The reports that read the parcels on the map (/harta). */
export const NEEDS_PLOTS: ReadonlySet<ReportId> = new Set(['phyto-register', 'land-summary']);
import type { ReportContext, ReportModel } from './model';

/** How many periods the picker offers, newest first. */
const CHOICES: Record<PeriodKind, number> = { month: 12, quarter: 8, year: 3, harvest: 0 };

/** The periods the picker offers. Harvests are the farm's own; the others count back from today. */
export function periodChoices(kind: PeriodKind, state: Pick<FarmState, 'harvests' | 'today'>): Period[] {
  if (kind !== 'harvest') return recentPeriods(kind, state.today, CHOICES[kind]);
  const years = [...new Set((state.harvests?.items ?? []).map((h) => h.year))].sort((a, b) => b - a);
  return years.length ? years.map((y) => periodOf('harvest', String(y))) : [currentPeriod('harvest', state.today)];
}

/** The copy's day, when it is a week old or more. */
export function staleSince(copyAt: string | null, now: number): string | null {
  if (!copyAt) return null;
  return (now - Date.parse(copyAt)) / 864e5 >= STALE_DAYS ? copyAt.slice(0, 10) : null;
}

export function reportContext(state: FarmState, view: FarmView, now: number): ReportContext {
  return {
    farmName: view.farm.name,
    county: view.farm.county,
    farmSummary: state.baseFarm?.summary ?? view.farm.summary,
    today: view.today,
    staleSince: staleSince(state.copyAt, now),
    example: state.isIon,
    cropName: (id) => view.cropName(id) || id,
    categoryName: expenseLabel,
  };
}

/** APIA payments the plan still expects, as the calendar shows them. */
function expectedSubsidies(view: FarmView): ExpectedSubsidy[] {
  return view
    .farmPlan()
    .timelines.medium.months.flatMap((m) => m.entries)
    .filter((e): e is typeof e & { kind: ExpectedSubsidy['kind'] } => e.kind === 'apia_advance' || e.kind === 'apia_balance')
    .map((e) => ({ kind: e.kind, date: e.date, window: e.window, amountBani: e.value, estimated: e.estimated, unverified: e.unverified }));
}

/** The next sums in the plan, from today to the end of the period. */
function upcoming(view: FarmView, period: Period, max = 8) {
  return view
    .farmPlan()
    .timelines.medium.months.flatMap((m) => m.entries.map((e) => ({ e, month: m.key })))
    .filter(({ e }) => e.direction !== 'none' && e.value > 0 && e.date >= view.today && e.date <= period.end)
    .sort((a, b) => a.e.date.localeCompare(b.e.date))
    .slice(0, max)
    .map(({ e, month }) => ({ date: e.date, title: view.planItem(e, month).title, amountBani: e.value, direction: e.direction as 'in' | 'out' }));
}

/** One report for one period. `view` is the whole-farm view (scope 'farm'); `plots` the farm's parcels for that year. */
export function makeReport(id: ReportId, period: Period, state: FarmState, view: FarmView, now = Date.now(), plots: FarmPlots | null = null): ReportModel {
  const ctx = reportContext(state, view, now);
  const items = state.harvests?.items ?? [];
  const records = recordsInPeriod(period, items);
  if (id === 'ledger') return ledgerReport(ctx, records, period);
  if (id === 'subsidies') {
    const decision = state.me?.apia_decision;
    const decisionBani = decision && period.kind === 'harvest' && decision.campaignYear === +period.key ? decision.totalBani : null;
    return subsidiesReport(ctx, records, expectedSubsidies(view), period, decisionBani);
  }
  if (id === 'fuel-excise') return fuelExciseReport(ctx, records, FUEL_RATE, period);
  const empty: FarmPlots = { plots: [], seasons: [], operations: [] };
  if (id === 'phyto-register') return phytoRegisterReport(ctx, treatmentsOf(plots ?? empty, period), period);
  const h = items.find((x) => x.year === +period.key);
  if (id === 'land-summary') {
    const land = landOf(plots ?? empty, +period.key);
    /* Nothing on the map: the hectares per crop the harvest itself holds. */
    const crops = land.rows.length ? land.crops : (h?.parcels ?? []).map((p) => ({ cropId: p.cropId, ari: Math.round(p.areaHa * 100) }));
    return landSummaryReport(ctx, { rows: land.rows, crops }, period);
  }
  if (id === 'crop-margins') {
    const real = (rows: { label: string; real: number }[], label: string) => rows.find((r) => r.label === label)?.real ?? 0;
    const parcels = (h?.parcels ?? []).filter((p) => !isFallow(p.cropId));
    const crops = h
      ? parcels.map((p) => {
          const c = view.compare(h, p.cropId);
          return { cropId: p.cropId, areaAri: Math.round(p.areaHa * 100), inBani: real(c.rows, 'Intrat'), outBani: real(c.rows, 'Ieșit'), closed: c.closed };
        })
      : [];
    const all = h ? view.compare(h).rows : [];
    const whole = { inBani: real(all, 'Intrat'), outBani: real(all, 'Ieșit'), areaAri: (h?.parcels ?? []).reduce((s, p) => s + Math.round(p.areaHa * 100), 0) };
    return cropMarginsReport(ctx, crops, whole, period);
  }
  const compare = h ? view.compare(h) : null;
  return farmSummaryReport(
    ctx,
    {
      records,
      parcels: (h?.parcels ?? view.farm.parcels).map((p) => ({ cropId: p.cropId, areaAri: Math.round(p.areaHa * 100) })),
      compare: compare?.rows ?? [],
      closed: compare?.closed ?? false,
      salaryBani: view.farmPlan().monthlySalary,
      pensionBani: view.pensionBani(),
      upcoming: upcoming(view, period),
    },
    period,
  );
}
