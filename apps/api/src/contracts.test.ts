import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { loadData } from '@cropcash/shared';
import { createApp } from './app';
import { FARM_SELECT, type FarmRow, type Repo } from './db/repo';
import { ContractError, farmContractFromRow, paymentsFromRows, type ContractStore } from './db/contracts';

const data = loadData();
const verifyToken = async (token: string) => ({ userId: `u-${token}`, email: `${token}@example.com` });
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const CARGILL = '6f1c1d6a-1f0b-4f7e-9a51-2a3c4b5d6e7f';
const CONTRACT = '1a2b3c4d-1f0b-4f7e-9a51-2a3c4b5d6e7f';
const LEASE = '2b3c4d5e-1f0b-4f7e-9a51-2a3c4b5d6e7f';
const CLIENT = '0b7c8d9e-1f2a-4b3c-8d4e-5f6a7b8c9d0e';

const farm: FarmRow = { id: 'farm-1', name: 'Ana', county: 'TR', birth_year: 1970, start_balance_bani: 0, parcels: [{ crop_id: 'grau', area_ari: 15_000, is_arable: true }] };

function setup(store: Partial<ContractStore> = {}) {
  const contracts: ContractStore = {
    addParty: vi.fn(async () => CARGILL),
    updateParty: vi.fn(async (_t: string, id: string) => id === CARGILL),
    archiveParty: vi.fn(async (_t: string, id: string) => id === CARGILL),
    addContract: vi.fn(async () => CONTRACT),
    updateContract: vi.fn(async (_t: string, id: string) => id === CONTRACT),
    archiveContract: vi.fn(async (_t: string, id: string) => id === CONTRACT),
    decide: vi.fn(async (_t: string, _s: string, id: string) => id === CONTRACT || id === LEASE),
    setTaxProfile: vi.fn(async () => undefined),
    ...store,
  };
  const repo = { getMyFarm: vi.fn(async (token: string) => (token === 'ana' ? farm : null)) } as unknown as Repo;
  const app = createApp({ corsOrigins: [], verifyToken, repo, data, getRates: async () => null, contracts, now: () => new Date('2026-11-18T10:00:00Z') });
  return { app, contracts };
}

const sale = {
  partyId: CARGILL,
  kind: 'sale',
  title: 'Grâu 2027 la Cargill',
  signedOn: '2027-03-01',
  startsOn: '2027-03-01',
  endsOn: '2027-08-31',
  cropId: 'grau',
  quantityKg: 200_000,
  payments: [
    { direction: 'in', label: 'Avans', firstOn: '2027-03-01', amountLei: 42_000 },
    { direction: 'in', label: 'Livrarea', firstOn: '2027-07-20', amountLei: 168_000.5, kg: 200_000, cropId: 'grau' },
  ],
};

