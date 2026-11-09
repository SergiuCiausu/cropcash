import { z } from 'zod';
import type { AppData } from '../data';
import type { Bani } from '../money';
import { CostLeiPerHa, HarvestYearSchema, harvestYear, recordHarvestYear, type HarvestsInput } from './harvests';
import type { StoredFarm } from './index';
import { withOwnCrops } from './own-crops';
import { EXPENSE_CATEGORIES, PLANNED_CATEGORIES } from './plan-inputs';

/**
 * What a crop really cost per hectare, worked out only from the expenses the farmer recorded.
 * No estimate and no AI goes into it, so the same records always give the same figure, on the
 * phone and on the API.
 */

export interface CostParcel {
  cropId: string;
  areaHa: number;
}

export interface CostRecord {
  cropId?: string | null;
  /** A row without a category isn't the farmer's own: the demo clock pays the plan's average that way. */
  category?: string | null;
  /** Bani. The sign is ignored. */
  amountBani: number;
}

export interface CategoryCost {
  category: string;
  /** Recorded for this crop. */
  direct: Bani;
  /** This crop's part, by hectares, of what was recorded for the whole farm. */
  shared: Bani;
  total: Bani;
  perHa: Bani;
}

export interface CropCost {
  cropId: string;
  areaAri: number;
  /** Only the categories with money in them, in the order of EXPENSE_CATEGORIES. */
  categories: CategoryCost[];
  direct: Bani;
  shared: Bani;
  total: Bani;
  perHa: Bani;
  /** Only what the plan's crop cost stands for: rent and repairs are left out, or they'd count twice. */
  planCost: Bani;
  planPerHa: Bani;
}

export interface SeasonCropCost extends CropCost {
  /** Closed, or past its harvest month. Until then the figure is only "so far". */
  seasonDone: boolean;
}

export interface HarvestCosts {
  year: number;
  crops: SeasonCropCost[];
  /** Recorded for a crop that isn't in this harvest, so it's in no crop's figure. */
  elsewhere: Bani;
}

/** A part of `bani` by hectares. The parts add up to exactly `bani`: the first crop takes what's left from rounding. */
export function areaShare(bani: number, parcels: CostParcel[], cropId: string): number {
  const ari = parcels.map((p) => Math.round(p.areaHa * 100));
  const total = ari.reduce((s, a) => s + a, 0) || 1;
  const shares = ari.map((a) => Math.floor((bani * a) / total));
  shares[0]! += bani - shares.reduce((s, v) => s + v, 0);
  return shares[parcels.findIndex((p) => p.cropId === cropId)] ?? 0;
}

const CATEGORIES: readonly string[] = EXPENSE_CATEGORIES;

/** Each crop's recorded costs per hectare. The order of the parcels and of the records doesn't matter. */
export function cropCostsPerHa(parcels: CostParcel[], records: CostRecord[]): { crops: CropCost[]; elsewhere: Bani } {
  // A fixed order, so the bani left over from rounding always land on the same crop.
  const sorted = [...parcels].sort((a, b) => (a.cropId < b.cropId ? -1 : a.cropId > b.cropId ? 1 : 0));
  const ids = new Set(sorted.map((p) => p.cropId));
  const direct = new Map<string, Bani>();
  const shared = new Map<string, Bani>();
  const add = (map: Map<string, Bani>, key: string, bani: Bani) => map.set(key, (map.get(key) ?? 0) + bani);
  const key = (cropId: string, category: string) => `${cropId}|${category}`;
  let elsewhere = 0;
  for (const r of records) {
    if (!r.category || !CATEGORIES.includes(r.category)) continue;
    const bani = Math.abs(r.amountBani);
    if (!r.cropId) add(shared, r.category, bani);
    else if (ids.has(r.cropId)) add(direct, key(r.cropId, r.category), bani);
    else elsewhere += bani;
  }

  const crops = sorted.map((p): CropCost => {
    const areaAri = Math.round(p.areaHa * 100);
    const perHa = (bani: Bani) => Math.round((bani * 100) / (areaAri || 1));
    const categories = CATEGORIES.flatMap((category) => {
      const own = direct.get(key(p.cropId, category)) ?? 0;
      const part = areaShare(shared.get(category) ?? 0, sorted, p.cropId);
      const total = own + part;
      return total > 0 ? [{ category, direct: own, shared: part, total, perHa: perHa(total) }] : [];
    });
    const sum = (rows: CategoryCost[], field: 'direct' | 'shared' | 'total') => rows.reduce((s, c) => s + c[field], 0);
    const total = sum(categories, 'total');
    const planCost = sum(categories.filter((c) => PLANNED_CATEGORIES.includes(c.category)), 'total');
    return {
      cropId: p.cropId,
      areaAri,
      categories,
      direct: sum(categories, 'direct'),
      shared: sum(categories, 'shared'),
      total,
      perHa: perHa(total),
      planCost,
      planPerHa: perHa(planCost),
    };
  });
  return { crops, elsewhere };
}

type HarvestMonths = readonly { id: string; harvest_month: number }[];

