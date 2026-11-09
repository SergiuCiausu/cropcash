/*
 * A crop's season runs from sowing to harvest, so it depends on the crop: wheat sown in October
 * is cut the next July, maize sown in April is cut that October. A farm year isn't 12 months.
 */
import type { AppData, Crop } from '../data';
import { addMonths, monthOf, type MonthKey } from './dates';

const monthsBetween = (from: number, to: number) => (to - from + 12) % 12;

/** Months from sowing to harvest. */
export function growingMonths(crop: Crop): number {
  return monthsBetween(crop.sowing_month, crop.harvest_month) || 12;
}

export interface CropSeason {
  sown: MonthKey;
  harvest: MonthKey;
  sale: MonthKey;
}

export function cropSeason(crop: Crop, sown: MonthKey): CropSeason {
  const harvest = addMonths(sown, growingMonths(crop));
  return { sown, harvest, sale: addMonths(harvest, monthsBetween(crop.harvest_month, crop.sale_month_default)) };
}

/** A crop can't be sold in the past: one left unsold past its date counts from the plan's first month. */
export function firstSaleMonth(crop: Crop, sown: MonthKey, planStart: MonthKey): MonthKey {
  const { sale } = cropSeason(crop, sown);
  return sale < planStart ? planStart : sale;
}

/** The usual sowing month nearest to `month`, going back. It can be `month` itself. */
function lastSowing(crop: Crop, month: MonthKey): MonthKey {
  return addMonths(month, -monthsBetween(crop.sowing_month, monthOf(month)));
}

/** The latest usual season with its harvest in: what the farmer has gathered by `month`. */
export function gatheredSeason(crop: Crop, month: MonthKey): CropSeason {
  const season = cropSeason(crop, lastSowing(crop, month));
  return season.harvest <= month ? season : cropSeason(crop, addMonths(season.sown, -12));
}

/** The usual season in the ground at `month`, or null between harvest and the next sowing. */
export function growingSeason(crop: Crop, month: MonthKey): CropSeason | null {
  const season = cropSeason(crop, lastSowing(crop, month));
  return season.harvest > month ? season : null;
}

/** The next usual sowing after `month`. */
export function nextSowing(crop: Crop, month: MonthKey): MonthKey {
  return addMonths(lastSowing(crop, month), 12);
}

/** One crop's finished season, as the farmer reported it. */
export interface GatheredHarvest {
  cropId: string;
  areaHa: number;
  /** Null when the farmer doesn't know: the crop's average stays. */
  tonnes: number | null;
  priceLeiPerKg: number | null;
}

export interface HarvestFigures {
  cropId: string;
  yieldTPerHa: number | null;
  priceLeiPerKg: number | null;
  /** Only ever the farmer's own expectation: a gathered harvest says nothing about costs. */
  costLeiPerHa?: number | null;
}

/** What the farmer got per crop: yield weighted by area, price weighted by tonnes. */
export function harvestFigures(gathered: GatheredHarvest[]): HarvestFigures[] {
  const ids = [...new Set(gathered.map((g) => g.cropId))];
  return ids.map((cropId) => {
    const rows = gathered.filter((g) => g.cropId === cropId);
    const known = rows.filter((g) => g.tonnes !== null && g.areaHa > 0);
    const area = known.reduce((sum, g) => sum + g.areaHa, 0);
    const tonnes = known.reduce((sum, g) => sum + (g.tonnes ?? 0), 0);
    const priced = rows.filter((g) => g.priceLeiPerKg !== null);
    const pricedTonnes = priced.reduce((sum, g) => sum + (g.tonnes ?? 0), 0);
    const worth = priced.reduce((sum, g) => sum + (g.tonnes ?? 0) * (g.priceLeiPerKg ?? 0), 0);
    return {
      cropId,
      yieldTPerHa: area > 0 && tonnes > 0 ? tonnes / area : null,
      priceLeiPerKg: pricedTonnes > 0 ? worth / pricedTonnes : (priced[0]?.priceLeiPerKg ?? null),
    };
  });
}

/** The farmer's own expectation wins over what was gathered, figure by figure (P29). */
export function plannedFigures(gathered: GatheredHarvest[], expected: HarvestFigures[]): HarvestFigures[] {
  const noted = harvestFigures(gathered);
  const ids = [...new Set([...noted, ...expected].map((f) => f.cropId))];
  return ids.map((cropId) => {
    const own = noted.find((f) => f.cropId === cropId);
    const wanted = expected.find((f) => f.cropId === cropId);
    return {
      cropId,
      yieldTPerHa: wanted?.yieldTPerHa ?? own?.yieldTPerHa ?? null,
      priceLeiPerKg: wanted?.priceLeiPerKg ?? own?.priceLeiPerKg ?? null,
      ...(wanted?.costLeiPerHa != null ? { costLeiPerHa: wanted.costLeiPerHa } : {}),
    };
  });
}

function scaled<T extends { min: number; mean: number; max: number }>(range: T, mean: number | null): T {
  if (mean === null || !(mean > 0)) return range;
  const ratio = mean / range.mean;
  return { ...range, min: range.min * ratio, mean, max: range.max * ratio };
}

/**
 * The same data, with the farmer's own yield, price and cost as the crop's normal year (P26).
 * A good and a bad year keep their distance from normal. The plan reads every cost from here, so
 * the monthly costs, the crop table, the break-even price and the salary all follow it.
 */
export function withFarmerHarvest(data: AppData, figures: HarvestFigures[]): AppData {
  const crops = data.crops.crops.map((crop) => {
    const own = figures.find((f) => f.cropId === crop.id);
    if (!own) return crop;
    return {
      ...crop,
      yield_t_per_ha: scaled(crop.yield_t_per_ha, own.yieldTPerHa),
      price_lei_per_kg: scaled(crop.price_lei_per_kg, own.priceLeiPerKg),
      cost_lei_per_ha: scaled(crop.cost_lei_per_ha, own.costLeiPerHa ?? null),
    };
  });
  return { ...data, crops: { ...data.crops, crops } };
}
