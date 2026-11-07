import { useMemo } from 'react';
import { computeFarmPlan, loadData, suggestPension, type ScenarioPlan, type StoredFarm } from '@cropcash/shared';

const data = loadData();

export type { ScenarioPlan };

/** The same plan the monthly payout uses. */
export type FarmPlan = ScenarioPlan;

export interface Farm extends StoredFarm {
  stripe_account_id?: string | null;
  name: string;
  county: string;
}

/** Computed on the device, so the screens keep working offline once the farm is cached. */
export function useFarmPlan(farm: Farm): FarmPlan {
  return useMemo(() => computeFarmPlan(farm, data), [farm]);
}

export const useScenarioPlan = useFarmPlan;

export const pensionSuggestion = (plan: FarmPlan, farm: Farm) =>
  suggestPension(plan.salary.salary, data, farm.pension_fund_id);

export const cropName = (id?: string) => data.crops.crops.find((c) => c.id === id)?.name_ro ?? '';
export const countyName = (code: string) => data.counties.counties.find((c) => c.code === code)?.name_ro ?? code;
export const eventTitle = (id?: string) => data.calendar.events.find((e) => e.id === id)?.title_ro ?? '';