/** One harvest's costs, with whether each crop's season is over. */
export function harvestCosts(
  harvest: { year: number; status: 'open' | 'closed'; parcels: (CostParcel & { status?: 'open' | 'closed' })[]; records: CostRecord[] },
  crops: HarvestMonths,
  today: string,
): HarvestCosts {
  const { crops: costs, elsewhere } = cropCostsPerHa(harvest.parcels, harvest.records);
  const month = today.slice(0, 7);
  return {
    year: harvest.year,
    elsewhere,
    crops: costs.map((c) => {
      const parcel = harvest.parcels.find((p) => p.cropId === c.cropId)!;
      const harvestMonth = crops.find((x) => x.id === c.cropId)?.harvest_month;
      const past = harvestMonth !== undefined && `${harvest.year}-${String(harvestMonth).padStart(2, '0')}` < month;
      return { ...c, seasonDone: (parcel.status ?? harvest.status) === 'closed' || past };
    }),
  };
}

type CostFarm = Pick<StoredFarm, 'parcels' | 'transactions' | 'harvests'>;

/** Every harvest of a stored farm, filed the way Recolte files them. Oldest first. */
export function storedHarvestCosts(farm: CostFarm, data: AppData, today: string): HarvestCosts[] {
  const crops = withOwnCrops(data, farm.harvests?.ownCrops).crops.crops;
  const current = harvestYear(today);
  const saved = farm.harvests?.years ?? [];
  const before = saved.find((y) => y.year === current);
  const years = [
    ...saved.filter((y) => y.year !== current).map((y) => ({ year: y.year, status: y.status, parcels: y.parcels as CostParcelWithStatus[] })),
    {
      year: current,
      status: before?.status ?? ('open' as const),
      parcels: farm.parcels.map((p): CostParcelWithStatus => {
        const status = before?.parcels.find((x) => x.cropId === p.crop_id)?.status;
        return { cropId: p.crop_id, areaHa: p.area_ari / 100, ...(status ? { status } : {}) };
      }),
    },
  ].sort((a, b) => a.year - b.year);
  const known = new Set(years.map((y) => y.year));
  const expenses = (farm.transactions ?? [])
    .filter((t) => t.kind === 'expense')
    .map((t) => {
      const year = recordHarvestYear(t, crops);
      return { year: known.has(year) ? year : current, record: { cropId: t.crop_id, category: t.category, amountBani: t.amount_bani } };
    });
  return years.map((y) =>
    harvestCosts({ ...y, records: expenses.filter((e) => e.year === y.year).map((e) => e.record) }, crops, today),
  );
}

type CostParcelWithStatus = CostParcel & { status?: 'open' | 'closed' };

/** Whole lei per hectare, the way a plan cost is kept. Null when there's nothing to go on. */
export function planCostLei(cost: Pick<CropCost, 'planPerHa'>): number | null {
  const lei = Math.round(cost.planPerHa / 100);
  return lei >= 1 ? lei : null;
}

/** The cost one finished harvest gives a crop. Null if it isn't finished or has no such expenses. */
export function finishedCost(harvests: HarvestCosts[], cropId: string, year: number): number | null {
  const crop = harvests.find((h) => h.year === year)?.crops.find((c) => c.cropId === cropId);
  return crop?.seasonDone ? planCostLei(crop) : null;
}

/** The most recent finished harvest with costs for this crop: the closest to today's prices. */
export function latestFinishedCost(harvests: HarvestCosts[], cropId: string): { year: number; leiPerHa: number } | null {
  for (const h of [...harvests].sort((a, b) => b.year - a.year)) {
    const leiPerHa = finishedCost(harvests, cropId, h.year);
    if (leiPerHa !== null) return { year: h.year, leiPerHa };
  }
  return null;
}

/** Either a figure (null goes back to the average), or the harvest whose recorded expenses set it. */
export const SetCropCostInputSchema = z
  .strictObject({
    cropId: z.string().min(1).max(40),
    costLeiPerHa: CostLeiPerHa.nullable().optional(),
    fromHarvestYear: HarvestYearSchema.optional(),
  })
  .refine((c) => (c.costLeiPerHa !== undefined) !== (c.fromHarvestYear !== undefined), { path: ['costLeiPerHa'] });
export type SetCropCostInput = z.infer<typeof SetCropCostInputSchema>;

/** The document with one crop's cost changed. Its yield, price and every other crop stay as they are. */
export function withCropCost(doc: HarvestsInput, cropId: string, costLeiPerHa: number | null): HarvestsInput {
  const rows = doc.expected ?? [];
  const { costLeiPerHa: _old, ...rest } = rows.find((r) => r.cropId === cropId) ?? { cropId, yieldTPerHa: null, priceLeiPerKg: null };
  const row = costLeiPerHa === null ? rest : { ...rest, costLeiPerHa };
  const keep = row.yieldTPerHa !== null || row.priceLeiPerKg !== null || costLeiPerHa !== null;
  return { ...doc, expected: [...rows.filter((r) => r.cropId !== cropId), ...(keep ? [row] : [])] };
}
