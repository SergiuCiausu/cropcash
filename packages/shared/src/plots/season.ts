/* When a parcel was sown and when its harvest is expected. A date the farmer gave wins; otherwise
   the crop's usual month from crops-reference.json, in the season's harvest year. */
import type { StoredSeason } from './model';

export type CropMonths = { id: string; sowing_month: number; harvest_month: number };

/** Harvest 2027 runs from November 2026 (farm/harvests.ts harvestYear). */
const FIRST_MONTH_OF_HARVEST_YEAR = 11;

const pad = (m: number) => String(m).padStart(2, '0');
const yearMonth = (year: number, month: number) => `${year}-${pad(month)}`;
export const monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;

/** The calendar month a crop's usual month falls in, for a given harvest year. */
function calendarMonth(harvestYear: number, month: number): string {
  return yearMonth(month >= FIRST_MONTH_OF_HARVEST_YEAR ? harvestYear - 1 : harvestYear, month);
}

export interface SowingInfo {
  month: string;
  /** Exact day, when the farmer recorded one. */
  date: string | null;
  source: 'recorded' | 'farm_plan' | 'crop_usual';
}

/**
 * When it was (or will be) sown. `plannedMonth` is the crop's planting month from the farm plan
 * (parcels.planted_month), which comes before the crop's usual month.
 */
export function sowingOf(season: StoredSeason, crop: CropMonths | undefined, plannedMonth?: string | null): SowingInfo | null {
  if (season.sown_on) return { month: season.sown_on.slice(0, 7), date: season.sown_on, source: 'recorded' };
  if (plannedMonth) return { month: plannedMonth, date: null, source: 'farm_plan' };
  if (!crop) return null;
  // Sown after the harvest month means sown the autumn before: wheat in October for July.
  const year = crop.sowing_month > crop.harvest_month ? season.harvest_year - 1 : season.harvest_year;
  return { month: yearMonth(year, crop.sowing_month), date: null, source: 'crop_usual' };
}

export interface HarvestInfo {
  month: string;
  date: string | null;
  /** Whole months from today's month; negative once the month has passed. */
  monthsLeft: number;
  state: 'harvested' | 'upcoming' | 'this_month' | 'late';
  source: 'recorded' | 'crop_usual';
}

export function expectedHarvest(season: StoredSeason, crop: CropMonths | undefined, today: string): HarvestInfo | null {
  const now = monthIndex(today.slice(0, 7));
  if (season.harvested_on) {
    const month = season.harvested_on.slice(0, 7);
    return { month, date: season.harvested_on, monthsLeft: monthIndex(month) - now, state: 'harvested', source: 'recorded' };
  }
  if (!crop) return null;
  const month = calendarMonth(season.harvest_year, crop.harvest_month);
  const monthsLeft = monthIndex(month) - now;
  const state = monthsLeft > 0 ? 'upcoming' : monthsLeft === 0 ? 'this_month' : 'late';
  return { month, date: null, monthsLeft, state, source: 'crop_usual' };
}
