import { describe, expect, it } from 'vitest';
import params from '../../../../docs/data/plots-params.json';
import { loadData } from '../data';
import { expense, op, plot, sale, season } from './fixtures';
import { activeFilters, DEFAULT_VIEW, filterOptions, filterPlots, filtersFromQuery, filtersToQuery, PLOT_QUERY_KEYS, sortPlots, viewFromQuery, viewToQuery, withoutFilter, type PlotFilters } from './filters';
import { PlotsParamsSchema } from './model';
import { plotsMoney, splitByArea } from './money';
import { operationsStatus } from './operations';
import { buildPlotRows, cropGroups } from './rows';
import { expectedHarvest, sowingOf } from './season';

const crops = loadData().crops.crops;
const wheat = crops.find((c) => c.id === 'grau')!;
const maize = crops.find((c) => c.id === 'porumb')!;
const P = PlotsParamsSchema.parse(params);
const TODAY = '2026-11-15';
const query = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe('sowing and harvest', () => {
  it('wheat for Recolta 2027 is sown in autumn 2026 and cut in summer 2027', () => {
    expect(sowingOf(season('a', 'grau', 100), wheat)).toEqual({ month: `2026-${String(wheat.sowing_month).padStart(2, '0')}`, date: null, source: 'crop_usual' });
    const h = expectedHarvest(season('a', 'grau', 100), wheat, TODAY)!;
    expect(h.month).toBe(`2027-${String(wheat.harvest_month).padStart(2, '0')}`);
    expect(h.state).toBe('upcoming');
    expect(h.monthsLeft).toBe(wheat.harvest_month + 1);
  });

  it('a recorded date wins, then the farm plan month, then the crop usual month', () => {
    expect(sowingOf(season('a', 'grau', 100, { sown_on: '2026-10-03' }), wheat, '2026-09')?.source).toBe('recorded');
    expect(sowingOf(season('a', 'grau', 100), wheat, '2026-09')).toEqual({ month: '2026-09', date: null, source: 'farm_plan' });
    expect(sowingOf(season('a', 'porumb', 100), maize)?.month.startsWith('2027-')).toBe(true);
  });

  it('harvested, this month and late', () => {
    expect(expectedHarvest(season('a', 'grau', 100, { harvested_on: '2027-07-04' }), wheat, '2027-08-01')?.state).toBe('harvested');
    const month = `2027-${String(wheat.harvest_month).padStart(2, '0')}`;
    expect(expectedHarvest(season('a', 'grau', 100), wheat, `${month}-15`)?.state).toBe('this_month');
    expect(expectedHarvest(season('a', 'grau', 100), wheat, '2027-12-01')?.state).toBe('late');
    expect(expectedHarvest(season('a', null, 100), undefined, TODAY)).toBeNull();
  });
});

describe('money per parcel', () => {
  const seasons = [season('a', 'grau', 600), season('b', 'grau', 200), season('c', 'porumb', 200)];

  it('a split by area adds up exactly, the remainder on the largest', () => {
    const parts = splitByArea(1001, [season('x', 'grau', 1), season('y', 'grau', 2)]);
    expect(parts.get('y')! + parts.get('x')!).toBe(1001);
    expect(parts.get('y')).toBe(668);
  });

  it('direct, shared by crop, shared by farm, and revenue', () => {
    const money = plotsMoney(
      2027,
      seasons,
      [
        expense(10_000, { plot_id: 'a' }),
        expense(8_000, { crop_id: 'grau' }),
        expense(5_000, { category: 'diesel' }),
        sale(100_000, { crop_id: 'grau' }),
        sale(30_000, { plot_id: 'c', crop_id: 'porumb' }),
        expense(99_999, { plot_id: 'a', occurred_at: '2025-03-10T12:00:00Z' }),
      ],
      crops,
    );
    const a = money.get('a')!;
    expect(a.expenses).toMatchObject({ direct: 10_000, sharedCrop: 6_000, sharedFarm: 3_000, total: 19_000 });
    expect(a.expenses.byCategory).toEqual({ treatments: 16_000, diesel: 3_000 });
    expect(a.revenue.total).toBe(75_000);
    expect(a.result).toBe(56_000);
    expect(a.perHa).toEqual({ expenses: 3_167, revenue: 12_500, result: 9_333 });
    expect(money.get('c')!.revenue.direct).toBe(30_000);
    const all = [...money.values()].reduce((s, m) => s + m.expenses.total, 0);
    expect(all).toBe(23_000);
  });
});

