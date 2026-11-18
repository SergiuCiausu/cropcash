import { describe, expect, it } from 'vitest';
import { op, plot, season } from './fixtures';
import { isTreatmentKind, plotsForCrop, upcomingWork } from './picks';

describe('plotsForCrop', () => {
  const plots = [plot('a'), plot('b'), plot('c', { archived_at: '2027-01-01T00:00:00Z' }), plot('d')];
  const seasons = [season('a', 'grau', 500), season('b', 'porumb', 400), season('c', 'grau', 300), season('d', 'grau', 200, { harvest_year: 2026 })];

  it("offers the parcels growing the crop that year, never an archived one or another year's", () => {
    expect(plotsForCrop(plots, seasons, 2027, 'grau').map((p) => p.id)).toEqual(['a']);
    expect(plotsForCrop(plots, seasons, 2026, 'grau').map((p) => p.id)).toEqual(['d']);
  });

  it('with no crop, every parcel with something sown', () => {
    expect(plotsForCrop(plots, [...seasons, season('d', null, 200)], 2027, null).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('upcomingWork', () => {
  const plots = [plot('a'), plot('gone', { archived_at: '2027-01-01T00:00:00Z' })];
  it('planned work within the days or already late, the late first; not done, undated or archived work', () => {
    const ops = [
      op('soon', 'a', { status: 'planned', on_date: '2027-03-15' }),
      op('late', 'a', { status: 'planned', on_date: '2027-03-01' }),
      op('far', 'a', { status: 'planned', on_date: '2027-04-30' }),
      op('done', 'a', { status: 'done', on_date: '2027-03-12' }),
      op('undated', 'a', { status: 'planned', on_date: null }),
      op('archived', 'gone', { status: 'planned', on_date: '2027-03-11' }),
    ];
    expect(upcomingWork(ops, plots, '2027-03-10', 7).map((w) => [w.operation.id, w.daysLeft])).toEqual([
      ['late', -9],
      ['soon', 5],
    ]);
  });
});

it('treatments are herbicide, fungicide and insecticide', () => {
  expect(['herbicide', 'fungicide', 'insecticide', 'sowing', 'x'].map(isTreatmentKind)).toEqual([true, true, true, false, false]);
});
