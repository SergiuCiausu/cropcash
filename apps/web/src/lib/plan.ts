import { useMemo } from 'react';
import { computeFarmPlan, loadData, type FarmPlan as SharedPlan, type PlanFarm } from '@cropcash/shared';

const data = loadData();

export interface Farm extends PlanFarm {
  name: string;
  county: string;
  stripe_account_id?: string | null;
}

/**
 * Everything the screens show, computed on the device (offline-friendly) with the same
 * function the API uses to pay the salary (packages/shared/src/cashflow/plan.ts).
 */
export function useFarmPlan(farm: Farm) {
  return useMemo(() => computeFarmPlan(farm, data), [farm]);
}

export type FarmPlan = SharedPlan;

export const cropName = (id?: string) => data.crops.crops.find((c) => c.id === id)?.name_ro ?? '';
export const countyName = (code: string) => data.counties.counties.find((c) => c.code === code)?.name_ro ?? code;
export const eventTitle = (id?: string) => data.calendar.events.find((e) => e.id === id)?.title_ro ?? '';