describe('work on a parcel', () => {
  it('done, planned, late and suggested', () => {
    const ops = [
      op('1', 'a'),
      op('2', 'a', { status: 'planned', kind: 'fungicide', on_date: '2027-05-01' }),
      op('3', 'a', { status: 'planned', kind: 'insecticide', on_date: '2026-11-01' }),
      op('4', 'b', { status: 'planned' }),
    ];
    const templates = [
      { id: 't1', crop_id: 'grau', kind: 'fertilizing' as const, from_month: 2, to_month: 3 },
      { id: 't2', crop_id: 'grau', kind: 'herbicide' as const, from_month: 3, to_month: 4 },
    ];
    const s = operationsStatus('a', 2027, [...ops, op('5', 'a', { template_id: 't2' })], templates, TODAY);
    expect(s.done.map((o) => o.id)).toEqual(['1', '5']);
    expect(s.overdue.map((t) => t.operationId)).toEqual(['3']);
    expect(s.todo.map((t) => t.templateId ?? t.operationId)).toEqual(['3', 't1', '2']);
    expect(s.next?.templateId).toBe('t1');
    expect(s.next?.due).toBe('2027-03-31');
  });
});

describe('rows, crop groups, filters and sorting', () => {
  const plots = [
    plot('a', { name: 'La pădure', siruta: 153277 }),
    plot('b', { siruta: 152868, geometry_source: 'approx' }),
    plot('c', { siruta: 153277, land_use: 'PP' }),
    plot('u', { auto_crop_id: 'porumb', geometry_source: 'none', bloc_fizic: null, parcel_no: null }),
    plot('z', { archived_at: '2026-01-01T00:00:00Z' }),
  ];
  const seasons = [
    season('a', 'grau', 600, { sown_on: '2026-10-10' }),
    season('b', 'grau', 200),
    season('c', 'porumb', 200),
    season('u', 'porumb', 100),
    season('a', 'porumb', 600, { harvest_year: 2026 }),
    season('c', 'porumb', 200, { harvest_year: 2026 }),
  ];
  const rows = buildPlotRows({
    year: 2027,
    today: TODAY,
    plots,
    seasons,
    operations: [op('1', 'a'), op('2', 'b', { status: 'planned', on_date: '2026-12-01', kind: 'fungicide' })],
    transactions: [expense(60_000, { plot_id: 'a' }), sale(200_000, { crop_id: 'grau' })],
    crops,
  });

  it('archived parcels are left out, and last year is known', () => {
    expect(rows.map((r) => r.plot.id)).toEqual(['a', 'b', 'c', 'u']);
    expect(rows[0]!.previous?.crop_id).toBe('porumb');
  });

  it('"Pe culturi" groups by crop with totals', () => {
    const groups = cropGroups(rows);
    expect(groups.map((g) => [g.cropId, g.areaAri, g.plotIds.length])).toEqual([
      ['grau', 800, 2],
      ['porumb', 300, 2],
    ]);
    expect(groups[0]!.result).toBe(140_000);
    expect(groups[0]!.perHa?.result).toBe(17_500);
  });

  const ids = (f: PlotFilters) => filterPlots(rows, f, TODAY, P.todo_soon_days.value).map((r) => r.plot.id);

  it('filters on crop, size, money, work, dates, place and rotation', () => {
    expect(ids({ crops: ['porumb'] })).toEqual(['c', 'u']);
    expect(ids({ sizeAri: { min: 300 } })).toEqual(['a']);
    expect(ids({ expenses: { min: 50_000, perHa: false } })).toEqual(['a']);
    // a: (150 000 − 60 000) / 6 ha = 15 000 per ha; b: 50 000 / 2 ha = 25 000 per ha.
    expect(ids({ result: { min: 20_000, perHa: true } })).toEqual(['b']);
    expect(ids({ result: { min: 10_000, perHa: true } })).toEqual(['a', 'b']);
    expect(ids({ treatmentsDone: 'some' })).toEqual(['a']);
    expect(ids({ treatmentsDone: 'none' })).toEqual(['b', 'c', 'u']);
    expect(ids({ todo: 'soon' })).toEqual(['b']);
    expect(ids({ sown: { from: '2026-10', to: '2026-10' } })).toEqual(['a', 'b']);
    expect(ids({ siruta: [152868] })).toEqual(['b']);
    expect(ids({ text: 'pădure' })).toEqual(['a']);
    expect(ids({ placement: ['approx', 'none'] })).toEqual(['b', 'u']);
    expect(ids({ landUse: ['PP'] })).toEqual(['c']);
    expect(ids({ cropChanged: true })).toEqual(['a']);
    expect(ids({ cropChanged: false })).toEqual(['c']);
  });

  it('sorts with empty values last', () => {
    expect(sortPlots(rows, 'size', 'desc').map((r) => r.plot.id)).toEqual(['a', 'b', 'c', 'u']);
    expect(sortPlots(rows, 'next_treatment').map((r) => r.plot.id)[0]).toBe('b');
    expect(sortPlots(rows, 'name').map((r) => r.plot.id)[0]).toBe('u');
  });

  it('filters survive the URL both ways, and junk is dropped', () => {
    const f: PlotFilters = {
      crops: ['grau', 'porumb'],
      sizeAri: { min: 150, max: undefined },
      result: { min: 100_000, max: 500_000, perHa: true },
      treatmentsDone: ['herbicide', 'fungicide'],
      todo: 'overdue',
      harvest: { from: '2027-07', to: '2027-08' },
      siruta: [153277],
      placement: ['placed'],
      cropChanged: true,
    };
    const q = filtersToQuery(f);
    expect(q.rezultat).toBe('1000..5000/ha');
    expect(q.suprafata).toBe('1.5..');
    expect(filtersFromQuery(query(q))).toEqual({ ...f, sizeAri: { min: 150, max: undefined } });
    expect(filtersFromQuery(query({ recolta: 'iulie', de_facut: 'mâine', localitate: 'x,0', venit: '..' }))).toEqual({});
  });
  it('offers only choices the farm has: crops by area, sizes, months, places, work', () => {
    const o = filterOptions(rows);
    expect(o.crops).toEqual(['grau', 'porumb']);
    expect(o.sizeAri).toEqual({ min: 100, max: 600 });
    expect(o.siruta).toEqual([152868, 153277]);
    expect(o.landUses).toEqual(['PP', 'TA']);
    expect(o.placements).toEqual(['placed', 'approx', 'none']);
    expect(o.doneKinds.length).toBeGreaterThan(0);
    expect(o.hasTodo && o.hasRotation && o.hasMoney).toBe(true);
    expect(o.sown).toEqual([...o.sown].sort());
    const bare = buildPlotRows({ year: 2027, today: TODAY, plots: [plot('n', { auto_crop_id: null })], seasons: [], operations: [], transactions: [], crops });
    expect(filterOptions(bare)).toMatchObject({ crops: ['unknown'], sizeAri: null, hasTodo: false, hasRotation: false, hasMoney: false });
  });

  it('a chip takes away one filter; the rest stay in order', () => {
    const f: PlotFilters = { cropChanged: true, crops: ['grau'], todo: 'soon' };
    expect(activeFilters(f)).toEqual(['crops', 'todo', 'cropChanged']);
    expect(withoutFilter(f, 'todo')).toEqual({ cropChanged: true, crops: ['grau'] });
    expect(f.todo).toBe('soon');
  });

  it('the view (year, per crop, order) lives in the URL too, only when not the default', () => {
    expect(viewToQuery(DEFAULT_VIEW)).toEqual({});
    const v = { year: 2027, byCrop: true, sort: 'result_ha' as const, dir: 'desc' as const };
    expect(viewToQuery(v)).toEqual({ an: '2027', vedere: 'culturi', ordine: 'rezultat_ha-desc' });
    expect(viewFromQuery(query(viewToQuery(v)))).toEqual(v);
    expect(viewFromQuery(query({ an: '27', ordine: 'pret-desc', vedere: 'harta' }))).toEqual(DEFAULT_VIEW);
    const keys = [...Object.keys(filtersToQuery({ crops: ['grau'], todo: 'any', text: '286' })), ...Object.keys(viewToQuery(v))];
    for (const k of keys) expect(PLOT_QUERY_KEYS).toContain(k);
  });
});
