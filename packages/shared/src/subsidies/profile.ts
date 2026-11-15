import { haToAri, type Ari } from '../money';
import { isFallow, type ProfileField } from '../data/schemas';

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
  /** Uncultivated land not entered as a parcel (e.g. field margins). Fallow parcels add to it. */
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
  /** unproductive_ha / arable_ha, in hundredths of a percent (integer): 2% = 200. */
  unproductive_pct: number;
}

/** Fields whose values are areas (stored in ari, rules written in ha). */
export const AREA_FIELDS: ReadonlySet<ProfileField> = new Set([
  'total_ha',
  'arable_ha',
  'unproductive_ha',
]);

/** Fields whose values are shares (stored in hundredths of a %, rules written in %). */
export const PCT_FIELDS: ReadonlySet<ProfileField> = new Set(['unproductive_pct']);

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
/** keyOf: what counts as one crop for diversification. APIA counts by genus (data/catalogue.ts). */
export function buildProfile(farm: FarmInput, minParcelAri = 0, keyOf: (cropId: string) => string = (id) => id): FarmProfile {
  const parcels = normalizeParcels(farm.parcels).filter((p) => p.areaAri >= minParcelAri);
  const arable = parcels.filter((p) => p.isArable);
  const arableAri = arable.reduce((s, p) => s + p.areaAri, 0);
  // Fallow land is arable land and counts as a crop of its own (diversification, PD-04).
  const fallowAri = arable.filter((p) => isFallow(p.cropId)).reduce((s, p) => s + p.areaAri, 0);
  const unproductiveAri = fallowAri + haToAri(farm.unproductiveHa ?? 0);
  return {
    total_ha: parcels.reduce((s, p) => s + p.areaAri, 0),
    arable_ha: arableAri,
    distinct_crops: new Set(arable.map((p) => keyOf(p.cropId))).size,
    age: farm.age,
    dairy_cows: farm.dairyCows ?? 0,
    beef_cattle: farm.beefCattle ?? 0,
    unproductive_ha: unproductiveAri,
    // Floored, so a farm just under a threshold never reads as meeting it.
    unproductive_pct: arableAri > 0 ? Math.floor((unproductiveAri * 10_000) / arableAri) : 0,
  };
}
