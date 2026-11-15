import type { Crop } from '../data';
import type { AppliedLoss } from '../farm/crop-loss';
import { ceilTo, type Bani } from '../money';
import type { Timeline, TimelineEntry } from './timeline';
import { cropCostValue, cropSaleValue, harvestedAri } from './timeline';

export interface CropEconomics {
  cropId: string;
  areaAri: number;
  /** Expected harvest, tonnes (mean yield on the hectares that reach harvest). */
  productionT: number;
  /** Mean price, bani per tonne. */
  pricePerT: Bani;
  income: Bani;
  cost: Bani;
  incomePerHa: Bani;
  costPerHa: Bani;
  marginPerHa: Bani;
  /** Price per kg at which income equals cost, in bani (mean cost / mean yield). Null when nothing reaches harvest. */
  breakEvenPerKg: Bani | null;
  /** Share (0–1) of the sown hectares the plan takes as lost (docs/crop-loss-plan.md). */
  lossShare: number;
  /** Where the loss figure comes from and whether the plan uses it. Set by buildFarmPlan. */
  loss?: AppliedLoss;
}

/**
 * Mean-year economics of one crop on the farm, from crops-reference.json. Income and production
 * come from the hectares that reach harvest; the cost is spent on everything sown.
 */
export function cropEconomics(crop: Crop, areaAri: number, lossShare = 0): CropEconomics {
  const harvested = harvestedAri(areaAri, lossShare);
  const income = cropSaleValue(crop, harvested, 'mean', 'mean');
  const cost = cropCostValue(crop, areaAri, 100, 'mean');
  const kept = 1 - Math.min(1, Math.max(0, lossShare));
  const perHa = (v: Bani) => Math.round((v * 100) / areaAri);
  return {
    cropId: crop.id,
    areaAri,
    productionT: Math.round((harvested / 100) * crop.yield_t_per_ha.mean * 100) / 100,
    pricePerT: Math.round(crop.price_lei_per_kg.mean * 1000 * 100),
    income,
    cost,
    incomePerHa: perHa(income),
    costPerHa: perHa(cost),
    marginPerHa: perHa(income - cost),
    breakEvenPerKg: kept > 0 ? Math.round((crop.cost_lei_per_ha.mean / (crop.yield_t_per_ha.mean * kept * 1000)) * 100) : null,
    lossShare,
  };
}

const sumNet = (t: Timeline) => t.months.reduce((s, m) => s + m.net, 0);

export interface SpringNeed {
  /** Money going out during the hard months. */
  need: Bani;
  /** Projected balance at the start of the hard months. */
  available: Bani;
  firstMonth: string | null;
  lastMonth: string | null;
}

/** What the hardest stretch costs and what the farmer will have when it starts. */
export function springNeed(t: Timeline): SpringNeed {
  const hard = t.months.filter((m) => m.hard);
  if (hard.length === 0) return { need: 0, available: t.startBalance, firstMonth: null, lastMonth: null };
  const firstIdx = t.months.indexOf(hard[0]!);
  return {
    need: hard.reduce((s, m) => s + m.out, 0),
    available: firstIdx === 0 ? t.startBalance : t.months[firstIdx - 1]!.balanceEnd,
    firstMonth: hard[0]!.key,
    lastMonth: hard.at(-1)!.key,
  };
}

/** Next entries from a date: everything within `days`, or at least `min` entries. */
export function upcoming(t: Timeline, fromDate: string, days = 42, min = 4): TimelineEntry[] {
  const all = t.months.flatMap((m) => m.entries).filter((e) => e.date >= fromDate);
  const limit = new Date(Date.parse(`${fromDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const within = all.filter((e) => e.date <= limit);
  return within.length >= min ? within : all.slice(0, min);
}

/** Season costs per crop (money going out over the horizon). */
export function costsByCrop(t: Timeline): { cropId: string; amount: Bani }[] {
  const map = new Map<string, Bani>();
  for (const e of t.months.flatMap((m) => m.entries)) {
    if (e.kind === 'input_cost' && e.cropId) map.set(e.cropId, (map.get(e.cropId) ?? 0) + e.value);
  }
  return [...map.entries()].map(([cropId, amount]) => ({ cropId, amount })).sort((a, b) => b.amount - a.amount);
}

export interface PayrollShort {
  key: string;
  /** The people's pay that month (bani). */
  payroll: Bani;
  /** How far below zero the money ends that month, before the farmer's own salary (bani, > 0). */
  missing: Bani;
}

/**
 * „În [luna] nu ajung banii de salariile oamenilor”: the months that pay people and end below zero
 * even before the farmer takes a salary. The people are paid first, so this is the warning that
 * comes before any about the farmer's own salary.
 */
export function payrollShortMonths(t: Timeline): PayrollShort[] {
  return t.months.flatMap((m) => {
    const payroll = m.entries.filter((e) => e.kind === 'payroll').reduce((s, e) => s + e.value, 0);
    return payroll > 0 && m.balanceEnd < 0 ? [{ key: m.key, payroll, missing: -m.balanceEnd }] : [];
  });
}
