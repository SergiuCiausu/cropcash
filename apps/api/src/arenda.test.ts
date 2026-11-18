import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { findFunction, loadData, type WriteFunction } from '@cropcash/shared';
import { createApp } from './app';
import { FARM_SELECT, type FarmRow, type Repo } from './db/repo';
import { ArendaError, contractFromRow, type ArendaStore } from './db/arenda';

const data = loadData();
const verifyToken = async (token: string) => ({ userId: `u-${token}`, email: `${token}@example.com` });
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const MARIA = '6f1c1d6a-1f0b-4f7e-9a51-2a3c4b5d6e7f';
const CONTRACT = '1a2b3c4d-1f0b-4f7e-9a51-2a3c4b5d6e7f';
const PLOT = '9e8d7c6b-1f0b-4f7e-9a51-2a3c4b5d6e7f';
const CLIENT = '0b7c8d9e-1f2a-4b3c-8d4e-5f6a7b8c9d0e';

const farm: FarmRow = { id: 'farm-1', name: 'Ana', county: 'TR', birth_year: 1970, start_balance_bani: 0, parcels: [{ crop_id: 'grau', area_ari: 15_000, is_arable: true }] };

function setup(store: Partial<ArendaStore> = {}) {
  const arenda: ArendaStore = {
    addLandowner: vi.fn(async () => MARIA),
    updateLandowner: vi.fn(async (_t: string, id: string) => id === MARIA),
    archiveLandowner: vi.fn(async (_t: string, id: string) => id === MARIA),
    addContract: vi.fn(async () => CONTRACT),
    updateContract: vi.fn(async (_t: string, id: string) => id === CONTRACT),
    archiveContract: vi.fn(async (_t: string, id: string) => id === CONTRACT),
    setPlotTenure: vi.fn(async (_t: string, id: string) => id === PLOT),
    setLandownerCount: vi.fn(async () => {}),
    ...store,
  };
  const repo = { getMyFarm: vi.fn(async (token: string) => (token === 'ana' ? farm : null)) } as unknown as Repo;
  const app = createApp({ corsOrigins: [], verifyToken, repo, data, getRates: async () => null, arenda, now: () => new Date('2026-11-15T10:00:00Z') });
  return { app, arenda };
}

/** The request the phone's registry builds, sent as the phone sends it. */
function send(app: ReturnType<typeof setup>['app'], name: string, input: unknown, token = 'ana') {
  const { method, path, body } = (findFunction(name) as WriteFunction).request(input as never);
  const r = request(app)[method.toLowerCase() as 'put' | 'post'](path).set(as(token));
  return body === undefined ? r : r.send(body as object);
}

const contract = { landownerId: MARIA, direction: 'taken', areaHa: 2.5, startsOn: '2024-10-01', endsOn: '2029-09-30', rentKgPerHa: 800, rentCropId: 'grau', payMonth: 9 };

describe('arendă API (migration 033)', () => {
  it('needs a session', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/landowners').send({ name: 'Maria' })).status).toBe(401);
  });

  it('adds a landowner with the phone’s id, and refuses a CNP', async () => {
    const { app, arenda } = setup();
    const res = await send(app, 'add_landowner', { name: 'Maria Popescu', locality: 'Peretu', payment: 'in_kind', clientId: CLIENT });
    expect([res.status, res.body]).toEqual([201, { id: MARIA }]);
    expect(arenda.addLandowner).toHaveBeenCalledWith('ana', 'farm-1', { name: 'Maria Popescu', locality: 'Peretu', phone: null, payment: 'in_kind', note: null }, CLIENT);
    expect((await request(app).post('/api/landowners').set(as('ana')).send({ name: 'Maria', cnp: '2600101123456' })).status).toBe(400);
  });

  it('adds a contract in ari and bani, and refuses one without rent', async () => {
    const { app, arenda } = setup();
    const res = await send(app, 'add_lease_contract', { ...contract, rentLeiPerHa: 300, plotIds: [PLOT] });
    expect(res.status).toBe(201);
    expect(arenda.addContract).toHaveBeenCalledWith(
      'ana',
      'farm-1',
      expect.objectContaining({ landowner_id: MARIA, area_ari: 250, rent_bani_per_ha: 30_000, rent_kg_per_ha: 800, rent_crop_id: 'grau', plot_ids: [PLOT], ends_on: '2029-09-30' }),
      undefined,
    );
    const { rentKgPerHa: _kg, rentCropId: _crop, ...noRent } = contract;
    expect((await request(app).post('/api/lease-contracts').set(as('ana')).send(noRent)).status).toBe(400);
  });

  it('says when the landowner or a parcel isn’t this farm’s', async () => {
    const { app } = setup({ addContract: vi.fn(async () => Promise.reject(new ArendaError(404, 'unknown_parcel', 'x'))) });
    const res = await send(app, 'add_lease_contract', { ...contract, plotIds: [PLOT] });
    expect([res.status, res.body]).toEqual([404, { error: 'unknown_parcel' }]);
  });

  it('changes and archives landowners and contracts; another farm’s are not found', async () => {
    const { app, arenda } = setup();
    expect((await send(app, 'update_landowner', { id: MARIA, name: 'Maria P.' })).status).toBe(204);
    expect((await send(app, 'archive_landowner', { id: CLIENT })).status).toBe(404);
    expect((await send(app, 'update_lease_contract', { ...contract, id: CONTRACT })).status).toBe(204);
    expect((await send(app, 'archive_lease_contract', { id: CONTRACT })).status).toBe(204);
    expect(arenda.archiveContract).toHaveBeenCalledWith('ana', CONTRACT, new Date('2026-11-15T10:00:00Z'));
  });

  it('sets a parcel’s tenure and the landowner count', async () => {
    const { app, arenda } = setup();
    expect((await send(app, 'set_plot_tenure', { plotId: PLOT, tenure: 'leased_in' })).status).toBe(204);
    expect(arenda.setPlotTenure).toHaveBeenCalledWith('ana', PLOT, 'leased_in');
    expect((await request(app).put(`/api/plots/${PLOT}/tenure`).set(as('ana')).send({ tenure: 'rented' })).status).toBe(400);
    expect((await send(app, 'set_landowner_count', { count: 80 })).status).toBe(204);
    expect(arenda.setLandownerCount).toHaveBeenCalledWith('ana', 'farm-1', 80);
    expect((await send(app, 'set_landowner_count', { count: 80 }, 'nobody')).status).toBe(404);
  });

  it('reads landowners and contracts with the farm, rent as a number', () => {
    expect(FARM_SELECT).toMatch(/landowners \(id, name, locality/);
    expect(FARM_SELECT).toMatch(/lease_contracts \(id, landowner_id, direction/);
    expect(FARM_SELECT).toMatch(/^id, [^(]*landowner_count/);
    expect(contractFromRow({ id: 'c', rent_bani_per_ha: '30000' }).rent_bani_per_ha).toBe(30_000);
    expect(contractFromRow({ id: 'c', rent_bani_per_ha: null }).rent_bani_per_ha).toBeNull();
  });
});
