import { z } from 'zod';
import { MonthKeySchema } from './harvests';
import type { AppData } from '../data';
import { ariToHa, haToAri } from '../money';
import type { FarmInput } from '../subsidies';

/** Max hectares the MVP accepts (target audience is 5–50 ha; leave headroom). */
export const MAX_FARM_HA = 1000;

/**
 * What the onboarding sends to POST /api/farmers. Validated on both sides.
 * Crop and county ids are checked against docs/data by `validateOnboarding`.
 */
export * from './harvests';
export * from './own-crops';

export const OnboardingInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  county: z.string().min(1).max(3),
  age: z.number().int().min(16).max(100),
  /** Money the farmer has today, in whole lei (optional; 0 if skipped). */
  startBalanceLei: z.number().int().min(0).max(100_000_000).default(0),
  parcels: z
    .array(
      z.object({
        cropId: z.string().min(1),
        plantedMonth: MonthKeySchema.optional(),
        // Up to 2 decimals (ari precision).
        areaHa: z
          .number()
          .positive()
          .max(MAX_FARM_HA)
          .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'max 2 decimals'),
      }),
    )
    .min(1),
});
export type OnboardingInput = z.input<typeof OnboardingInputSchema>;
export type OnboardingParsed = z.output<typeof OnboardingInputSchema>;

export type OnboardingIssue = 'unknown_county' | 'unknown_crop' | 'duplicate_crop' | 'too_large';

/** Domain checks that need reference data (zod only checks shapes). */
export function validateOnboarding(input: OnboardingInput, data: AppData): OnboardingIssue[] {
  const issues: OnboardingIssue[] = [];
  if (!data.counties.counties.some((c) => c.code === input.county)) issues.push('unknown_county');
  const cropIds = new Set(data.crops.crops.map((c) => c.id));
  if (input.parcels.some((p) => !cropIds.has(p.cropId))) issues.push('unknown_crop');
  if (new Set(input.parcels.map((p) => p.cropId)).size !== input.parcels.length) issues.push('duplicate_crop');
  const totalAri = input.parcels.reduce((s, p) => s + haToAri(p.areaHa), 0);
  if (totalAri > haToAri(MAX_FARM_HA)) issues.push('too_large');
  return issues;
}

/** birth_year is what we store; age is derived from the reference year. */
export function birthYearFromAge(age: number, referenceYear: number): number {
  return referenceYear - age;
}

export function ageFromBirthYear(birthYear: number, referenceYear: number): number {
  return referenceYear - birthYear;
}

/** A stored farm (DB shape, areas in ari) -> engine input. */
export interface StoredFarm {
  birth_year: number;
  start_balance_bani?: number;
  envelopes?: { kind: string; balance_bani: number }[];
  expected_payments?: import('./plan-inputs').StoredPayment[];
  transactions?: import('./plan-inputs').StoredTransaction[];
  task_completions?: { task_id: string }[];
  /** Harvest already gathered and not sold yet, in kilograms. */
  stored_grain?: { id: string; crop_id: string; kg: number }[];
  /** Calls in the calendar, with what the calendar needs, so it works offline. */
  opportunity_follows?: {
    stable_key: string;
    opportunities: { id: number; title: string; deadline: string | null; url: string } | null;
  }[];
  pension_fund_id?: string | null;
  payouts?: import('./plan-inputs').StoredPayout[];
  pension_plans?: import('./plan-inputs').StoredPension | import('./plan-inputs').StoredPension[] | null;
  /** The demo clock (Stripe Test Clock time). Null means today. */
  demo_now?: string | null;
  /** Salary fixed when the farmer accepted the plan. Null means not fixed yet. */
  salary_bani?: number | null;
  /** Harvest years, closed crops and gathered grain. Null until the farm saves some. */
  harvests?: import('./harvests').HarvestsInput | null;
  /** The total from the farmer's payment decision. It replaces the estimate in the plan. */
  apia_decision?: import('../subsidies').ApiaDecision | null;
  parcels: { crop_id: string; area_ari: number; is_arable: boolean; planted_month?: string | null }[];
}

/** Editing the farm. Unlike onboarding the balance is required, so omitting it can't reset it. */
export const UpdateFarmInputSchema = OnboardingInputSchema.extend({
  startBalanceLei: z.number().int().min(0).max(100_000_000),
});
export type UpdateFarmInput = z.infer<typeof UpdateFarmInputSchema>;

/** The date the app works from: the demo clock's when it's set, otherwise today. */
export function farmToday(farm: { demo_now?: string | null }, today: string): string {
  return farm.demo_now?.slice(0, 10) ?? today;
}

export function farmInputFromStored(farm: Pick<StoredFarm, 'birth_year' | 'parcels'>, referenceYear: number): FarmInput {
  return {
    age: ageFromBirthYear(farm.birth_year, referenceYear),
    parcels: farm.parcels.map((p) => ({
      cropId: p.crop_id,
      areaHa: ariToHa(p.area_ari),
      isArable: p.is_arable,
      ...(p.planted_month ? { plantedMonth: p.planted_month } : {}),
    })),
  };
}

export function farmInputFromOnboarding(input: OnboardingInput): FarmInput {
  return { age: input.age, parcels: input.parcels.map((p) => ({ cropId: p.cropId, areaHa: p.areaHa })) };
}

export * from './plan-inputs';
export * from './crop-costs';
