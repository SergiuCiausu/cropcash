/* The fertilizer catalogue and what a fertilizer expense records.
   Shapes match supabase/migrations/024_fertilizers.sql and docs/data/fertilizers.json.
   Nutrient contents are basis points: 4600 = 46.00 %. */
import { z } from 'zod';

const Status = z.enum(['confirmat', 'DE-VERIFICAT']);
/** 0–100 %, in basis points. */
const Bp = z.number().int().min(0).max(10_000);
const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/);

export const N_FORMS = ['nitric', 'ammoniacal', 'ureic', 'cyanamide', 'organic'] as const;
export const INHIBITORS = ['NBPT', 'DMPP', 'DCD', 'other'] as const;
export const FERTILIZER_FORMS = ['solid', 'liquid'] as const;
/** Solids are recorded in kg, liquids in litres. */
export const FERTILIZER_UNITS = ['kg', 'l'] as const;
export type FertilizerUnit = (typeof FERTILIZER_UNITS)[number];

export const FertilizerTypeSchema = z.object({
  id: Slug,
  section: z.string().min(1).max(10),
  annex_no: z.string().min(1).max(10).nullable(),
  name_ro: z.string().min(1).max(160),
  name_en: z.string().min(1).max(160).nullable(),
  form: z.enum(FERTILIZER_FORMS),
  n_min_bp: Bp.nullable(),
  n_forms: z.array(z.enum(N_FORMS)),
  p2o5_min_bp: Bp.nullable(),
  k2o_min_bp: Bp.nullable(),
  s_min_bp: Bp.nullable(),
  /** Sulphur as the annex writes it (SO3), not converted to S. */
  so3_min_bp: Bp.nullable(),
  mgo_min_bp: Bp.nullable(),
  cao_min_bp: Bp.nullable(),
  /** Compound fertilizers: the minimum sum of the declared nutrients. */
  total_min_bp: Bp.nullable(),
  is_nitrogen: z.boolean(),
  note: z.string().max(1000).nullable(),
  source: z.string().min(1).max(60).nullable(),
  status: Status,
});
export type FertilizerType = z.infer<typeof FertilizerTypeSchema>;

const productFields = {
  id: Slug,
  type_id: Slug.nullable(),
  /** How well the product fits its type: a product can sit between two annex rows. */
  type_match: z.enum(['exact', 'aproximativ', 'niciunul']).nullable(),
  brand: z.string().trim().min(1).max(120),
  manufacturer: z.string().trim().min(1).max(120).nullable(),
  /** Null when the source isn't Romanian and it isn't confirmed on sale here. */
  sold_in_ro: z.boolean().nullable(),
  form: z.enum(FERTILIZER_FORMS),
  n_total_bp: Bp.nullable(),
  n_nitric_bp: Bp.nullable(),
  n_ammoniacal_bp: Bp.nullable(),
  n_ureic_bp: Bp.nullable(),
  p2o5_bp: Bp.nullable(),
  k2o_bp: Bp.nullable(),
  s_bp: Bp.nullable(),
  so3_bp: Bp.nullable(),
  mgo_bp: Bp.nullable(),
  cao_bp: Bp.nullable(),
  inhibitor: z.enum(INHIBITORS).nullable(),
  density_kg_l: z.number().positive().lt(3).nullable(),
  source_url: z.url().max(500).nullable(),
  status: Status,
  note: z.string().max(1000).nullable(),
};

/** The N forms can't add up to more than the total, and only a liquid has a density. */
function consistent(p: { n_total_bp: number | null; n_nitric_bp: number | null; n_ammoniacal_bp: number | null; n_ureic_bp: number | null; form: string; density_kg_l: number | null }): boolean {
  const forms = (p.n_nitric_bp ?? 0) + (p.n_ammoniacal_bp ?? 0) + (p.n_ureic_bp ?? 0);
  return forms <= (p.n_total_bp ?? 10_000) && (p.density_kg_l === null || p.form === 'liquid');
}

