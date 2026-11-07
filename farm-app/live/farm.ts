import type { AppData } from '../../packages/shared/src/data/index';
import { ageFromBirthYear, recordHarvestYear, type HarvestsInput, type MovedMoney } from '../../packages/shared/src/farm/index';

/** The part of `/api/me` the pages read. The saved copy holds all of it. */
export interface MeFarm {
  name: string;
  county: string;
  birth_year: number;
  start_balance_bani: number;
  demo_now?: string | null;
  parcels: { crop_id: string; area_ari: number; planted_month?: string | null }[];
  salary_bani?: number | null;
  harvests?: HarvestsInput | null;
  apia_decision?: { campaignYear: number; totalBani: number } | null;
  transactions?: (MovedMoney & { id?: string })[];
  task_completions?: { task_id: string }[];
  pension_plans?: unknown;
  expected_payments?: { id: string }[];
  envelopes?: { kind: string; balance_bani: number }[];
  stripe_account_id?: string | null;
  pension_fund_id?: string | null;
  payouts?: { id: string; status: string }[];
}

const list = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} și ${names[names.length - 1]}`;

/** "15 ha, grâu și porumb". */
function summaryOf(parcels: { cropId: string; areaHa: number }[], data: AppData): string {
  const cropName = (id: string) => data.crops.crops.find((c) => c.id === id)?.name_ro.toLowerCase() ?? id;
  const ari = parcels.reduce((sum, p) => sum + Math.round(p.areaHa * 100), 0);
  return `${String(ari / 100).replace('.', ',')} ha, ${list(parcels.map((p) => cropName(p.cropId)))}`;
}

/** The shape the pages have always read as `CC.FARM`. */
export function farmForPages(me: MeFarm, data: AppData, today: string) {
  const county = data.counties.counties.find((c) => c.code === me.county);
  const parcels = [...me.parcels].sort((a, b) => b.area_ari - a.area_ari);
  return {
    name: me.name,
    age: ageFromBirthYear(me.birth_year, Number(today.slice(0, 4))),
    county: county?.name_ro ?? me.county,
    region: county?.region_ro ?? null,
    startBalanceBani: me.start_balance_bani,
    summary: summaryOf(parcels.map((p) => ({ cropId: p.crop_id, areaHa: p.area_ari / 100 })), data),
    parcels: parcels.map((p) => ({
      cropId: p.crop_id,
      areaHa: p.area_ari / 100,
      ...(p.planted_month ? { plantedMonth: p.planted_month } : {}),
    })),
  };
}

const sorted = (values: (string | undefined)[]) => values.map((v) => v ?? '').sort();

/** Everything the pages read, in an order that doesn't depend on how the rows came back. */
const farmPart = (me: MeFarm) => [
  me.name,
  me.county,
  me.birth_year,
  me.start_balance_bani,
  me.salary_bani ?? null,
  me.harvests ?? null,
  me.apia_decision ?? null,
  me.pension_plans ?? null,
  me.stripe_account_id ?? null,
  me.pension_fund_id ?? null,
  sorted((me.payouts ?? []).map((p) => `${p.id}:${p.status}`)),
  [...me.parcels].sort((a, b) => a.crop_id.localeCompare(b.crop_id)).map((p) => [p.crop_id, p.area_ari, p.planted_month ?? null]),
  sorted((me.transactions ?? []).map((t) => t.id)),
  sorted((me.task_completions ?? []).map((t) => t.task_id)),
  sorted((me.expected_payments ?? []).map((p) => p.id)),
  sorted((me.envelopes ?? []).map((e) => `${e.kind}:${e.balance_bani}`)),
];

/** What a fresh `/api/me` changes. The order of the rows doesn't reload the page. */
export function farmChange(before: MeFarm | null, after: MeFarm): 'none' | 'clock' | 'farm' {
  if (!before || JSON.stringify(farmPart(before)) !== JSON.stringify(farmPart(after))) return 'farm';
  return (before.demo_now ?? null) === (after.demo_now ?? null) ? 'none' : 'clock';
}

export interface PageRecord {
  id: string;
  date: string;
  kind: 'sale' | 'expense' | 'apia_advance' | 'apia_balance';
  amountBani: number;
  cropId?: string;
  category?: string;
  /** Money that arrived through Stripe: it shows on the page, but the farmer can't remove it. */
  fixed?: true;
}

const pageRecord = (t: MeFarm['transactions'] extends (infer R)[] | undefined ? R : never): PageRecord | null => {
  const own = t.kind === 'sale' || t.kind === 'expense';
  if (!own && t.kind !== 'crop_sale' && t.kind !== 'apia_advance' && t.kind !== 'apia_balance') return null;
  return {
    id: t.id ?? '',
    date: t.occurred_at.slice(0, 10),
    kind: t.kind === 'crop_sale' ? 'sale' : (t.kind as PageRecord['kind']),
    amountBani: t.amount_bani,
    ...(t.crop_id ? { cropId: t.crop_id } : {}),
    ...(t.category ? { category: t.category } : {}),
    ...(own ? {} : { fixed: true as const }),
  };
};

/**
 * The state Recolte has always worked on, from the server. The year under way always follows the
 * farm's own parcels and balance, so it can't drift from the plan the salary is paid on.
 */
export function harvestsFromServer(me: MeFarm, year: number, data: AppData, view: { selected?: string; crop?: string | null } = {}) {
  const saved = me.harvests?.years ?? [];
  const before = saved.find((y) => y.year === year);
  const current = {
    ...before,
    year,
    status: before?.status ?? ('open' as const),
    openingBani: me.start_balance_bani,
    parcels: [...me.parcels]
      .sort((a, b) => b.area_ari - a.area_ari)
      .map((p) => ({
        ...before?.parcels.find((x) => x.cropId === p.crop_id),
        cropId: p.crop_id,
        areaHa: p.area_ari / 100,
        ...(p.planted_month ? { plantedMonth: p.planted_month } : {}),
      })),
  };
  const years = [...saved.filter((y) => y.year !== year), current].sort((a, b) => a.year - b.year);
  const known = new Set(years.map((y) => y.year));
  const rows = (me.transactions ?? []).flatMap((t) => {
    const record = pageRecord(t);
    return record ? [{ record, year: recordHarvestYear(t) }] : [];
  });
  const items = years.map((y) => ({
    ...y,
    id: `r${y.year}`,
    summary: summaryOf(y.parcels, data),
    records: rows.filter((r) => (known.has(r.year) ? r.year : year) === y.year).map((r) => r.record),
  }));
  return {
    selected: items.some((h) => h.id === view.selected) ? view.selected! : `r${year}`,
    crop: view.crop ?? null,
    items,
    gathered: me.harvests?.gathered ?? [],
    expected: me.harvests?.expected ?? [],
    ownCrops: me.harvests?.ownCrops ?? [],
  };
}

type Gathered = { cropId: string; areaHa?: number | null; tonnes?: number | null; priceLeiPerKg?: number | null; storedTonnes?: number | null; sown?: string; harvested?: string };

/** Drops what only the page uses, because the document refuses unknown fields. */
const gatheredRows = (rows: Gathered[]): HarvestsInput['gathered'] =>
  rows.flatMap((g) =>
    g.areaHa
      ? [{
          cropId: g.cropId,
          areaHa: g.areaHa,
          tonnes: g.tonnes ?? null,
          priceLeiPerKg: g.priceLeiPerKg ?? null,
          storedTonnes: g.storedTonnes ?? null,
          ...(g.sown ? { sown: g.sown } : {}),
          ...(g.harvested ? { harvested: g.harvested } : {}),
        }]
      : [],
  );

type Planned = { inBani: number; outBani: number; endBani?: number };
const wholePlanned = (p?: Planned) =>
  p && {
    inBani: Math.round(p.inBani),
    outBani: Math.round(p.outBani),
    ...(p.endBani === undefined ? {} : { endBani: Math.round(p.endBani) }),
  };

interface PageHarvest {
  year: number;
  status: 'open' | 'closed';
  openingBani: number;
  illustrative?: boolean;
  planned?: Planned;
  parcels: { cropId: string; areaHa: number; plantedMonth?: string; status?: 'open' | 'closed'; planned?: Planned }[];
}

/** What gets saved from Recolte's state. Records live in transactions, so they stay out. */
export function harvestsDocument(state: {
  items: PageHarvest[];
  gathered: Gathered[];
  expected?: HarvestsInput['expected'];
  ownCrops?: HarvestsInput['ownCrops'];
}): HarvestsInput {
  return {
    years: state.items
      .filter((h) => !h.illustrative)
      .map((h) => ({
        year: h.year,
        status: h.status,
        openingBani: Math.round(h.openingBani),
        parcels: h.parcels.map((p) => ({
          cropId: p.cropId,
          areaHa: p.areaHa,
          ...(p.plantedMonth ? { plantedMonth: p.plantedMonth } : {}),
          ...(p.status ? { status: p.status } : {}),
          ...(p.planned ? { planned: wholePlanned(p.planned) } : {}),
        })),
        ...(h.planned ? { planned: wholePlanned(h.planned) } : {}),
      })),
    gathered: gatheredRows(state.gathered),
    ...(state.expected?.length ? { expected: state.expected } : {}),
    ...(state.ownCrops?.length ? { ownCrops: state.ownCrops } : {}),
  };
}

/** What a finished onboarding saves. Other years stay, if the farm already had some. */
export function onboardingHarvests(input: {
  year: number;
  openingBani: number;
  parcels: PageHarvest['parcels'];
  gathered: Gathered[];
  before?: HarvestsInput | null;
}): HarvestsInput {
  const others = (input.before?.years ?? []).filter((y) => y.year !== input.year);
  const year = { year: input.year, status: 'open' as const, openingBani: input.openingBani, parcels: input.parcels };
  const { expected, ownCrops } = input.before ?? {};
  return {
    years: [...others, year].sort((a, b) => a.year - b.year),
    gathered: gatheredRows(input.gathered),
    ...(expected?.length ? { expected } : {}),
    ...(ownCrops?.length ? { ownCrops } : {}),
  };
}

/**
 * The update_farm call a change to the year under way needs, or null when the farm already says
 * that. Without it the plan would stay on the old hectares. A month can be changed, not cleared.
 */
export function farmEdit(me: MeFarm, harvest: PageHarvest, data: AppData) {
  const months = new Map(me.parcels.map((p) => [p.crop_id, p.planted_month ?? null]));
  const parcels = harvest.parcels.map((p) => ({ ...p, month: p.plantedMonth ?? months.get(p.cropId) ?? null }));
  const key = (rows: { cropId: string; ari: number; month: string | null }[]) =>
    JSON.stringify(rows.map((r) => [r.cropId, r.ari, r.month]).sort());
  const same =
    harvest.openingBani === me.start_balance_bani &&
    key(parcels.map((p) => ({ cropId: p.cropId, ari: Math.round(p.areaHa * 100), month: p.month }))) ===
      key(me.parcels.map((p) => ({ cropId: p.crop_id, ari: p.area_ari, month: p.planted_month ?? null })));
  if (same) return null;
  return {
    name: me.name,
    county: me.county,
    age: ageFromBirthYear(me.birth_year, data.subsidies.meta.campaign_year),
    startBalanceLei: Math.round(harvest.openingBani / 100),
    parcels: parcels.map((p) => ({ cropId: p.cropId, areaHa: p.areaHa, ...(p.month ? { plantedMonth: p.month } : {}) })),
  };
}
