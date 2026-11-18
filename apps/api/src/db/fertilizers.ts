import type { SupabaseClient } from '@supabase/supabase-js';
import type { FertilizerProduct, FertilizerType, NewFertilizerProduct } from '@cropcash/shared';

export interface FertilizerCatalogue {
  types: FertilizerType[];
  products: (FertilizerProduct & { origin: 'seed' | 'added' })[];
}

export class CatalogueConflict extends Error {}
export class UnknownFertilizerType extends Error {}

/** The fertilizer catalogue (migration 024). Reads are public; writes use the service key. */
export interface FertilizerStore {
  read(): Promise<FertilizerCatalogue>;
  /** Throws CatalogueConflict when the id or the manufacturer + brand is taken. */
  addProduct(id: string, product: NewFertilizerProduct, addedBy: string): Promise<void>;
}

const TYPE_COLUMNS =
  'id, section, annex_no, name_ro, name_en, form, n_min_bp, n_forms, p2o5_min_bp, k2o_min_bp, s_min_bp, so3_min_bp, mgo_min_bp, cao_min_bp, total_min_bp, is_nitrogen, note, source, status';
const PRODUCT_COLUMNS =
  'id, type_id, type_match, brand, manufacturer, sold_in_ro, form, n_total_bp, n_nitric_bp, n_ammoniacal_bp, n_ureic_bp, ' +
  'p2o5_bp, k2o_bp, s_bp, so3_bp, mgo_bp, cao_bp, inhibitor, density_kg_l, source_url, status, note, origin';

/** `admin` must be the service-role client: callers check who may write. */
export function supabaseFertilizers(admin: SupabaseClient): FertilizerStore {
  return {
    async read() {
      const [types, products] = await Promise.all([
        admin.from('fertilizer_types').select(TYPE_COLUMNS).order('section').order('id'),
        admin.from('fertilizer_products').select(PRODUCT_COLUMNS).order('manufacturer').order('brand'),
      ]);
      if (types.error) throw new Error(types.error.message);
      if (products.error) throw new Error(products.error.message);
      return {
        types: types.data as unknown as FertilizerType[],
        // numeric comes back as a string from PostgREST.
        products: (products.data as unknown as FertilizerCatalogue['products']).map((p) => ({
          ...p,
          density_kg_l: p.density_kg_l === null ? null : Number(p.density_kg_l),
        })),
      };
    },

    async addProduct(id, product, addedBy) {
      const { error } = await admin
        .from('fertilizer_products')
        .insert({ ...product, id, status: 'DE-VERIFICAT', origin: 'added', added_by: addedBy });
      if (!error) return;
      if (error.code === '23505') throw new CatalogueConflict(error.message);
      if (error.code === '23503') throw new UnknownFertilizerType(error.message);
      throw new Error(error.message);
    },
  };
}
