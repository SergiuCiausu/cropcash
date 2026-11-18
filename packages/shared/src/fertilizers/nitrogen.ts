/* How much nitrogen went on each crop, and whether it's over the limit. Pure, integer maths. */
import { recordHarvestYear } from '../farm/harvests';
import type { FertilizerProduct, FertilizerUnit, NitrogenLimitsFile } from './model';

type NProduct = Pick<FertilizerProduct, 'form' | 'n_total_bp' | 'density_kg_l'>;

/**
 * Grams of N in `qty` kg or litres of a product. Null when it can't be known: no N content,
 * a liquid in litres with no density, or a solid in litres.
 * kg × bp / 10 000 × 1000 g = kg × bp / 10.
 */
export function nitrogenGrams(product: NProduct, qty: number, unit: FertilizerUnit): number | null {
  if (product.n_total_bp === null) return null;
  if (unit === 'kg') return Math.round((qty * product.n_total_bp) / 10);
  if (product.form !== 'liquid' || product.density_kg_l === null) return null;
  // Density has 2 decimals: work in hundredths so it stays whole numbers.
  const densityCenti = Math.round(product.density_kg_l * 100);
  return Math.round((qty * densityCenti * product.n_total_bp) / 1000);
}

/** kg N per hectare, rounded to whole kg. grams / 1000 / (ari / 100) = grams / (10 × ari). */
export function nitrogenKgPerHa(grams: number, areaAri: number): number | null {
  if (areaAri <= 0) return null;
  return Math.round(grams / (10 * areaAri));
}

export interface FertilizerRecord {
  kind?: string | null;
  category?: string | null;
  crop_id?: string | null;
  occurred_at: string;
  harvest_year?: number | null;
  fertilizer_product_id?: string | null;
  fertilizer_qty?: number | null;
  fertilizer_unit?: FertilizerUnit | null;
}

export type NitrogenVerdict = 'ok' | 'over' | 'unknown';

export interface CropNitrogen {
  cropId: string;
  areaAri: number;
  grams: number;
  kgPerHa: number | null;
  /** From docs/data/nitrogen-limits.json. Null when there's no confirmed limit for the crop. */
  limitKgHa: number | null;
  verdict: NitrogenVerdict;
  /** Records whose N couldn't be worked out (unknown product, no N content, litres without density). */
  unknownRecords: number;
}

export interface HarvestNitrogen {
  year: number;
  crops: CropNitrogen[];
  /** Grams of N recorded for the whole farm (no crop): not counted on any crop. */
  farmWideGrams: number;
}

export function nitrogenVerdict(kgPerHa: number | null, limitKgHa: number | null): NitrogenVerdict {
  if (kgPerHa === null || limitKgHa === null) return 'unknown';
  return kgPerHa > limitKgHa ? 'over' : 'ok';
}

/** A crop's limit, only when it's confirmed. A DE-VERIFICAT figure never judges a farmer. */
export function cropNitrogenLimit(limits: NitrogenLimitsFile, cropId: string): number | null {
  const c = limits.crops[cropId];
  return c && c.status === 'confirmat' ? c.max_n_kg_ha : null;
}

/**
 * Mineral N per hectare for each crop of a harvest, from the fertilizer expenses recorded.
 * A crop with an unknown record shows 'unknown' rather than a too-low 'ok'.
 */
export function harvestNitrogen(
  year: number,
  records: readonly FertilizerRecord[],
  parcels: readonly { crop_id: string; area_ari: number }[],
  products: ReadonlyMap<string, NProduct>,
  limits: NitrogenLimitsFile,
  crops: readonly { id: string; harvest_month: number; family?: string }[] = [],
): HarvestNitrogen {
  const area = new Map<string, number>();
  for (const p of parcels) area.set(p.crop_id, (area.get(p.crop_id) ?? 0) + p.area_ari);

  const grams = new Map<string, number>();
  const unknown = new Map<string, number>();
  let farmWideGrams = 0;
  for (const r of records) {
    if (r.kind !== 'expense' || !r.fertilizer_product_id || !r.fertilizer_qty || !r.fertilizer_unit) continue;
    if (recordHarvestYear(r, crops) !== year) continue;
    const product = products.get(r.fertilizer_product_id);
    const g = product ? nitrogenGrams(product, r.fertilizer_qty, r.fertilizer_unit) : null;
    if (!r.crop_id) {
      farmWideGrams += g ?? 0;
      continue;
    }
    if (g === null) unknown.set(r.crop_id, (unknown.get(r.crop_id) ?? 0) + 1);
    else grams.set(r.crop_id, (grams.get(r.crop_id) ?? 0) + g);
  }

  const crops_: CropNitrogen[] = [...area.entries()].map(([cropId, areaAri]) => {
    const g = grams.get(cropId) ?? 0;
    const unknownRecords = unknown.get(cropId) ?? 0;
    const kgPerHa = nitrogenKgPerHa(g, areaAri);
    // An APIA line of a family (Grâu dur de primăvară) has the family's limit.
    const limitKgHa = cropNitrogenLimit(limits, crops.find((c) => c.id === cropId)?.family ?? cropId);
    const verdict = nitrogenVerdict(kgPerHa, limitKgHa);
    // Over stays over even with an unknown record; ok isn't sure until every record is known.
    return { cropId, areaAri, grams: g, kgPerHa, limitKgHa, verdict: verdict === 'ok' && unknownRecords > 0 ? 'unknown' : verdict, unknownRecords };
  });
  return { year, crops: crops_, farmWideGrams };
}
