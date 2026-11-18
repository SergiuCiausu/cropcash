import { z } from 'zod';
import { SowingSchema } from './sowing';
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

/** Why part of a crop wasn't harvested. The Romanian labels live in web/. */
export const LOSS_REASONS = ['drought', 'hail', 'flood', 'frost', 'pests', 'other'] as const;

/**
 * Hectares of a crop that weren't harvested at all (docs/crop-loss-plan.md). A thin crop that was
 * still harvested is low yield, not loss. Left out means the farmer didn't say; 0 is an answer.
 */
export const CropLossSchema = z.strictObject({
  ha: z.number().min(0).max(MAX_HA),
  reason: z.enum(LOSS_REASONS).optional(),
  /** When it happened. */
  month: MonthKeySchema.optional(),
});
export type CropLoss = z.infer<typeof CropLossSchema>;

const HarvestCropSchema = z
  .strictObject({
    cropId: CropId,
    areaHa: Hectares,
    plantedMonth: MonthKeySchema.optional(),
    /** How deep and how far apart it was sown. Optional, so older documents stay valid. */
    sowing: SowingSchema.optional(),
    status: Status.optional(),
    planned: Planned.optional(),
    /** What didn't make it to harvest this year. Optional, so older documents stay valid. */
    lost: CropLossSchema.optional(),
  })
  .refine((c) => !c.lost || c.lost.ha <= c.areaHa, { path: ['lost', 'ha'], message: 'lost_over_area' });

const HarvestSchema = z.strictObject({
  year: HarvestYearSchema,
  status: Status,
  openingBani: Bani.min(0),
  parcels: z.array(HarvestCropSchema).min(1).max(20),
  planned: Planned.optional(),
});

/** Whole lei, at least 1: nothing costs 0 by accident, and null is how a figure goes back to the average. */
export const CostLeiPerHa = z.number().int().min(1).max(1_000_000);

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
  /** The whole season's cost per hectare. Left out or null, the crop's average stays. */
  costLeiPerHa: CostLeiPerHa.nullable().optional(),
  /** Share of the sown hectares that usually doesn't make it to harvest. Left out or null, the farm's history stays. */
  lossPct: z.number().min(0).max(100).nullable().optional(),
});

const Month = z.number().int().min(1).max(12);
const LeiPerHa = z.number().int().min(0).max(1_000_000);

/** A crop that isn't in docs/data, described by the farmer (P30). */
export const OwnCropSchema = z
  .strictObject({
    id: z.string().regex(/^own-[a-z0-9-]{1,40}$/),
    name: z.string().trim().min(1).max(120),
    /** The APIA line (Tabel 1 code) the farmer picked for it, when there is one: names it and gives its genus. */
    apiaCode: z.number().int().positive().optional(),
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

/** A crop's cost belongs to its next harvest: wheat sown in October 2026 is Recolta 2027 (cut in July 2027). */
function cropCostHarvestYear(date: string, harvestMonth: number): number {
  const year = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) <= harvestMonth ? year : year + 1;
}

/**
 * The harvest a record belongs to: the one the farmer chose, otherwise the next harvest of the crop
 * an expense is for, otherwise the one its date falls in.
 */
export function recordHarvestYear(
  record: { harvest_year?: number | null; occurred_at: string; kind?: string | null; crop_id?: string | null },
  crops: readonly { id: string; harvest_month: number }[] = [],
): number {
  if (record.harvest_year != null) return record.harvest_year;
  const crop = record.kind === 'expense' && record.crop_id ? crops.find((c) => c.id === record.crop_id) : undefined;
  return crop ? cropCostHarvestYear(record.occurred_at, crop.harvest_month) : harvestYear(record.occurred_at);
}