describe('contracts API (migration 048)', () => {
  it('needs a session', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/parties').send({ name: 'Cargill', kind: 'company' })).status).toBe(401);
    expect((await request(app).post('/api/contracts').send(sale)).status).toBe(401);
  });

  it('adds a party with the phone’s id; a person has no CUI, and no CNP is taken', async () => {
    const { app, contracts } = setup();
    const res = await request(app).post('/api/parties').set(as('ana')).send({ name: 'Cargill', kind: 'company', cui: 'ro 12345678', clientId: CLIENT });
    expect([res.status, res.body]).toEqual([201, { id: CARGILL }]);
    expect(contracts.addParty).toHaveBeenCalledWith('ana', 'farm-1', { name: 'Cargill', kind: 'company', cui: 'RO12345678', locality: null, phone: null, note: null }, CLIENT);
    expect((await request(app).post('/api/parties').set(as('ana')).send({ name: 'Vasile', kind: 'person', cui: '12345678' })).status).toBe(400);
    expect((await request(app).post('/api/parties').set(as('ana')).send({ name: 'Vasile', kind: 'person', cnp: '1600101123456' })).status).toBe(400);
  });

  it('adds a contract in bani and kg, with its schedule, the kind’s defaults filled in', async () => {
    const { app, contracts } = setup();
    const res = await request(app).post('/api/contracts').set(as('ana')).send({ ...sale, clientId: CLIENT });
    expect([res.status, res.body]).toEqual([201, { id: CONTRACT }]);
    expect(contracts.addContract).toHaveBeenCalledWith(
      'ana',
      'farm-1',
      expect.objectContaining({ party_id: CARGILL, kind: 'sale', crop_id: 'grau', quantity_kg: 200_000, auto_renews: false, notice_days: null, residual_bani: null }),
      [
        { direction: 'in', label: 'Avans', first_on: '2027-03-01', repeat: 'none', times: null, amount_bani: 4_200_000, per_ha: false, kg: null, crop_id: null },
        { direction: 'in', label: 'Livrarea', first_on: '2027-07-20', repeat: 'none', times: null, amount_bani: 16_800_050, per_ha: false, kg: 200_000, crop_id: 'grau' },
      ],
      CLIENT,
    );
  });

  it('insurance takes its 20-day notice from the data; a leasing keeps its residual value', async () => {
    const { app, contracts } = setup();
    await request(app).post('/api/contracts').set(as('ana')).send({ partyId: CARGILL, kind: 'insurance', startsOn: '2027-01-01', endsOn: '2027-12-31' });
    expect(contracts.addContract).toHaveBeenLastCalledWith('ana', 'farm-1', expect.objectContaining({ notice_days: 20, auto_renews: false }), [], undefined);
    const leasing = { partyId: CARGILL, kind: 'leasing', startsOn: '2027-01-15', endsOn: '2030-12-15', residualLei: 25_000, payments: [{ direction: 'out', firstOn: '2027-01-15', repeat: 'monthly', times: 48, amountLei: 3_500 }] };
    expect((await request(app).post('/api/contracts').set(as('ana')).send(leasing)).status).toBe(201);
    expect(contracts.addContract).toHaveBeenLastCalledWith('ana', 'farm-1', expect.objectContaining({ residual_bani: 2_500_000 }), [expect.objectContaining({ repeat: 'monthly', times: 48, amount_bani: 350_000 })], undefined);
  });

  it('refuses what the schemas refuse: a sale with no crop, a paid comodat, a residual off a leasing', async () => {
    const { app } = setup();
    const { cropId: _c, quantityKg: _q, ...noCrop } = sale;
    for (const body of [
      { ...noCrop, payments: [] },
      { partyId: CARGILL, kind: 'comodat', startsOn: '2027-01-01', payments: [{ direction: 'out', firstOn: '2027-01-01', amountLei: 10 }] },
      { partyId: CARGILL, kind: 'service', startsOn: '2027-01-01', residualLei: 10 },
    ])
      expect((await request(app).post('/api/contracts').set(as('ana')).send(body)).status).toBe(400);
  });

  it('says when the party or a parcel isn’t this farm’s', async () => {
    const { app } = setup({ addContract: vi.fn(async () => Promise.reject(new ContractError(404, 'unknown_party', 'x'))) });
    const res = await request(app).post('/api/contracts').set(as('ana')).send(sale);
    expect([res.status, res.body]).toEqual([404, { error: 'unknown_party' }]);
  });

  it('changes and archives parties and contracts; another farm’s are not found', async () => {
    const { app, contracts } = setup();
    expect((await request(app).put(`/api/parties/${CARGILL}`).set(as('ana')).send({ name: 'Cargill Agricultura', kind: 'company' })).status).toBe(204);
    expect((await request(app).put(`/api/contracts/${CONTRACT}`).set(as('ana')).send(sale)).status).toBe(204);
    expect(contracts.updateContract).toHaveBeenCalledWith('ana', CONTRACT, expect.objectContaining({ title: 'Grâu 2027 la Cargill' }), expect.any(Array));
    expect((await request(app).post(`/api/contracts/${CONTRACT}/archive`).set(as('ana'))).status).toBe(204);
    expect((await request(app).post(`/api/parties/${CARGILL}/archive`).set(as('ana'))).status).toBe(204);
    expect((await request(app).put(`/api/contracts/${LEASE}`).set(as('ana')).send(sale)).status).toBe(404);
  });

  it('a user with no farm gets no_farm', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/parties').set(as('bob')).send({ name: 'Cargill', kind: 'company' });
    expect([res.status, res.body]).toEqual([404, { error: 'no_farm' }]);
  });

  it('records a decision on a contract or an arendă, and takes it back', async () => {
    const { app, contracts } = setup();
    expect((await request(app).post(`/api/contracts/${LEASE}/decide`).set(as('ana')).send({ source: 'arenda', decision: 'end', decidedOn: '2026-11-18' })).status).toBe(204);
    expect(contracts.decide).toHaveBeenCalledWith('ana', 'arenda', LEASE, 'end', '2026-11-18');
    expect((await request(app).post(`/api/contracts/${CONTRACT}/decide`).set(as('ana')).send({ source: 'contract', decision: null, decidedOn: '2026-11-18' })).status).toBe(204);
    expect((await request(app).post(`/api/contracts/${CONTRACT}/decide`).set(as('ana')).send({ source: 'contract', decision: 'sell' })).status).toBe(400);
  });

  it('a decision that doesn’t fit the kind is refused', async () => {
    const { app } = setup({ decide: vi.fn(async () => Promise.reject(new ContractError(400, 'decision_not_for_kind', 'x'))) });
    const res = await request(app).post(`/api/contracts/${CONTRACT}/decide`).set(as('ana')).send({ source: 'arenda', decision: 'buy_out', decidedOn: '2026-11-18' });
    expect([res.status, res.body]).toEqual([400, { error: 'decision_not_for_kind' }]);
  });
});

