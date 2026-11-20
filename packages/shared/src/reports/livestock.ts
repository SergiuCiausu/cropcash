// The farm's animals for the APIA papers (docs/rapoarte-apia-plan.md, phase 3): the categories of the cerere's
// field 47 (docs/data/livestock.json), what the farmer keeps in `farmers.livestock` (migration 053), the herd in
// livestock units (UVM) and the diesel the animals are normed for (Anexa 3). Pure, no I/O.
import { z } from 'zod';
import { StatusSchema } from '../data/schemas';

export const LivestockFileSchema = z
  .object({
    meta: z
      .object({
        uvm_status: StatusSchema,
        hay_below_uvm_per_ha: z.object({ value: z.number().positive(), status: StatusSchema, source_url: z.string().url().nullable() }).passthrough(),
      })
      .passthrough(),
    categories: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9_]{1,40}$/),
          label_ro: z.string().min(1),
          unit_ro: z.string().min(1),
          /** Null: not counted in UVM (bee families). */
          uvm_per_head: z.number().positive().nullable(),
          /** The group in fuel-excise.json → caps_l_per_uvm; null: no diesel norm. */
          fuel_group: z.string().nullable(),
          field47: z.boolean(),
        }),
      )
      .min(1)
      .refine((c) => new Set(c.map((x) => x.id)).size === c.length, 'duplicate category'),
  })
  .passthrough();
export type LivestockFile = z.infer<typeof LivestockFileSchema>;

const Count = z.number().int().min(0).max(1_000_000);

/**
 * What the farmer noted about the animals (farmers.livestock). `counts` by category id; a category left out is 0.
 * `dairyCows`: of the cattle over 2 years, the dairy cows (PD-07). `hay`: the hay gathered off permanent grassland in a
 * year, in tenths of a tonne (Anexa 26).
 */
export const LivestockSchema = z.strictObject({
  counts: z.record(z.string().regex(/^[a-z0-9_]{1,40}$/), Count),
  ansvsaCode: z.string().trim().min(4).max(20).regex(/^[A-Za-z0-9]+$/).nullable().optional(),
  dairyCows: Count.nullable().optional(),
  hay: z.strictObject({ year: z.number().int().min(2000).max(2100), tenthsTonnes: z.number().int().min(0).max(10_000_000) }).nullable().optional(),
});
export type Livestock = z.infer<typeof LivestockSchema>;

/** PUT /api/farmers/me/livestock: the whole record, replacing what was saved. */
export const SetLivestockInputSchema = LivestockSchema;

/** Unknown categories (not in livestock.json) and dairy cows over the cattle over 2 years. */
export function livestockProblems(file: LivestockFile, l: Livestock): string[] {
  const ids = new Set(file.categories.map((c) => c.id));
  const out = Object.keys(l.counts).filter((k) => !ids.has(k)).map((k) => `unknown category ${k}`);
  if ((l.dairyCows ?? 0) > (l.counts.bovine_over_2y ?? 0)) out.push('more dairy cows than cattle over 2 years');
  return out;
}

/** All the heads (bee families left out). */
export const headCount = (file: LivestockFile, l: Livestock | null | undefined) =>
  file.categories.filter((c) => c.uvm_per_head !== null).reduce((s, c) => s + (l?.counts[c.id] ?? 0), 0);

/** Livestock units, in thousandths (so 1,5 UVM is 1500): heads × the category's coefficient. */
export function uvmMilli(file: LivestockFile, l: Livestock | null | undefined): { total: number; byCategory: { id: string; label: string; heads: number; uvmMilli: number }[] } {
  const byCategory = file.categories
    .filter((c) => c.uvm_per_head !== null && (l?.counts[c.id] ?? 0) > 0)
    .map((c) => ({ id: c.id, label: c.label_ro, heads: l!.counts[c.id]!, uvmMilli: Math.round(l!.counts[c.id]! * c.uvm_per_head! * 1000) }));
  return { total: byCategory.reduce((s, c) => s + c.uvmMilli, 0), byCategory };
}

export interface AnimalFuelRow {
  group: string;
  label: string;
  /** UVM in thousandths, or bee families for a group counted per family. */
  amount: number;
  perFamily: boolean;
  /** Litres per UVM (or per family) a year, in hundredths. */
  perUnitCl: number;
  /** The litres a year, in hundredths. */
  litresCl: number;
}

/** Anexa 3 to the diesel acord: the animals by norm group, with the litres they're normed for. */
export function animalFuel(file: LivestockFile, caps: readonly { id: string; label_ro: string; value_cl: number }[], l: Livestock | null | undefined): AnimalFuelRow[] {
  const rows: AnimalFuelRow[] = [];
  for (const cap of caps) {
    const cats = file.categories.filter((c) => c.fuel_group === cap.id && (l?.counts[c.id] ?? 0) > 0);
    if (!cats.length) continue;
    const perFamily = cats.every((c) => c.uvm_per_head === null);
    const amount = perFamily ? cats.reduce((s, c) => s + l!.counts[c.id]!, 0) : cats.reduce((s, c) => s + Math.round(l!.counts[c.id]! * (c.uvm_per_head ?? 0) * 1000), 0);
    rows.push({ group: cap.id, label: cap.label_ro, amount, perFamily, perUnitCl: cap.value_cl, litresCl: perFamily ? amount * cap.value_cl : Math.round((amount * cap.value_cl) / 1000) });
  }
  return rows;
}
