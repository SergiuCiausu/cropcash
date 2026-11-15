import { describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { parseBlocs, readPaperPlots, type PrintedPlotRow } from '../../../packages/shared/src/plots/index';
import bloc286 from '../../../packages/shared/src/plots/__fixtures__/lpis-bloc-153277-286.json';
import { ApiError } from '../live/client';
import { locatePaperPlots, searchUats, type RowLocation } from './lpis';

const data = loadData();
const [bloc] = parseBlocs(bloc286);
const row = (over: Partial<PrintedPlotRow>): PrintedPlotRow => ({
  code: null,
  crop_id: 'grau',
  name: 'GRÂU',
  area: '8',
  judet: 'TR',
  localitate: 'MALDAENI',
  siruta: '153277',
  bloc_fizic: '286',
  parcel_no: '1a',
  farmer_code: null,
  land_use: 'TA',
  ...over,
});

/** A fake API: bloc 286 exists, 999 doesn't, 503 is down; UAT 153277 has a middle. */
function fakeApi() {
  return vi.fn(async (path: string) => {
    if (path.includes('bloc=286')) return { bloc };
    if (path.includes('bloc=503')) throw new ApiError(503, 'lpis_unavailable');
    if (path.includes('/api/lpis/bloc')) throw new ApiError(404, 'not_found');
    if (path === '/api/siruta/153277/centre') return { centre: [24.906375, 44.111895] };
    if (path.startsWith('/api/siruta/')) throw new ApiError(404, 'not_found');
    if (path.startsWith('/api/siruta?')) return { communes: [{ siruta: 153277, name: 'Maldaeni' }] };
    throw new Error(`unexpected ${path}`);
  });
}

async function locate(rows: PrintedPlotRow[], over: { online?: boolean; api?: ReturnType<typeof fakeApi> } = {}) {
  const api = over.api ?? fakeApi();
  const plots = readPaperPlots(rows, data);
  const seen: [number, RowLocation][] = [];
  await locatePaperPlots({ api: api as never }, plots, { warnPct: 10, isOnline: () => over.online ?? true, onRow: (r, l) => seen.push([r, l]) });
  const last = Object.fromEntries(seen) as Record<number, RowLocation>;
  return { api, seen, last };
}

describe('finding paper rows on the map', () => {
  it('bloc first, then the UAT middle, then nothing; each row reports looking then its answer', async () => {
    const { seen, last } = await locate([
      row({}),
      row({ bloc_fizic: '999', parcel_no: '2' }),
      row({ siruta: '1', bloc_fizic: '999', parcel_no: '3' }),
      row({ siruta: null, bloc_fizic: null, parcel_no: '4' }),
    ]);
    expect(seen.filter(([r]) => r === 0).map(([, l]) => l.status)).toEqual(['looking', 'found']);
    const fits = [0, 1, 2, 3].map((r) => (last[r]!.status === 'found' ? (last[r] as { placement: { fit: string } }).placement.fit : last[r]!.status));
    expect(fits).toEqual(['whole', 'in_commune', 'none', 'none']);
  });

  it('asks once for rows of the same bloc, and keeps going when APIA fails for one', async () => {
    const { api, last } = await locate([row({}), row({ parcel_no: '1b', area: '2' }), row({ bloc_fizic: '503', parcel_no: '5' })]);
    expect(api.mock.calls.filter(([p]) => p.includes('bloc=286'))).toHaveLength(1);
    expect(last[1]).toMatchObject({ status: 'found', placement: { fit: 'in_bloc' } });
    expect(last[2]).toEqual({ status: 'failed', offline: false });
  });

  it('offline, every row says so and nothing is asked', async () => {
    const { api, last } = await locate([row({}), row({ parcel_no: '2' })], { online: false });
    expect(api).not.toHaveBeenCalled();
    expect(Object.values(last)).toEqual([
      { status: 'failed', offline: true },
      { status: 'failed', offline: true },
    ]);
  });

  it('searches UATs by county', async () => {
    const api = fakeApi();
    expect(await searchUats({ api: api as never }, 'TR', 'măldă')).toEqual([{ siruta: 153277, name: 'Maldaeni' }]);
    expect(api).toHaveBeenCalledWith('/api/siruta?county=TR&q=m%C4%83ld%C4%83');
  });
});