describe('reading them with the farm', () => {
  it('the farm select brings parties, contracts and schedules', () => {
    expect(FARM_SELECT).toMatch(/parties \(id, name, kind, cui/);
    expect(FARM_SELECT).toMatch(/contracts \(id, party_id, kind/);
    expect(FARM_SELECT).toMatch(/contract_payments \(id, contract_id, position/);
  });

  it('bigints become numbers; a schedule comes back in the order it was typed, without its position', () => {
    expect(farmContractFromRow({ id: 'c', quantity_kg: '200000', residual_bani: null }).quantity_kg).toBe(200_000);
    const rows = paymentsFromRows([
      { id: 'b', contract_id: 'c', position: 1, amount_bani: '16800050', kg: '200000' },
      { id: 'a', contract_id: 'c', position: 0, amount_bani: 4_200_000, kg: null },
    ]);
    expect(rows).toEqual([
      { id: 'a', contract_id: 'c', amount_bani: 4_200_000, kg: null },
      { id: 'b', contract_id: 'c', amount_bani: 16_800_050, kg: 200_000 },
    ]);
  });
});

describe('a sale or expense recorded under a contract', () => {
  function recordsSetup() {
    const withContracts: FarmRow = { ...farm, contracts: [{ id: CONTRACT, kind: 'leasing', archived_at: null } as never] };
    const repo = {
      getMyFarm: vi.fn(async () => withContracts),
      addSale: vi.fn(async () => 'tx-1'),
      addExpense: vi.fn(async () => 'tx-2'),
    } as unknown as Repo;
    return { app: createApp({ corsOrigins: [], verifyToken, repo, data, getRates: async () => null, now: () => new Date('2026-11-18T10:00:00Z') }), repo };
  }

  it('passes the farm’s contract on, and refuses one that isn’t the farm’s before saving anything', async () => {
    const { app, repo } = recordsSetup();
    const sale = await request(app).post('/api/sales').set(as('ana')).send({ cropId: 'grau', date: '2026-11-10', totalLei: 1000, contractId: CONTRACT });
    expect(sale.status).toBe(201);
    expect(repo.addSale).toHaveBeenCalledWith('ana', 'farm-1', expect.objectContaining({ contractId: CONTRACT }));
    const expense = await request(app).post('/api/expenses').set(as('ana')).send({ category: 'other', amountLei: 3500, date: '2026-11-10', contractId: CONTRACT });
    expect(expense.status).toBe(201);
    expect(repo.addExpense).toHaveBeenCalledWith('ana', expect.objectContaining({ contractId: CONTRACT }));
    const stranger = await request(app).post('/api/expenses').set(as('ana')).send({ category: 'other', amountLei: 3500, date: '2026-11-10', contractId: LEASE });
    expect([stranger.status, stranger.body]).toEqual([404, { error: 'unknown_contract' }]);
    expect(repo.addExpense).toHaveBeenCalledTimes(1);
  });
});
