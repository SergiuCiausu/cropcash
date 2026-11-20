import { describe, expect, it, vi } from 'vitest';
import type { LpisBloc } from '@cropcash/shared';
import type { LpisSource } from './client';
import { dbLpisSource, localFirst } from './db';

const geometry = { type: 'Polygon' as const, coordinates: [[[25, 44], [25.01, 44], [25.01, 44.01], [25, 44]]] };
const row = {
  fbid: '153277-286', siruta: 153277, bloc: '286', county: 'TR', commune: 'MALDAENI', landUse: 'TA', netAreaAri: 854,
  geometry, uatSiruta: 153277, villageSiruta: 153286, villageMethod: 'only_village', villageDistanceM: 1200,
};

const rpcWith = (answers: Record<string, unknown>) =>
  vi.fn(async (fn: string) => (fn in answers ? { data: answers[fn], error: null } : { data: null, error: { message: `function ${fn} does not exist` } }));

const apia = (): LpisSource & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    bloc: async (s, b) => (calls.push(`bloc ${s}-${b}`), { ...row, uatSiruta: undefined, villageSiruta: undefined, villageMethod: undefined, villageDistanceM: undefined } as LpisBloc),
    at: async () => (calls.push('at'), []),
    communes: async (c) => (calls.push(`communes ${c}`), [{ siruta: 1, name: 'Din APIA' }]),
    communeCentre: async () => (calls.push('centre'), [25, 44]),
    tile: async () => (calls.push('tile'), [row as LpisBloc]),
  };
};

describe('the local copy of the blocs (migration 034)', () => {
  it('answers a bloc with its commune and village', async () => {
    const rpc = rpcWith({ lpis_bloc: row });
    expect(await dbLpisSource({ rpc } as never).bloc(153277, '286')).toEqual(row);
    expect(rpc).toHaveBeenCalledWith('lpis_bloc', { p_siruta: 153277, p_bloc: '286' });
  });

  it('a row that doesn’t parse counts as not there', async () => {
    const src = dbLpisSource({ rpc: rpcWith({ lpis_bloc: { ...row, geometry: { type: 'Point' } }, lpis_blocs_at: [row, { fbid: 'x' }] }) } as never);
    expect(await src.bloc(153277, '286')).toBeNull();
    expect(await src.at([25, 44])).toHaveLength(1);
  });

  it('the copy first; APIA for what it doesn’t hold', async () => {
    const remote = apia();
    const src = localFirst(dbLpisSource({ rpc: rpcWith({ lpis_bloc: null, lpis_blocs_at: [row], siruta_communes: [], siruta_commune_centre: [24.9, 44.1] }) } as never), remote, () => undefined);
    expect((await src.bloc(151870, '314'))?.villageSiruta).toBeUndefined();
    expect(await src.at([24.92, 44.12])).toEqual([row]);
    expect(await src.communes('CT')).toEqual([{ siruta: 1, name: 'Din APIA' }]);
    expect(await src.communeCentre(153277)).toEqual([24.9, 44.1]);
    expect(remote.calls).toEqual(['bloc 151870-314', 'communes CT']);
  });

  it('a square of the map: from the copy when it holds blocs there, else from APIA', async () => {
    const rpc = rpcWith({ lpis_blocs_in: [row] });
    const remote = apia();
    const t = { x: 9327, y: 5932 };
    expect(await localFirst(dbLpisSource({ rpc } as never), remote, () => undefined).tile(t)).toEqual([row]);
    expect(rpc).toHaveBeenCalledWith('lpis_blocs_in', expect.objectContaining({ p_west: expect.any(Number), p_north: expect.any(Number) }));
    expect(remote.calls).toEqual([]);
    // Not imported yet (an empty copy, or migration 050 not applied): APIA answers.
    await localFirst(dbLpisSource({ rpc: rpcWith({ lpis_blocs_in: [] }) } as never), remote, () => undefined).tile(t);
    await localFirst(dbLpisSource({ rpc: rpcWith({}) } as never), remote, () => undefined).tile(t);
    expect(remote.calls).toEqual(['tile', 'tile']);
  });

  it('before the import (no functions yet), APIA answers and the copy is mentioned once', async () => {
    const remote = apia();
    const warn = vi.fn();
    const src = localFirst(dbLpisSource({ rpc: rpcWith({}) } as never), remote, warn);
    await src.bloc(153277, '286');
    await src.at([25, 44]);
    expect(remote.calls).toEqual(['bloc 153277-286', 'at']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/lpis_bloc: function lpis_bloc does not exist/);
  });
});