export const FertilizerProductSchema = z.object(productFields).refine(consistent, { message: 'inconsistent product' });
export type FertilizerProduct = z.infer<typeof FertilizerProductSchema>;

export const FertilizersFileSchema = z
  .object({
    meta: z.object({
      description: z.string(),
      sources: z.array(z.object({ id: z.string(), title: z.string(), url: z.string() })),
    }).passthrough(),
    types: z.array(FertilizerTypeSchema),
    products: z.array(FertilizerProductSchema),
  })
  .superRefine((f, ctx) => {
    const types = new Set(f.types.map((t) => t.id));
    if (types.size !== f.types.length) ctx.addIssue({ code: 'custom', message: 'duplicate type id' });
    const ids = new Set(f.products.map((p) => p.id));
    if (ids.size !== f.products.length) ctx.addIssue({ code: 'custom', message: 'duplicate product id' });
    for (const p of f.products) {
      if (p.type_id && !types.has(p.type_id)) ctx.addIssue({ code: 'custom', message: `unknown type ${p.type_id} on ${p.id}` });
    }
  });
export type FertilizersFile = z.infer<typeof FertilizersFileSchema>;

const LimitValue = z.object({ value: z.number().int().positive().nullable(), status: Status }).passthrough();
const KgHa = z.number().int().positive().nullable();
export const NitrogenLimitsFileSchema = z.object({
  meta: z.object({ description: z.string() }).passthrough(),
  manure_n_cap_kg_ha: LimitValue,
  /**
   * Mineral N, for a farm without an agrochemical soil study (with one, the dose is worked out
   * from the planned yield). `max_n_kg_ha` is for slopes up to 12 %.
   */
  crops: z.record(
    z.string(),
    z.object({ max_n_kg_ha: KgHa, max_n_kg_ha_slope_over_12pct: KgHa.optional(), status: Status }).passthrough(),
  ),
});
export type NitrogenLimitsFile = z.infer<typeof NitrogenLimitsFileSchema>;

/**
 * A product a catalogue editor adds through the API. The id is made from manufacturer + brand.
 * New products start DE-VERIFICAT until someone checks them against the datasheet.
 */
export const NewFertilizerProductSchema = z
  .strictObject({
    type_id: productFields.type_id,
    brand: productFields.brand,
    manufacturer: productFields.manufacturer,
    sold_in_ro: productFields.sold_in_ro.default(true),
    form: productFields.form,
    n_total_bp: productFields.n_total_bp,
    n_nitric_bp: productFields.n_nitric_bp.default(null),
    n_ammoniacal_bp: productFields.n_ammoniacal_bp.default(null),
    n_ureic_bp: productFields.n_ureic_bp.default(null),
    p2o5_bp: productFields.p2o5_bp.default(null),
    k2o_bp: productFields.k2o_bp.default(null),
    s_bp: productFields.s_bp.default(null),
    so3_bp: productFields.so3_bp.default(null),
    mgo_bp: productFields.mgo_bp.default(null),
    cao_bp: productFields.cao_bp.default(null),
    inhibitor: productFields.inhibitor.default(null),
    density_kg_l: productFields.density_kg_l.default(null),
    source_url: productFields.source_url.default(null),
    type_match: productFields.type_match.default(null),
    note: productFields.note.default(null),
  })
  .refine(consistent, { message: 'inconsistent product' });
export type NewFertilizerProduct = z.infer<typeof NewFertilizerProductSchema>;

/** "Azomureș" + "Nitrocalcar 27" → "azomures-nitrocalcar-27". */
export function fertilizerProductId(manufacturer: string | null, brand: string): string {
  return [manufacturer, brand]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** What was spread, sent with a fertilizer expense. */
export const FertilizerUseSchema = z.strictObject({
  productId: Slug,
  qty: z.number().int().min(1).max(10_000_000),
  unit: z.enum(FERTILIZER_UNITS),
});
export type FertilizerUse = z.infer<typeof FertilizerUseSchema>;
