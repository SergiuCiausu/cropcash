import { describe, expect, it } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { ionFarm } from './farm';
import { areaShare, harvestScope, loadHarvests, type HarvestState } from './harvests';
import { reopenProject, scopeOf } from './plan';
import { farmKeys, memoryStore } from './storage';

const data = loadData();
const ion = ionFarm(data);

describe('harvests', () => {
  it("starts Ion's demo with the harvest under way", () => {
    const h = loadHarvests({ store: memoryStore(), mode: 'demo', me: null, baseYear: 2027, baseFarm: ion, farmData: data });
    expect(h.selected).toBe('r2027');
    expect(h.items).toHaveLength(1);
    expect(h.items[0].openingBani).toBe(ion.startBalanceBani);
  });

  it('drops sample years saved by an older version, and a pick that no longer exists', () => {
    const saved: Partial<HarvestState> = {
      selected: 'gone',
      crop: null,
      items: [
        { id: 'r2026', year: 2026, status: 'closed', parcels: [], openingBani: 0, summary: '', records: [], illustrative: true },
        { id: 'r2027', year: 2027, status: 'open', parcels: ion.parcels, openingBani: 1, summary: '', records: [] },
      ],
    };
    const store = memoryStore({ [farmKeys('demo').harvests]: JSON.stringify(saved) });
    const h = loadHarvests({ store, mode: 'demo', me: null, baseYear: 2027, baseFarm: ion, farmData: data });
    expect(h.items.map((x) => x.id)).toEqual(['r2027']);
    expect(h.selected).toBe('r2027');
  });

  it('splits APIA money by hectares so the parts add up exactly', () => {
    const parcels = [
      { cropId: 'grau', areaHa: 8 },
      { cropId: 'porumb', areaHa: 7 },
    ];
    const total = 1_686_577;
    expect(areaShare(total, parcels, 'grau') + areaShare(total, parcels, 'porumb')).toBe(total);
    expect(areaShare(total, parcels, 'floarea')).toBe(0);
  });

  it('whole-farm pages ignore the picked crop and keep every record since the harvest began', () => {
    const state: HarvestState = {
      selected: 'r2028',
      crop: 'grau',
      gathered: [],
      expected: [],
      ownCrops: [],
      items: [
        { id: 'r2027', year: 2027, status: 'closed', parcels: ion.parcels, openingBani: 1, summary: '', records: [{ id: 'a', date: '2026-11-03', kind: 'expense', amountBani: -1 }] },
        { id: 'r2028', year: 2028, status: 'open', parcels: ion.parcels, openingBani: 2, summary: '', records: [{ id: 'b', date: '2026-12-01', kind: 'expense', amountBani: -2 }] },
      ],
    };
    const farm = harvestScope(state, 2027, true);
    expect(farm.selectedCrop).toBeNull();
    expect(farm.scope.id).toBe('r2027');
    expect(farm.records.map((r) => r.id)).toEqual(['a', 'b']);
    const picked = harvestScope(state, 2027, false);
    expect(picked.selectedCrop).toBe('grau');
    expect(picked.records.map((r) => r.id)).toEqual(['b']);
  });

  it('knows which pages show the whole farm', () => {
    expect(scopeOf('/salariu')).toBe('farm');
    expect(scopeOf('/acasa')).toBe('farm');
    expect(scopeOf('/calendar')).toBe('picked');
    expect(scopeOf('/recolte')).toBe('picked');
  });

  it('reopens one crop and the year with it', () => {
    const h = { id: 'r2027', year: 2027, status: 'closed' as const, parcels: ion.parcels.map((p) => ({ ...p, status: 'closed' as const, planned: { inBani: 1, outBani: 1 } })), openingBani: 0, summary: '', records: [], planned: { inBani: 2, outBani: 2 } };
    reopenProject(h, 'grau');
    expect(h.status).toBe('open');
    expect(h.planned).toBeUndefined();
    expect(h.parcels.find((p) => p.cropId === 'grau')).toMatchObject({ status: 'open' });
    expect(h.parcels.find((p) => p.cropId === 'porumb')).toMatchObject({ status: 'closed' });
  });
});
