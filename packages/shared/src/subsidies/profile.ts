import { haToAri, type Ari } from '../money';
import type { ProfileField } from '../data/schemas';

export interface ParcelInput {
  cropId: string;
  /** Area in hectares (as entered by the farmer). */
  areaHa: number;
  /** Arable land (default true). Pastures/orchards would be false. */
  isArable?: boolean;
  /** When this parcel was sown, 'YYYY-MM'. Moves its first harvest. */
  plantedMonth?: string;
}

export interface FarmInput {
  parcels: ParcelInput[];
  age: number;
  dairyCows?: number;
  beefCattle?: number;
  unproductiveHa?: number;
}

/** Normalized parcel with integer area. */
export interface Parcel {
  cropId: string;
  areaAri: Ari;
  isArable: boolean;
  plantedMonth?: string;
}

/**
 * The flat view of a farm that eligibility rules are evaluated against.
 * Hectare fields are in ari (integer) to keep comparisons exact.
 */
export interface FarmProfile {
  total_ha: Ari;
  arable_ha: Ari;
  distinct_crops: number;
  age: number;
  dairy_cows: number;
  beef_cattle: number;
  unproductive_ha: Ari;
}

/** Fields whose values are areas (stored in ari, rules written in ha). */
export const AREA_FIELDS: ReadonlySet<ProfileField> = new Set([
  'total_ha',
  'arable_ha',
  'unproductive_ha',
]);

export function normalizeParcels(input: ParcelInput[]): Parcel[] {
  return input.map((p) => {
    if (!(p.areaHa > 0)) throw new Error(`Parcel area must be positive, got ${p.areaHa}`);
    return {
      cropId: p.cropId,
      areaAri: haToAri(p.areaHa),
      isArable: p.isArable ?? true,
      ...(p.plantedMonth ? { plantedMonth: p.plantedMonth } : {}),
    };
  });
}

/**
 * Builds the rule-evaluation profile, optionally ignoring parcels smaller than
 * minParcelAri (schemes like PD-04 only count parcels of at least 0.3 ha).
 */
export function buildProfile(farm: FarmInput, minParcelAri = 0): FarmProfile {
  const parcels = normalizeParcels(farm.parcels).filter((p) => p.areaAri >= minParcelAri);
  const arable = parcels.filter((p) => p.isArable);
  return {
    total_ha: parcels.reduce((s, p) => s + p.areaAri, 0),
    arable_ha: arable.reduce((s, p) => s + p.areaAri, 0),
    distinct_crops: new Set(arable.map((p) => p.cropId)).size,
    age: farm.age,
    dairy_cows: farm.dairyCows ?? 0,
    beef_cattle: farm.beefCattle ?? 0,
    unproductive_ha: haToAri(farm.unproductiveHa ?? 0),
  };
}
