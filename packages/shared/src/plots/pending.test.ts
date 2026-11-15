import { describe, expect, it } from 'vitest';
import { op, plot, season } from './fixtures';
import { withPendingPlotWrites } from './pending';
import type { FarmPlots } from './wire';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const O1 = '33333333-3333-4333-8333-333333333333';
const base: FarmPlots = {
  plots: [plot(A), plot(B)],
  seasons: [season(A, 'grau', 300), season(B, 'porumb', 200)],
  operations: [op(O1, A, { kind: 'fungicide', status: 'planned', on_date: '2027-04-26' })],
};
const SEG = 8;

describe('withPendingPlotWrites', () => {
  it('nothing waiting: the same parcels', () => {
    expect(withPendingPlotWrites(base, [], SEG)).toEqual(base);
  });

  it('work noted offline shows on its parcel, marked as waiting', () => {
    const out = withPendingPlotWrites(base, [{ id: 'outbox:1', name: 'add_operation', input: { plotId: B, harvestYear: 2027, kind: 'insecticide', status: 'done', onDate: '2027-05-02', product: 'Karate Zeon' } }], SEG);
    expect(out.operations.at(-1)).toMatchObject({ id: 'outbox:1', plot_id: B, kind: 'insecticide', status: 'done', on_date: '2027-05-02', product: 'Karate Zeon', pending: true });
    expect(out.operations).toHaveLength(2);
  });

  it('a planned treatment marked done offline is done', () => {
    const out = withPendingPlotWrites(base, [{ id: 'outbox:2', name: 'update_operation', input: { id: O1, status: 'done', onDate: '2027-04-28' } }], SEG);
    expect(out.operations[0]).toMatchObject({ id: O1, kind: 'fungicide', status: 'done', on_date: '2027-04-28', pending: true });
  });

  it('an outline drawn offline is on the map, with its middle', () => {
    const shape = {
      vertices: [{ at: [25, 44] }, { at: [25.01, 44] }, { at: [25.01, 44.01] }, { at: [25, 44.01] }],
      edges: [{ type: 'line' }, { type: 'line' }, { type: 'line' }, { type: 'line' }],
    };
    const out = withPendingPlotWrites(base, [{ id: 'outbox:3', name: 'update_plot', input: { id: A, harvestYear: 2027, plot: { shape, geometrySource: 'drawn' } } }], SEG);
    const a = out.plots[0]!;
    expect(a.geometry_source).toBe('drawn');
    expect(a.geometry?.type).toBe('Polygon');
    expect(a.centroid_lat).toBeCloseTo(44.005, 3);
    expect(out.plots[1]).toBe(base.plots[1]);
  });

  it('a season changed offline replaces that year only', () => {
    const out = withPendingPlotWrites(base, [{ id: 'outbox:4', name: 'update_plot', input: { id: B, harvestYear: 2027, plot: { season: { cropId: 'floarea', areaAri: 250 } } } }], SEG);
    expect(out.seasons.filter((s) => s.plot_id === B)).toEqual([season(B, 'floarea', 250)]);
  });

  it("skips what doesn't parse or names a parcel this copy doesn't have", () => {
    const out = withPendingPlotWrites(
      base,
      [
        { id: 'outbox:5', name: 'add_operation', input: { plotId: '99999999-9999-4999-8999-999999999999', harvestYear: 2027, kind: 'sowing', status: 'planned' } },
        { id: 'outbox:6', name: 'add_operation', input: { plotId: A, harvestYear: 2027, kind: 'sowing', status: 'done' } },
        { id: 'outbox:7', name: 'record_sale', input: { cropId: 'grau' } },
      ],
      SEG,
    );
    expect(out).toEqual(base);
  });
});
