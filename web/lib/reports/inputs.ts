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
import { plotPlace } from '../cc/places';
import { fuelClaimReport, fuelPriorReport, surfaceSheetReport, type PriorCrop, type SurfaceRow } from './apia';
import { checklistReport, coupledProofReport, ecoPd04Report, fertilizerRegisterReport, noticeReport, type CoupledCrop } from './apia-more';
import { APIA_PAPERS, farmFilings, LIVESTOCK } from './apia-filings';
import { activeFarmerReport, animalDecontReport, hayReport, livestockReport, type Herd } from './animals';
import { animalFuel, uvmMilli } from '../../../packages/shared/src/reports/index';
import coupledJson from '../../../docs/data/apia-coupled.json';
import { ApiaCoupledFileSchema, coupledSchemeOf } from '../../../packages/shared/src/reports/index';
import { cropNitrogenLimit } from '../../../packages/shared/src/fertilizers/nitrogen';
import { loadFertilizerData } from '../../../packages/shared/src/fertilizers/data';
import { diversificationKeyOf } from '../../../packages/shared/src/data/catalogue';
import { cropMarginsReport, farmSummaryReport, fuelExciseReport, landSummaryReport, ledgerReport, phytoRegisterReport, subsidiesReport, type ReportId } from './build';

/** The diesel refund rate (docs/data/fuel-excise.json), DE-VERIFICAT. */
const FUEL_RATE = FuelExciseSchema.parse(fuelExcise);
/** The crops with coupled support (docs/data/apia-coupled.json). */
const COUPLED = ApiaCoupledFileSchema.parse(coupledJson);

/** The reports that read the parcels on the map (/harta). */
export const NEEDS_PLOTS: ReadonlySet<ReportId> = new Set([
  'phyto-register',
  'land-summary',
  'apia-surface',
  'apia-fuel-prior',
  'apia-coupled',
  'apia-eco-pd04',
  'fertilizer-register',
  'apia-notice',
  'apia-checklist',
  'apia-hay',
  'apia-animal-decont',
  'apia-active-farmer',
]);
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

/**
 * A crop's line in the APIA table: the code read off the cerere when there is one, else the code of the
 * crop's own line, and the name as APIA writes it.
 */
