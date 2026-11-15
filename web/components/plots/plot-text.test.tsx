/* The words on /harta's rows and cards, and where its parcels come from (docs/harta-plan.md, step 8). */
import { describe, expect, it } from 'vitest';
import { geodesicAreaAri } from '../../../packages/shared/src/plots/index';
import { farmTransactions, ionPlots, readPlotsCopy, savePlotsCopy, unplacedFarmPlots } from '../../lib/cc/farm-plots';
import { memoryStore } from '../../lib/cc/storage';
import { seasonBar } from './PlotCard';
import { dueText, harvestText, nextWorkText, perHaText, plotName, sowingText } from './plot-text';

const cropName = (id: string) => ({ grau: 'Grâu', porumb: 'Porumb' })[id] ?? id;
const TODAY = '2026-11-15';

describe('a parcel in words', () => {
  it('is named by the farmer, by its bloc, or by the crop still to place', () => {
    const p = { name: null, bloc_fizic: '286', parcel_no: '1a', auto_crop_id: null };
    expect(plotName(p, cropName)).toBe('Bloc 286 · parcela 1a');
    expect(plotName({ ...p, name: 'La salcâmi' }, cropName)).toBe('La salcâmi');
    expect(plotName({ ...p, parcel_no: null }, cropName)).toBe('Bloc 286');
    expect(plotName({ ...p, bloc_fizic: null, parcel_no: null, auto_crop_id: 'porumb' }, cropName)).toBe('Porumb, fără loc pe hartă');
  });

  it('harvest: a guess says „~”, a recorded day says the day', () => {
    expect(harvestText({ month: '2027-07', date: null, monthsLeft: 8, state: 'upcoming', source: 'crop_usual' })).toBe('recoltă în ~8 luni');
    expect(harvestText({ month: '2026-12', date: null, monthsLeft: 1, state: 'upcoming', source: 'crop_usual' })).toBe('recoltă luna viitoare');
    expect(harvestText({ month: '2026-11', date: null, monthsLeft: 0, state: 'this_month', source: 'crop_usual' })).toBe('recoltă luna asta');
    expect(harvestText({ month: '2026-07', date: '2026-07-12', monthsLeft: -4, state: 'harvested', source: 'recorded' })).toBe('recoltat pe 12 iul. 2026');
    expect(harvestText({ month: '2026-09', date: null, monthsLeft: -2, state: 'late', source: 'crop_usual' })).toBe('recolta era de așteptat în sept. 2026');
    expect(harvestText(null)).toBeNull();
  });

  it('sowing: whose month it is, and whether it already happened', () => {
    expect(sowingText({ month: '2026-10', date: '2026-10-05', source: 'recorded' }, TODAY)).toBe('semănat pe 5 oct. 2026');
    expect(sowingText({ month: '2026-10', date: null, source: 'farm_plan' }, TODAY)).toBe('semănat în oct. 2026, după planul tău');
    expect(sowingText({ month: '2027-04', date: null, source: 'crop_usual' }, TODAY)).toBe('se seamănă de obicei în apr. 2027');
  });

  it('work: late first, then the next, then nothing', () => {
    const item = (due: string | null, overdue = false) => ({ kind: 'fungicide' as const, operationId: 'o', templateId: null, due, overdue });
    expect(dueText(item('2026-11-15'), TODAY)).toBe('azi');
    expect(dueText(item('2026-11-16'), TODAY)).toBe('mâine');
    expect(dueText(item('2026-11-25'), TODAY)).toBe('în 10 zile');
    expect(dueText(item('2027-03-12'), TODAY)).toBe('pe 12 mar.');
    expect(dueText(item(null), TODAY)).toBe('fără zi');
    const ops = (overdue: ReturnType<typeof item>[], next: ReturnType<typeof item> | null) => ({ operations: { done: [], todo: [...overdue, ...(next ? [next] : [])], overdue, next } });
    expect(nextWorkText(ops([item('2026-11-10', true)], null), TODAY)).toEqual({ text: 'Fungicid, întârziat de acum 5 zile', late: true });
    expect(nextWorkText(ops([item('2026-11-10', true), item('2026-11-01', true)], null), TODAY)!.text).toBe('2 lucrări întârziate');
    expect(nextWorkText(ops([], item('2026-11-20')), TODAY)).toEqual({ text: 'Fungicid în 5 zile', late: false });
    expect(nextWorkText(ops([], null), TODAY)).toBeNull();
  });

  it('result per hectare only when there is money', () => {
    const money = (result: number, spent: number) => ({ money: { expenses: { direct: 0, sharedCrop: 0, sharedFarm: 0, total: spent, byCategory: {} }, revenue: { direct: 0, sharedCrop: 0, total: 0 }, result: -spent, perHa: { expenses: 0, revenue: 0, result } } });
    expect(perHaText(money(-20_000, 100_000))).toBe('−200 lei/ha');
    expect(perHaText(money(125_000, 100_000))).toBe('+1.250 lei/ha');
    expect(perHaText(money(0, 0))).toBeNull();
    expect(perHaText({ money: null })).toBeNull();
  });

  it('the season bar: where today sits between sowing and harvest', () => {
    const harvest = { month: '2027-07', date: null, monthsLeft: 8, state: 'upcoming' as const, source: 'crop_usual' as const };
    expect(seasonBar({ sowing: { month: '2026-10', date: null, source: 'farm_plan' }, harvest }, TODAY)!.now).toBeCloseTo(1 / 9);
    expect(seasonBar({ sowing: null, harvest }, TODAY)).toBeNull();
  });
});

