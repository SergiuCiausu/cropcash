import type { AppData, Crop } from '../data';
import type { OwnCrop } from './harvests';

/** Ids of the farmer's own crops start with this, so they can never clash with docs/data. */
export const OWN_CROP_PREFIX = 'own-';
export const isOwnCrop = (cropId: string) => cropId.startsWith(OWN_CROP_PREFIX);

/** Months strictly between sowing and harvest, going forward through the year. */
function monthsBetween(from: number, to: number): number[] {
  const months: number[] = [];
  for (let m = (from % 12) + 1; m !== to; m = (m % 12) + 1) months.push(m);
  return months;
}

/**
 * A crop the farmer described, in the shape docs/data crops have (P30). The farmer gives one normal
 * year, so price and costs don't move between years, and a good year is the normal one. A bad year
 * uses the bad yield when given, otherwise it is the normal one too. Care costs are split evenly over
 * the months the crop grows, and the crop sells in the month it is harvested.
 */
export function ownCropToCrop(own: OwnCrop): Crop {
  const { sowingLeiPerHa, careLeiPerHa, harvestLeiPerHa } = own.costs;
  const total = sowingLeiPerHa + careLeiPerHa + harvestLeiPerHa;
  const growing = monthsBetween(own.sowingMonth, own.harvestMonth);
  const spend = [
    { month: own.sowingMonth, lei: sowingLeiPerHa + (growing.length ? 0 : careLeiPerHa), what_ro: 'sămânță și semănat' },
    ...growing.map((month) => ({ month, lei: careLeiPerHa / growing.length, what_ro: 'îngrijire' })),
    { month: own.harvestMonth, lei: harvestLeiPerHa, what_ro: 'recoltat' },
  ].filter((s) => s.lei > 0);
  const same = (v: number) => ({ min: v, mean: v, max: v });
  return {
    id: own.id,
    name_ro: own.name,
    cost_lei_per_ha: same(total),
    yield_t_per_ha: { min: own.badYieldTPerHa ?? own.yieldTPerHa, mean: own.yieldTPerHa, max: own.yieldTPerHa },
    price_lei_per_kg: same(own.priceLeiPerKg),
    expense_months: spend.map((s) => ({ month: s.month, share_pct: (s.lei * 100) / total, what_ro: s.what_ro })),
    sowing_month: own.sowingMonth,
    harvest_month: own.harvestMonth,
    sale_month_default: own.harvestMonth,
    status: 'de-la-fermier',
  };
}

/** docs/data with the farm's own crops added. A crop already there is left as it is. */
export function withOwnCrops(data: AppData, own: OwnCrop[] | null | undefined): AppData {
  const known = new Set(data.crops.crops.map((c) => c.id));
  const extra = (own ?? []).filter((c) => !known.has(c.id)).map(ownCropToCrop);
  return extra.length ? { ...data, crops: { ...data.crops, crops: [...data.crops.crops, ...extra] } } : data;
}
