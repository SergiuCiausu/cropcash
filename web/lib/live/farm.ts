import type { AppData } from '../../../packages/shared/src/data/index';
import { ageFromBirthYear, recordHarvestYear, withOwnCrops, type CropLoss, type HarvestsInput, type MovedMoney, type Sowing } from '../../../packages/shared/src/farm/index';

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
  /** Goes up on every harvests save. Sent back as If-Match, so a stale phone can't overwrite (IDEM-12). */
  harvests_version?: number;
  apia_decision?: { campaignYear: number; totalBani: number } | null;
  /** The answers on /rapoarte → „Pentru APIA” (migration 051). */
  apia_facts?: import('../../../packages/shared/src/reports/apia').ApiaAnswers | null;
  /** The animals, the ANSVSA code and the hay (migration 053). */
  livestock?: import('../../../packages/shared/src/reports/livestock').Livestock | null;
  transactions?: (MovedMoney & { id?: string })[];
  task_completions?: { task_id: string }[];
  pension_plans?: unknown;
  expected_payments?: { id: string }[];
  envelopes?: { kind: string; balance_bani: number }[];
  stripe_account_id?: string | null;
  pension_fund_id?: string | null;
  payouts?: { id: string; status: string }[];
  /** The farmer's own calendar events (migration 023). */
  farm_events?: import('../../../packages/shared/src/calendar/events').StoredEvent[];
  /** The farm's people (migration 026), archived ones too. */
  employees?: import('../../../packages/shared/src/payroll/index').StoredEmployee[];
  /** „Lucrările pe câmp le fac oamenii tăi?” Null: not asked yet. */
  own_field_work?: boolean | null;
  /** „Cum lucrezi pământul?” and the arendă hectares, in ari (migration 032). */
  farm_mode?: 'own' | 'arendas';
  leased_in_ari?: number | null;
  leased_out_ari?: number | null;
  /** Landowners and arendă contracts, archived ones too, and „Câți proprietari ai?” (migration 033). */
  landowners?: import('../../../packages/shared/src/arenda/contracts').StoredLandowner[];
  lease_contracts?: import('../../../packages/shared/src/arenda/contracts').StoredContract[];
  landowner_count?: number | null;
  /** The farm's other contracts, their parties and money schedules, archived ones too (migration 048). */
  parties?: import('../../../packages/shared/src/contracts/model').StoredParty[];
  contracts?: import('../../../packages/shared/src/contracts/model').StoredFarmContract[];
  contract_payments?: import('../../../packages/shared/src/contracts/model').StoredContractPayment[];
  /** What the farm is for taxes (migration 049). Null: not asked yet. */
  legal_form?: import('../../../packages/shared/src/contracts/taxes').LegalForm | null;
  vat_status?: import('../../../packages/shared/src/contracts/taxes').VatStatus | null;
  micro_tax?: boolean | null;
  /** The excise schemes the farm follows or joined (migration 052). An approved diesel acord puts the refund in the plan. */
  farm_excise_schemes?: import('../../../packages/shared/src/cashflow/excise').StoredExciseEnrollment[];
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
  /** For the accountant and the diesel refund (migration 027). Litres in hundredths. */
  docNo?: string;
  counterparty?: string;
  fuelLitersCl?: number;
  /** A salary expense: whose pay it was, and their name (migration 026). */
  employeeId?: string;
  who?: string;
}

const pageRecord = (t: MeFarm['transactions'] extends (infer R)[] | undefined ? R : never, names: Map<string, string>): PageRecord | null => {
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
    ...(t.doc_no ? { docNo: t.doc_no } : {}),
    ...(t.counterparty ? { counterparty: t.counterparty } : {}),
    ...(t.fuel_liters_cl ? { fuelLitersCl: t.fuel_liters_cl } : {}),
    ...(t.employee_id ? { employeeId: t.employee_id, ...(names.has(t.employee_id) ? { who: names.get(t.employee_id)! } : {}) } : {}),
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
      .map((p) => {
        const { lost, ...saved } = before?.parcels.find((x) => x.cropId === p.crop_id) ?? {};
        const areaHa = p.area_ari / 100;
        return {
          ...saved,
          cropId: p.crop_id,
          areaHa,
          ...(p.planted_month ? { plantedMonth: p.planted_month } : {}),
          // A loss larger than the crop's hectares now would make every save fail, so it goes.
          ...(lost && lost.ha <= areaHa ? { lost } : {}),
        };
      }),
  };
  const years = [...saved.filter((y) => y.year !== year), current].sort((a, b) => a.year - b.year);
  const known = new Set(years.map((y) => y.year));
  const crops = withOwnCrops(data, me.harvests?.ownCrops).crops.crops;
  const names = new Map((me.employees ?? []).map((e) => [e.id, e.name]));
  const rows = (me.transactions ?? []).flatMap((t) => {
    const record = pageRecord(t, names);
    return record ? [{ record, year: recordHarvestYear(t, crops) }] : [];
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
  parcels: { cropId: string; areaHa: number; plantedMonth?: string; sowing?: Sowing; status?: 'open' | 'closed'; planned?: Planned; lost?: CropLoss }[];
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
          ...(p.sowing ? { sowing: p.sowing } : {}),
          ...(p.status ? { status: p.status } : {}),
          ...(p.planned ? { planned: wholePlanned(p.planned) } : {}),
          ...(p.lost ? { lost: p.lost } : {}),
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
  // Onboarding doesn't ask how a crop was sown or what was lost, so what Recolte saved for it stays.
  const saved = new Map((input.before?.years.find((y) => y.year === input.year)?.parcels ?? []).map((p) => [p.cropId, p]));
  const parcels = input.parcels.map((p) => {
    const sowing = p.sowing ?? saved.get(p.cropId)?.sowing;
    const lost = p.lost ?? saved.get(p.cropId)?.lost;
    // A loss larger than the hectares onboarding now gives the crop no longer means anything.
    return { ...p, ...(sowing ? { sowing } : {}), ...(lost && lost.ha <= p.areaHa ? { lost } : {}) };
  });
  const year = { year: input.year, status: 'open' as const, openingBani: input.openingBani, parcels };
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
