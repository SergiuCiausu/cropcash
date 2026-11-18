import { describe, expect, it } from 'vitest';
import params from '../../../../docs/data/plots-params.json';
import { plot, season } from './fixtures';
import { matchSeasonRows } from './match';
import { PlotsParamsSchema, type Polygon } from './model';
import { absorbPlaced, cropTotals, syncUnplaced, type PlotsState } from './totals';

const MIN_OVERLAP = PlotsParamsSchema.parse(params).match_overlap_min.value;
const newId = (c: string) => `auto-${c}`;

/* The same scenario as the SQL smoke test of 020_plots.sql, so the two stay alike. */
describe('crop totals and the parcels agree', () => {
  const empty: PlotsState = { plots: [], seasons: [] };
  const start = syncUnplaced(empty, 2027, { grau: 800, porumb: 700 }, 'TR', newId).state;

  it('a new farm gets one unplaced parcel per crop', () => {
    expect(start.plots.map((p) => p.auto_crop_id)).toEqual(['grau', 'porumb']);
    expect(cropTotals(start.seasons, 2027)).toEqual({ grau: 800, porumb: 700 });
  });

  const withWheat = (ari: number): PlotsState => ({
    plots: [...start.plots, plot('w')],
    seasons: [...start.seasons, season('w', 'grau', ari)],
  });

  it('placing land takes it from the unplaced hectares first', () => {
    const s = absorbPlaced(start, withWheat(500), 2027);
    expect(cropTotals(s.seasons, 2027)).toEqual({ grau: 800, porumb: 700 });
    const s2 = absorbPlaced(s, { ...s, seasons: s.seasons.map((x) => (x.plot_id === 'w' ? { ...x, area_ari: 900 } : x)) }, 2027);
    expect(cropTotals(s2.seasons, 2027)).toEqual({ grau: 900, porumb: 700 });
    expect(s2.plots.some((p) => p.auto_crop_id === 'grau')).toBe(false);
  });

  it('editing the totals moves only the unplaced hectares, and never below the map', () => {
    const s = absorbPlaced(start, withWheat(500), 2027);
    expect(syncUnplaced(s, 2027, { grau: 400, porumb: 700 }, 'TR', newId).issues).toEqual([{ kind: 'below_mapped', cropId: 'grau' }]);
    expect(syncUnplaced(s, 2027, { porumb: 700 }, 'TR', newId).issues).toEqual([{ kind: 'removed_but_mapped', cropId: 'grau' }]);
    const grown = syncUnplaced(s, 2027, { grau: 1000, porumb: 600 }, 'TR', newId).state;
    expect(cropTotals(grown.seasons, 2027)).toEqual({ grau: 1000, porumb: 600 });
    expect(grown.seasons.find((x) => x.plot_id === 'auto-grau')?.area_ari).toBe(500);
  });

  it('other years are left alone', () => {
    const s: PlotsState = { plots: [...start.plots, plot('w')], seasons: [...start.seasons, season('w', 'porumb', 900, { harvest_year: 2026 })] };
    expect(cropTotals(syncUnplaced(s, 2027, { grau: 800, porumb: 700 }, 'TR', newId).state.seasons, 2027)).toEqual({ grau: 800, porumb: 700 });
  });
});

describe("matching a new cerere to last year's parcels", () => {
  const sq = (x: number): Polygon => ({
    type: 'Polygon',
    coordinates: [[[x, 44], [x + 0.01, 44], [x + 0.01, 44.01], [x, 44.01], [x, 44]]],
  });
  const plots = [
    plot('a', { bloc_fizic: '286', parcel_no: '1a', geometry: sq(25) }),
    plot('b', { bloc_fizic: '293', parcel_no: '2b', geometry: sq(26) }),
    plot('u', { auto_crop_id: 'grau', bloc_fizic: null, parcel_no: null }),
    plot('old', { bloc_fizic: '300', parcel_no: '1', archived_at: '2025-01-01' }),
  ];

  it('numbers first, then shapes, then new', () => {
    const m = matchSeasonRows(
      [
        { siruta: 153277, blocFizic: ' 286 ', parcelNo: '1A' },
        { siruta: 153277, blocFizic: '999', parcelNo: '1', geometry: sq(26.002) },
        { siruta: 153277, blocFizic: '300', parcelNo: '1' },
        { siruta: null, blocFizic: null, parcelNo: null, geometry: sq(25) },
      ],
      plots,
      MIN_OVERLAP,
    );
    expect(m[0]).toEqual({ kind: 'same', plotId: 'a' });
    expect(m[1]).toMatchObject({ kind: 'ask', plotId: 'b' });
    expect(m[2]).toEqual({ kind: 'new' });
    // 'a' is already taken by the first row.
    expect(m[3]).toEqual({ kind: 'new' });
  });
});
