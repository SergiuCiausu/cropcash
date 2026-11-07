import { z } from 'zod';
import type { AppData } from '../data';

const MAX_HA = 100_000;
const MAX_TONNES = 1_000_000;
const MAX_LEI_PER_KG = 1_000;
const MAX_TONNES_PER_HA = 1_000;

export const MonthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const HarvestYearSchema = z.number().int().min(2000).max(2100);

const Status = z.enum(['open', 'closed']);
const Bani = z.number().int().safe();
const CropId = z.string().min(1).max(40);
const Hectares = z.number().positive().max(MAX_HA);
const Tonnes = z.number().min(0).max(MAX_TONNES).nullable();

/** What was planned when a crop or a year was closed, kept so the plan can't change afterwards. */
const Planned = z.strictObject({ inBani: Bani, outBani: Bani, endBani: Bani.optional() });

const HarvestCropSchema = z.strictObject({
  cropId: CropId,
  areaHa: Hectares,
  plantedMonth: MonthKeySchema.optional(),
  status: Status.optional(),
  planned: Planned.optional(),
});

const HarvestSchema = z.strictObject({
  year: HarvestYearSchema,
  status: Status,
  openingBani: Bani.min(0),
  parcels: z.array(HarvestCropSchema).min(1).max(20),
  planned: Planned.optional(),
});

/** A blank figure stays null: the crop's average is used instead. */
const GatheredSchema = z.strictObject({
  cropId: CropId,
  areaHa: Hectares,
  tonnes: Tonnes,
  priceLeiPerKg: z.number().min(0).max(MAX_LEI_PER_KG).nullable(),
  storedTonnes: Tonnes,
  sown: MonthKeySchema.optional(),
  harvested: MonthKeySchema.optional(),
});

/** What the farmer expects from a normal year. A blank figure stays null and falls back. */
const ExpectedSchema = z.strictObject({
  cropId: CropId,
  yieldTPerHa: z.number().positive().max(MAX_TONNES_PER_HA).nullable(),
  priceLeiPerKg: z.number().positive().max(MAX_LEI_PER_KG).nullable(),
});

const Month = z.number().int().min(1).max(12);
const LeiPerHa = z.number().int().min(0).max(1_000_000);

/** A crop that isn't in docs/data, described by the farmer (P30). */
export const OwnCropSchema = z
  .strictObject({
    id: z.string().regex(/^own-[a-z0-9-]{1,40}$/),
    name: z.string().trim().min(1).max(40),
    yieldTPerHa: z.number().positive().max(MAX_TONNES_PER_HA),
    /** Null when the farmer doesn't know: a bad year is then the normal one. */
    badYieldTPerHa: z.number().positive().max(MAX_TONNES_PER_HA).nullable(),
    priceLeiPerKg: z.number().positive().max(MAX_LEI_PER_KG),
    costs: z.strictObject({ sowingLeiPerHa: LeiPerHa, careLeiPerHa: LeiPerHa, harvestLeiPerHa: LeiPerHa }),
    sowingMonth: Month,
    harvestMonth: Month,
  })
  .refine((c) => c.badYieldTPerHa === null || c.badYieldTPerHa <= c.yieldTPerHa, { path: ['badYieldTPerHa'] })
  .refine((c) => c.sowingMonth !== c.harvestMonth, { path: ['harvestMonth'] });
export type OwnCrop = z.infer<typeof OwnCropSchema>;

/** The whole document in `farmers.harvests`. Saving replaces it, so one save can't half-apply. */
export const HarvestsInputSchema = z.strictObject({
  years: z.array(HarvestSchema).min(1).max(30),
  gathered: z.array(GatheredSchema).max(30),
  /** Optional, so documents saved before it existed stay valid. */
  expected: z.array(ExpectedSchema).max(30).optional(),
  ownCrops: z.array(OwnCropSchema).max(20).optional(),
});
export type HarvestsInput = z.infer<typeof HarvestsInputSchema>;

export type HarvestsIssue = 'unknown_crop' | 'duplicate_crop' | 'duplicate_year';

/** Checks what Zod can't: crops against docs/data, and that nothing appears twice. */
export function validateHarvests(input: HarvestsInput, data: AppData): HarvestsIssue[] {
  const issues = new Set<HarvestsIssue>();
  const repeats = (values: (string | number)[]) => new Set(values).size < values.length;
  const own = input.ownCrops ?? [];
  const known = new Set([...data.crops.crops.map((c) => c.id), ...own.map((c) => c.id)]);
  const cropLists = [...input.years.map((y) => y.parcels), input.gathered, input.expected ?? []];
  // An own crop can't reuse a docs/data id, and each is described once.
  if (repeats([...data.crops.crops.map((c) => c.id), ...own.map((c) => c.id)])) issues.add('duplicate_crop');

  if (cropLists.flat().some((c) => !known.has(c.cropId))) issues.add('unknown_crop');
  if (cropLists.some((list) => repeats(list.map((c) => c.cropId)))) issues.add('duplicate_crop');
  if (repeats(input.years.map((y) => y.year))) issues.add('duplicate_year');
  return [...issues];
}

const FIRST_MONTH_OF_HARVEST_YEAR = 11;

/** Harvest 2027 runs from November 2026. */
export function harvestYear(date: string): number {
  const year = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= FIRST_MONTH_OF_HARVEST_YEAR ? year + 1 : year;
}

/** The harvest a record belongs to: the one the farmer chose, otherwise the one its date falls in. */
export function recordHarvestYear(record: { harvest_year?: number | null; occurred_at: string }): number {
  return record.harvest_year ?? harvestYear(record.occurred_at);
}