function apiaLine(view: FarmView) {
  const catalogue = view.data().catalogue;
  return (cropId: string | null, code: number | null) => {
    const line = (code ? catalogue.find((c) => c.code === code) : undefined) ?? (cropId ? catalogue.find((c) => c.id === cropId) : undefined);
    return {
      cropId,
      code: code ?? line?.code ?? null,
      heading: line?.heading ?? null,
      section: line?.section ?? null,
      name: line?.apia_name ?? (cropId ? view.cropName(cropId) || cropId : 'fără cultură'),
    };
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
/** Extra words a report takes from its card: the notice's „Ce s-a întâmplat”. */
export interface ReportExtra {
  text?: string;
}

export function makeReport(id: ReportId, period: Period, state: FarmState, view: FarmView, now = Date.now(), plots: FarmPlots | null = null, extra: ReportExtra = {}): ReportModel {
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
  if (id === 'apia-fuel-claim') return fuelClaimReport(ctx, records, FUEL_RATE, period);
  const empty: FarmPlots = { plots: [], seasons: [], operations: [] };
  if (id === 'apia-surface' || id === 'apia-fuel-prior') {
    const year = +period.key;
    const line = apiaLine(view);
    const land = landOf(plots ?? empty, year);
    const harvestParcels = (items.find((x) => x.year === year)?.parcels ?? view.farm.parcels).filter((p) => p.areaHa > 0);
    if (id === 'apia-surface') {
      const rows: SurfaceRow[] = land.rows.length
        ? land.rows.map(({ plot, season }) => {
            const l = line(season.crop_id, season.apia_crop_code);
            return {
              place: plot.siruta ? plotPlace(plot) : null,
              siruta: plot.siruta,
              bloc: plot.bloc_fizic,
              parcelNo: plot.parcel_no,
              landUse: plot.land_use,
              code: l.code,
              crop: l.name,
              ari: season.area_ari,
              secondCrop: season.second_crop_id ? ctx.cropName(season.second_crop_id) : null,
            };
          })
        : harvestParcels.map((p) => {
            const l = line(p.cropId, null);
            return { place: null, siruta: null, bloc: null, parcelNo: null, landUse: null, code: l.code, crop: l.name, ari: Math.round(p.areaHa * 100), secondCrop: null };
          });
      return surfaceSheetReport(ctx, { rows, fromMap: land.rows.length > 0 }, period);
    }
    const crops: PriorCrop[] = land.rows.length
      ? land.rows.map(({ season }) => ({ ...line(season.crop_id, season.apia_crop_code), ari: season.area_ari }))
      : harvestParcels.map((p) => ({ ...line(p.cropId, null), ari: Math.round(p.areaHa * 100) }));
    return fuelPriorReport(ctx, crops.filter((c) => !isFallow(c.cropId ?? '')), FUEL_RATE, period, animalFuel(LIVESTOCK, FUEL_RATE.caps_l_per_uvm, state.livestock));
  }
  if (id === 'phyto-register') return phytoRegisterReport(ctx, treatmentsOf(plots ?? empty, period), period);
  const more = apiaMore(id, period, state, view, plots ?? empty, ctx, extra);
  if (more) return more;
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

/** The phase 2 APIA papers (lib/reports/apia-more.ts), or null for another report. */
function apiaMore(id: ReportId, period: Period, state: FarmState, view: FarmView, plots: FarmPlots, ctx: ReportContext, extra: ReportExtra): ReportModel | null {
  if (!['apia-coupled', 'apia-eco-pd04', 'fertilizer-register', 'apia-notice', 'apia-checklist', 'apia-livestock', 'apia-hay', 'apia-animal-decont', 'apia-active-farmer'].includes(id)) return null;
  const year = period.kind === 'harvest' ? +period.key : +period.key.slice(0, 4);
  const items = state.harvests?.items ?? [];
  const data = view.data();
  const line = apiaLine(view);
  const land = landOf(plots, year);
  const harvestParcels = (items.find((x) => x.year === year)?.parcels ?? view.farm.parcels).filter((p) => p.areaHa > 0);
  /* The crops of the campaign: off the map when it has them, else the harvest's own parcels. */
  const crops = land.rows.length
    ? land.rows.map(({ plot, season }) => ({ ...line(season.crop_id, season.apia_crop_code), ari: season.area_ari, plot, season }))
    : harvestParcels.map((p) => ({ ...line(p.cropId, null), ari: Math.round(p.areaHa * 100), plot: null, season: null }));

  if (id === 'apia-coupled') {
    const records = recordsInPeriod(periodOf('harvest', String(year)), items);
    const chosen = state.apiaAnswers?.coupledCrops;
    const bySchema = new Map<string, CoupledCrop>();
    const counted = new Set<string>();
    for (const c of crops) {
      const scheme = coupledSchemeOf(COUPLED, c.code);
      if (!scheme || (chosen && c.cropId && !chosen.includes(c.cropId))) continue;
      const entry = bySchema.get(scheme.id) ?? { scheme, crops: [], harvestedKg: null, storedKg: null, sales: [], seeds: [] };
      bySchema.set(scheme.id, entry);
      const same = entry.crops.find((x) => x.name === c.name);
      if (same) same.ari += c.ari;
      else entry.crops.push({ name: c.name, ari: c.ari });
      /* A crop on several parcels: its harvest and records count once. */
      if (!c.cropId || counted.has(c.cropId)) continue;
      counted.add(c.cropId);
      const g = state.harvests?.gathered.find((x) => x.cropId === c.cropId);
      if (g && g.tonnes !== null) {
        entry.harvestedKg = (entry.harvestedKg ?? 0) + Math.round(g.tonnes * 1000);
        entry.storedKg = (entry.storedKg ?? 0) + Math.round((g.storedTonnes ?? 0) * 1000);
      }
      for (const r of records) {
        if (r.cropId !== c.cropId) continue;
        if (r.kind === 'sale') entry.sales.push(r);
        if (r.kind === 'expense' && r.category === 'seeds') entry.seeds.push(r);
      }
    }
    return coupledProofReport(ctx, [...bySchema.values()], period);
  }

  if (id === 'apia-eco-pd04') {
    const scheme = data.subsidies.schemes.find((x) => x.code === 'PD-04');
    const rules = (scheme?.eligibility.rules ?? []) as { field?: string; op?: string; value?: number; if?: { op: string; value: number }; then?: { value: number }[] }[];
    const plain = rules.find((r) => r.field === 'arable_ha' && r.op === '>=');
    const div = rules.find((r) => r.if?.op === '<=' && r.then?.length);
    const minParcel = (scheme?.eligibility as { parcel_min_ha?: { value: number } } | undefined)?.parcel_min_ha;
    const key = diversificationKeyOf(data);
    const done = (plotId: string, kind: string) =>
      plots.operations
        .filter((o) => o.plot_id === plotId && o.harvest_year === year && o.kind === kind && o.status === 'done' && o.on_date)
        .sort((a, b) => a.on_date!.localeCompare(b.on_date!));
    const arable = crops.filter((c) => (c.plot ? c.plot.land_use === 'TA' || c.plot.land_use === null : !c.section || c.section.startsWith('I.')) && !isFallow(c.cropId ?? ''));
    return ecoPd04Report(
      ctx,
      arable.map((c) => ({
        name: c.plot?.name ?? c.name,
        crop: c.name,
        cropKey: c.cropId ? key(c.cropId) : c.name,
        ari: c.ari,
        sownOn: c.season?.sown_on ?? (c.plot ? (done(c.plot.id, 'sowing')[0]?.on_date ?? null) : null),
        harvestedOn: c.season?.harvested_on ?? (c.plot ? (done(c.plot.id, 'harvest')[0]?.on_date ?? null) : null),
        cover: c.season?.second_crop_id ? ctx.cropName(c.season.second_crop_id) : null,
        soilWork: c.plot ? done(c.plot.id, 'soil_work').map((o) => o.on_date!) : [],
      })),
      {
        minArableAri: plain?.value != null ? Math.round(plain.value * 100) : null,
        minCrops: div?.then?.[0]?.value ?? null,
        cropsUpToAri: div?.if ? Math.round(div.if.value * 100) : null,
        parcelMinAri: minParcel ? Math.round(minParcel.value * 100) : null,
      },
      period,
    );
  }

  if (id === 'fertilizer-register') {
    const limits = loadFertilizerData().limits;
    const plan = new Map<string, { crop: string; ari: number; limitKgHa: number | null }>();
    for (const c of crops) {
      if (!c.cropId || isFallow(c.cropId)) continue;
      const row = plan.get(c.cropId) ?? { crop: c.name, ari: 0, limitKgHa: cropNitrogenLimit(limits, c.cropId) };
      row.ari += c.ari;
      plan.set(c.cropId, row);
    }
    const byPlot = new Map(plots.plots.map((p) => [p.id, p]));
    const inside = (o: { harvest_year: number; on_date: string | null }) =>
      period.kind === 'harvest' ? o.harvest_year === year : !!o.on_date && o.on_date >= period.start && o.on_date <= period.end;
    const rows = plots.operations
      .filter((o) => o.kind === 'fertilizing' && o.status === 'done' && inside(o))
      .sort((a, b) => (a.on_date ?? '9999').localeCompare(b.on_date ?? '9999') || a.id.localeCompare(b.id))
      .map((o) => {
        const season = plots.seasons.find((x) => x.plot_id === o.plot_id && x.harvest_year === o.harvest_year);
        return {
          onDate: o.on_date,
          parcel: byPlot.get(o.plot_id)?.name ?? '',
          crop: season?.crop_id ? ctx.cropName(season.crop_id) : '',
          product: o.product ?? null,
          dose: o.dose ?? null,
          ari: season?.area_ari ?? null,
        };
      });
    return fertilizerRegisterReport(ctx, [...plan.values()], rows, period);
  }

  if (id === 'apia-notice') {
    return noticeReport(
      ctx,
      crops.map((c) => ({ bloc: c.plot?.bloc_fizic ?? null, parcelNo: c.plot?.parcel_no ?? null, crop: c.name, ari: c.ari })),
      extra.text ?? '',
      period,
    );
  }

  if (id === 'apia-checklist') return checklistReport(ctx, farmFilings(state, view, plots, year), period);

  const herd: Herd = { livestock: state.livestock, file: LIVESTOCK, uvm: uvmMilli(LIVESTOCK, state.livestock) };
  if (id === 'apia-livestock') return livestockReport(ctx, herd, period);
  /* Permanent grassland: PP on the map, else the crops of the APIA section II. */
  const grassland = crops
    .filter((c) => (c.plot ? c.plot.land_use === 'PP' : !!c.section?.startsWith('II.')))
    .map((c) => ({ name: c.plot?.name ?? c.name, bloc: c.plot?.bloc_fizic ?? null, ari: c.ari }));
  if (id === 'apia-hay') {
    const hay = state.livestock?.hay;
    return hayReport(ctx, { grassland, herd, hayTenths: hay && hay.year === year ? hay.tenthsTonnes : null }, period);
  }
  if (id === 'apia-animal-decont') return animalDecontReport(ctx, herd, grassland, period);

  /* apia-active-farmer: the arable parcels with their sowing, and the input invoices of the campaign. */
  const sowing = (plotId: string) =>
    plots.operations.filter((o) => o.plot_id === plotId && o.harvest_year === year && o.kind === 'sowing' && o.status === 'done' && o.on_date).sort((a, b) => a.on_date!.localeCompare(b.on_date!))[0]?.on_date ?? null;
  const arable = crops.filter((c) => (c.plot ? c.plot.land_use === 'TA' || c.plot.land_use === null : !c.section || c.section.startsWith('I.')) && !isFallow(c.cropId ?? ''));
  const invoices = recordsInPeriod(periodOf('harvest', String(year)), items)
    .filter((r) => r.kind === 'expense' && (r.category === 'seeds' || r.category === 'fertilizer' || r.category === 'treatments'))
    .sort((a, b) => a.date.localeCompare(b.date));
  const deadline = APIA_PAPERS.papers.find((p) => p.report === 'apia-active-farmer')?.deadline?.end ?? null;
  return activeFarmerReport(
    ctx,
    arable.map((c) => ({ name: c.plot?.name ?? c.name, crop: c.name, cropId: c.cropId, ari: c.ari, sownOn: c.season?.sown_on ?? (c.plot ? sowing(c.plot.id) : null) })),
    invoices,
    deadline,
    period,
  );
}

/** The farm's crops of the campaign that have coupled support (apia-coupled.json), for „Ai cerut sprijin cuplat?”. */
export function coupledCandidates(state: FarmState, view: FarmView, plots: FarmPlots | null, year: number): { cropId: string; name: string }[] {
  const line = apiaLine(view);
  const land = landOf(plots ?? { plots: [], seasons: [] }, year);
  const lines = land.rows.length
    ? land.rows.map(({ season }) => line(season.crop_id, season.apia_crop_code))
    : ((state.harvests?.items ?? []).find((x) => x.year === year)?.parcels ?? view.farm.parcels).map((p) => line(p.cropId, null));
  const out = new Map<string, string>();
  for (const l of lines) if (l.cropId && coupledSchemeOf(COUPLED, l.code)) out.set(l.cropId, view.cropName(l.cropId) || l.name);
  return [...out].map(([cropId, name]) => ({ cropId, name }));
}
