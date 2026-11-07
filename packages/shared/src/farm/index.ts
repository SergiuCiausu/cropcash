import { z } from 'zod';
import type { AppData } from '../data';
import { ariToHa, haToAri } from '../money';
import type { FarmInput } from '../subsidies';

/** Max hectares the MVP accepts (target audience is 5–50 ha; leave headroom). */
export const MAX_FARM_HA = 1000;

/**
 * What the onboarding sends to POST /api/farmers. Validated on both sides.
 * Crop and county ids are checked against docs/data by `validateOnboarding`.
 */
export const OnboardingInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  county: z.string().min(1).max(3),
  age: z.number().int().min(16).max(100),
  parcels: z
    .array(
      z.object({
        cropId: z.string().min(1),
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
export type OnboardingInput = z.infer<typeof OnboardingInputSchema>;

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
  parcels: { crop_id: string; area_ari: number; is_arable: boolean }[];
}

export function farmInputFromStored(farm: StoredFarm, referenceYear: number): FarmInput {
  return {
    age: ageFromBirthYear(farm.birth_year, referenceYear),
    parcels: farm.parcels.map((p) => ({ cropId: p.crop_id, areaHa: ariToHa(p.area_ari), isArable: p.is_arable })),
  };
}

export function farmInputFromOnboarding(input: OnboardingInput): FarmInput {
  return { age: input.age, parcels: input.parcels.map((p) => ({ cropId: p.cropId, areaHa: p.areaHa })) };
}
