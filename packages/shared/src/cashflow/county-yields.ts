import type { AppData, Crop, CropsFile, PlanParamsFile } from '../data';

/**
 * Real yields by county (INS AGR110A, docs/an-slab-an-bun-plan.md). Over the last harvests of a
 * county and crop: normal is the median, bad and good are the averages of the worst and best few.
 */

/** The row with the country's average, for a county with too little history. */
export const NATIONAL_AREA = 'RO';

type History = CropsFile['county_history'];
type Params = PlanParamsFile['yield_history'];

export interface CountyYieldRange {
  /** t/ha, the same shape as crop.yield_t_per_ha. */
  range: { min: number; mean: number; max: number };
  basis: NonNullable<Crop['yield_basis']>;
}

const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Null when this area has fewer usable harvests than the minimum. */
export function yieldRange(history: History, area: string, cropId: string, params: Params): CountyYieldRange | null {
  const series = history.data[area]?.[cropId];
  if (!series) return null;
  const window = series.slice(-params.window_years.value);
  const kg = window.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (kg.length < params.min_years.value) return null;
  const extreme = params.extreme_years.value;
  const tonnes = (value: number) => Math.round(value) / 1000;
  const lastYear = history.first_year + series.length - 1;
  return {
    range: {
      min: tonnes(average(kg.slice(0, extreme))),
      mean: tonnes(median(kg)),
      max: tonnes(average(kg.slice(-extreme))),
    },
    basis: { area, from: lastYear - window.length + 1, to: lastYear },
  };
}

/**
 * The same data with each crop's yields from the county's history, or the country's when the county
 * has too little. Crops INS doesn't cover keep their figures. A crop already done is left alone, so
 * the farmer's own yield, applied on top of this, is never overwritten by a second pass.
 */
export function withCountyYields(data: AppData, county: string | null | undefined): AppData {
  if (!county) return data;
  const params = data.params.yield_history;
  const history = data.crops.county_history;
  const crops = data.crops.crops.map((crop) => {
    if (crop.yield_basis) return crop;
    const found = yieldRange(history, county, crop.id, params) ?? yieldRange(history, NATIONAL_AREA, crop.id, params);
    return found ? { ...crop, yield_t_per_ha: found.range, yield_basis: found.basis } : crop;
  });
  return { ...data, crops: { ...data.crops, crops } };
}