describe("where /harta's parcels come from", () => {
  it("Ion: wheat on bloc 286 and maize on 293, his real blocs, with the hectares he declares", () => {
    const f = ionPlots([{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 7 }], 2027);
    expect(f.plots.map((p) => [p.bloc_fizic, p.lpis_fbid, p.geometry_source, p.auto_crop_id])).toEqual([
      ['286', '153277-286', 'lpis', null],
      ['293', '153277-293', 'lpis', null],
    ]);
    expect(f.seasons.map((s) => [s.crop_id, s.area_ari, s.harvest_year])).toEqual([
      ['grau', 800, 2027],
      ['porumb', 700, 2027],
    ]);
    // The blocs are a bit bigger than what he declares, as APIA's net areas say (8,54 ha and 7,19 ha).
    expect(Math.round(geodesicAreaAri(f.plots[0]!.geometry!) / 100)).toBe(9);
    expect(f.plots[1]!.centroid_lat).toBeGreaterThan(44);
    // His demo work (demo-ion.json, plot_work) sits on the parcel of its crop, in the year under way only.
    expect(f.operations.map((o) => [o.plot_id, o.kind, o.status, o.on_date])).toEqual([
      ['ion-grau', 'soil_work', 'done', '2026-09-28'],
      ['ion-grau', 'sowing', 'done', '2026-10-10'],
      ['ion-grau', 'herbicide', 'done', '2026-11-05'],
      ['ion-grau', 'insecticide', 'planned', '2026-11-20'],
      ['ion-grau', 'fertilizing', 'planned', '2027-03-05'],
      ['ion-porumb', 'soil_work', 'done', '2026-11-10'],
      ['ion-porumb', 'sowing', 'planned', '2027-04-15'],
    ]);
    expect(f.seasons[0]!.sown_on).toBe('2026-10-10');
    expect(ionPlots([{ cropId: 'grau', areaHa: 8 }], 2026).operations).toEqual([]);
  });

  it('a farm only on the phone: one unplaced parcel per crop', () => {
    const f = unplacedFarmPlots([{ cropId: 'grau', areaHa: 5.5 }], 'TR', 2027);
    expect(f.plots[0]).toMatchObject({ auto_crop_id: 'grau', geometry_source: 'none' });
    expect(f.seasons[0]).toMatchObject({ area_ari: 550, crop_id: 'grau' });
  });

  it('the copy on the phone: kept whole, and a broken one is ignored', () => {
    const kv = memoryStore();
    savePlotsCopy(kv, 'cropcash-plots', { plots: [], seasons: [], operations: [] }, '2026-11-14T10:00:00Z');
    expect(readPlotsCopy(kv, 'cropcash-plots')!.at).toBe('2026-11-14T10:00:00Z');
    kv.setItem('cropcash-plots', '{"plots":{"plots":"x"}}');
    expect(readPlotsCopy(kv, 'cropcash-plots')).toBeNull();
  });

  it('money: the server’s records, or the phone’s harvest records with their year', () => {
    expect(farmTransactions({ transactions: [{ id: 't' }] }, undefined)).toEqual([{ id: 't' }]);
    const harvests = [{ year: 2027, records: [{ id: 'r', kind: 'expense', category: 'seeds', cropId: 'grau', amountBani: -5000, date: '2026-10-01' }, { id: 'a', kind: 'apia_advance', amountBani: 1, date: '2026-10-16' }] }];
    expect(farmTransactions(null, harvests as never)).toEqual([expect.objectContaining({ id: 'r', harvest_year: 2027, crop_id: 'grau', amount_bani: -5000 })]);
  });
});
