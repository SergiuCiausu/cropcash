/* How a crop was sown: how deep the seed went and how far apart the rows and the plants are. All
   three are optional. Each keeps the number and unit the farmer typed, so it reads back as written. */
import { z } from 'zod';

export const LENGTH_UNITS = ['cm', 'mm', 'm'] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

const MM_PER: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000 };

/** Sanity limits against typos (a depth in metres meant as cm), not advice on how to sow. */
const MAX_DEPTH_MM = 500;
const MAX_SPACING_MM = 10_000;

export const toMillimetres = (m: Measure) => m.value * MM_PER[m.unit];

const MeasureSchema = z.strictObject({
  value: z.number().positive(),
  unit: z.enum(LENGTH_UNITS),
});
export type Measure = z.infer<typeof MeasureSchema>;

const within = (maxMm: number) => MeasureSchema.refine((m) => toMillimetres(m) <= maxMm, { message: 'too_large' });

export const SowingSchema = z
  .strictObject({
    depth: within(MAX_DEPTH_MM).optional(),
    rowSpacing: within(MAX_SPACING_MM).optional(),
    plantSpacing: within(MAX_SPACING_MM).optional(),
  })
  .refine((s) => s.depth || s.rowSpacing || s.plantSpacing, { message: 'empty' });
export type Sowing = z.infer<typeof SowingSchema>;
export type SowingField = keyof Sowing;
export const SOWING_FIELDS: readonly SowingField[] = ['depth', 'rowSpacing', 'plantSpacing'];

/** "12,5 cm": the number as the farmer wrote it, with a comma. */
export const measureText = (m: Measure) => `${String(m.value).replace('.', ',')} ${m.unit}`;

/**
 * What the farmer typed in a field, or null when it's blank or not a number. A comma or a dot both
 * work, as with hectares.
 */
export function readMeasure(text: string, unit: LengthUnit): Measure | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t) || Number(t) <= 0) return null;
  return { value: Number(t), unit };
}

/** The filled-in fields only, or undefined when none is: nothing is stored for an empty form. */
export function sowingOrNothing(s: Partial<Sowing>): Sowing | undefined {
  const kept = Object.fromEntries(SOWING_FIELDS.filter((k) => s[k]).map((k) => [k, s[k]])) as Sowing;
  return Object.keys(kept).length ? kept : undefined;
}
