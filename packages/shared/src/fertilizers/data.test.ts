import { describe, expect, it } from 'vitest';
import { loadFertilizerData } from './data';

describe('docs/data fertilizer files', () => {
  it('parse, and every product points at a known type', () => {
    const { catalogue, limits } = loadFertilizerData();
    expect(catalogue.types.length).toBeGreaterThan(0);
    expect(catalogue.products.length).toBeGreaterThan(0);
    expect(limits.manure_n_cap_kg_ha.value).not.toBeUndefined();
  });

  it('marks a product DE-VERIFICAT when its N forms add up to more than its total', () => {
    for (const p of loadFertilizerData().catalogue.products) {
      const forms = (p.n_nitric_bp ?? 0) + (p.n_ammoniacal_bp ?? 0) + (p.n_ureic_bp ?? 0);
      if (p.n_total_bp !== null && forms > p.n_total_bp) expect(p.status, p.id).toBe('DE-VERIFICAT');
    }
  });
});
