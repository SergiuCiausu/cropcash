import { useMemo } from 'react';
import {
  buildTimeline,
  computeSubsidies,
  costsByCrop,
  cropEconomics,
  farmInputFromStored,
  loadData,
  normalizeParcels,
  riskFundTarget,
  springNeed,
  type AmountScenario,
  type StoredFarm,
  type Timeline,
} from '@cropcash/shared';
import { currentMonthKey } from './format';

const data = loadData();
/** Plan 12 months ahead; payments with a window are assumed late (conservative, docs/11 P13). */
const HORIZON_MONTHS = 12;

export interface Farm extends StoredFarm {
  name: string;
  county: string;
}

/**
 * Everything the screens show, computed on the device from the farm and docs/data.
 * No network: keeps working offline once the farm is cached.
 */
export function useFarmPlan(farm: Farm) {
  return useMemo(() => {
    const input = farmInputFromStored(farm, data.subsidies.meta.campaign_year);
    const subsidies = computeSubsidies(input, data);
    const parcels = normalizeParcels(input.parcels);
    const startBalance = farm.start_balance_bani ?? 0;
    const opts = { start: currentMonthKey(), months: HORIZON_MONTHS, timing: 'late' as const };
    const build = (amounts: AmountScenario) =>
      buildTimeline({ parcels, subsidies, startBalance }, data, { ...opts, amounts });
    const timelines: Record<AmountScenario, Timeline> = {
      bad: build('bad'),
      medium: build('medium'),
      good: build('good'),
    };
    const crops = new Map(data.crops.crops.map((c) => [c.id, c]));
    const economics = parcels.flatMap((p) => {
      const crop = crops.get(p.cropId);
      return crop ? [cropEconomics(crop, p.areaAri)] : [];
    });
    return {
      subsidies,
      startBalance,
      timelines,
      economics,
      totalHa: parcels.reduce((s, p) => s + p.areaAri, 0) / 100,
      riskTarget: riskFundTarget(timelines.medium, timelines.bad),
      spring: springNeed(timelines.medium),
      costs: costsByCrop(timelines.medium),
    };
  }, [farm]);
}

export type FarmPlan = ReturnType<typeof useFarmPlan>;

export const cropName = (id?: string) => data.crops.crops.find((c) => c.id === id)?.name_ro ?? '';
export const countyName = (code: string) => data.counties.counties.find((c) => c.code === code)?.name_ro ?? code;
export const eventTitle = (id?: string) => data.calendar.events.find((e) => e.id === id)?.title_ro ?? '';
