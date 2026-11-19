/* The farm's contracts (migration 048, docs/contracts-plan.md step 4), on the real Supabase: the API saves a party,
   a contract and its schedule once per client id; owner and manager write, the accountant only reads, a worker sees
   nothing; no contract or schedule crosses farms; decisions fit the kind; nothing is deleted past the API.
   Run with `npm run test:integration` after `npm run db:migrate`. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApp } from '../../apps/api/src/app';
import { supabaseFactory } from '../../apps/api/src/db/supabase';
import { supabaseRepo } from '../../apps/api/src/db/repo';
import { supabaseContracts } from '../../apps/api/src/db/contracts';
import { loadData } from '../../packages/shared/src';
import { supabaseTokenVerifier } from '../../apps/api/src/middleware/auth';

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const stamp = Date.now();
const password = `Test-${stamp}-pw`;

interface TestUser {
  id: string;
  token: string;
  client: SupabaseClient;
}
async function makeUser(tag: string): Promise<TestUser> {
  const email = `contracts-${tag}-${stamp}@cropcash.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, token: s.session!.access_token, client };
}

const db = () => supabaseFactory(url, anonKey, serviceKey);
const app = () =>
  createApp({ corsOrigins: [], verifyToken: supabaseTokenVerifier(url), repo: supabaseRepo(db()), contracts: supabaseContracts(db()), data: loadData(), getRates: async () => null });
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

let owner: TestUser, manager: TestUser, accountant: TestUser, worker: TestUser, other: TestUser;
let farmId: string, otherFarm: string, leaseId: string;

const sale = (partyId: string) => ({
  partyId,
  kind: 'sale',
  title: 'Grâu 2027',
  startsOn: '2027-03-01',
  endsOn: '2027-08-31',
  cropId: 'grau',
  quantityKg: 200_000,
  payments: [
    { direction: 'in', label: 'Avans', firstOn: '2027-03-01', amountLei: 42_000 },
    { direction: 'in', label: 'Livrarea', firstOn: '2027-07-20', amountLei: 168_000, kg: 200_000, cropId: 'grau' },
  ],
});

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [owner, manager, accountant, worker, other] = await Promise.all(['owner', 'manager', 'accountant', 'worker', 'other'].map(makeUser));
  const mine = await owner.client.from('farmers').insert({ user_id: owner.id, name: 'Ferma Contracte', birth_year: 1968, county: 'TR' }).select('id').single();
  if (mine.error) throw mine.error;
  farmId = mine.data.id;
  const theirs = await other.client.from('farmers').insert({ user_id: other.id, name: 'Altă fermă', birth_year: 1970, county: 'OT' }).select('id').single();
  if (theirs.error) throw theirs.error;
  otherFarm = theirs.data.id;
  const joined = await admin.from('farm_members').insert([
    { farmer_id: farmId, user_id: manager.id, role: 'manager', invited_by: owner.id },
    { farmer_id: farmId, user_id: accountant.id, role: 'accountant', invited_by: owner.id },
    { farmer_id: farmId, user_id: worker.id, role: 'worker', invited_by: owner.id },
  ]);
  if (joined.error) throw joined.error;
  const maria = await admin.from('landowners').insert({ farmer_id: farmId, name: 'Maria' }).select('id').single();
  if (maria.error) throw maria.error;
  const lease = await admin
    .from('lease_contracts')
    .insert({ farmer_id: farmId, landowner_id: maria.data.id, direction: 'taken', area_ari: 250, starts_on: '2021-10-01', ends_on: '2026-09-30', rent_kg_per_ha: 800, rent_crop_id: 'grau' })
    .select('id')
    .single();
  if (lease.error) throw lease.error;
  leaseId = lease.data.id;
});

afterAll(async () => {
  await admin.from('farmers').delete().in('id', [farmId, otherFarm].filter(Boolean));
  await Promise.all([owner, manager, accountant, worker, other].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe('saving through the API', () => {
  let partyId: string, contractId: string;
  const clientId = crypto.randomUUID();

  it('the owner adds a party and a sale with its schedule; sent again, the same contract, no doubled schedule', async () => {
    const party = await request(app()).post('/api/parties').set(as(owner)).send({ name: 'Cargill', kind: 'company', cui: 'RO12345678' });
    expect(party.status).toBe(201);
    partyId = party.body.id;
    const first = await request(app()).post('/api/contracts').set(as(owner)).send({ ...sale(partyId), clientId });
    expect(first.status).toBe(201);
    contractId = first.body.id;
    const again = await request(app()).post('/api/contracts').set(as(owner)).send({ ...sale(partyId), clientId });
    expect([again.status, again.body.id]).toEqual([201, contractId]);
    const { data } = await admin.from('contract_payments').select('position, label, amount_bani, kg').eq('contract_id', contractId).order('position');
    expect(data).toEqual([
      { position: 0, label: 'Avans', amount_bani: 4_200_000, kg: null },
      { position: 1, label: 'Livrarea', amount_bani: 16_800_000, kg: 200_000 },
    ]);
  });

  it('the farm comes back with them, the schedule in order', async () => {
    const farm = await supabaseRepo(db()).getMyFarm(owner.token);
    expect(farm?.parties).toEqual([expect.objectContaining({ id: partyId, name: 'Cargill', cui: 'RO12345678' })]);
    expect(farm?.contracts).toEqual([expect.objectContaining({ id: contractId, kind: 'sale', quantity_kg: 200_000, decision: null })]);
    expect(farm?.contract_payments?.map((p) => p.label)).toEqual(['Avans', 'Livrarea']);
    expect(farm?.lease_contracts?.[0]).toMatchObject({ id: leaseId, decision: null, decided_on: null });
  });

  it('the manager changes it; the schedule is replaced as a whole', async () => {
    const res = await request(app()).put(`/api/contracts/${contractId}`).set(as(manager)).send({ ...sale(partyId), payments: [sale(partyId).payments[1]] });
    expect(res.status).toBe(204);
    expect((await admin.from('contract_payments').select('label').eq('contract_id', contractId)).data).toEqual([{ label: 'Livrarea' }]);
  });

  it('decisions fit the kind: an arendă refused, a sale never bought out; null takes it back', async () => {
    expect((await request(app()).post(`/api/contracts/${leaseId}/decide`).set(as(owner)).send({ source: 'arenda', decision: 'end', decidedOn: '2026-11-18' })).status).toBe(204);
    expect((await admin.from('lease_contracts').select('decision, decided_on').eq('id', leaseId).single()).data).toEqual({ decision: 'end', decided_on: '2026-11-18' });
    const wrong = await request(app()).post(`/api/contracts/${contractId}/decide`).set(as(owner)).send({ source: 'contract', decision: 'buy_out', decidedOn: '2026-11-18' });
    expect([wrong.status, wrong.body]).toEqual([400, { error: 'decision_not_for_kind' }]);
    expect((await request(app()).post(`/api/contracts/${leaseId}/decide`).set(as(owner)).send({ source: 'arenda', decision: null, decidedOn: '2026-11-18' })).status).toBe(204);
    expect((await admin.from('lease_contracts').select('decision, decided_on').eq('id', leaseId).single()).data).toEqual({ decision: null, decided_on: null });
  });

  it('another farm can’t use this farm’s party, nor see or change its contract', async () => {
    const res = await request(app()).post('/api/contracts').set(as(other)).send(sale(partyId));
    expect([res.status, res.body]).toEqual([404, { error: 'unknown_party' }]);
    expect((await request(app()).put(`/api/contracts/${contractId}`).set(as(other)).send(sale(partyId))).status).toBe(404);
    expect((await request(app()).post(`/api/contracts/${contractId}/decide`).set(as(other)).send({ source: 'contract', decision: 'end', decidedOn: '2026-11-18' })).status).toBe(404);
    // Past the API: a schedule row on this farm's contract, under the other farm.
    const direct = await other.client.from('contract_payments').insert({ farmer_id: otherFarm, contract_id: contractId, direction: 'in', first_on: '2027-01-01', amount_bani: 100 });
    expect(direct.error).not.toBeNull();
    expect((await other.client.from('contracts').select('id').eq('id', contractId)).data).toEqual([]);
  });

  it('a sale recorded under the contract keeps it; a payment can be linked after, never to another farm’s contract', async () => {
    const sale = await request(app()).post('/api/sales').set(as(owner)).send({ cropId: 'grau', date: '2026-11-10', totalLei: 1000, contractId });
    expect(sale.status).toBe(201);
    expect((await admin.from('transactions').select('contract_id').eq('id', sale.body.id).single()).data).toEqual({ contract_id: contractId });
    // The column the API sets on an expense after record_expense (the same grant).
    const plain = await request(app()).post('/api/sales').set(as(owner)).send({ cropId: 'grau', date: '2026-11-11', totalLei: 500 });
    const linked = await owner.client.from('transactions').update({ contract_id: contractId }).eq('id', plain.body.id).select('contract_id');
    expect([linked.error, linked.data]).toEqual([null, [{ contract_id: contractId }]]);
    // Only that column: the amount stays as recorded.
    expect((await owner.client.from('transactions').update({ amount_bani: 1 }).eq('id', plain.body.id)).error?.code).toBe('42501');
    // Another farm's contract on this farm's payment: the (contract_id, farmer_id) key refuses it.
    const theirParty = await other.client.from('parties').insert({ farmer_id: otherFarm, name: 'Y', kind: 'person' }).select('id').single();
    const theirs = await other.client.from('contracts').insert({ farmer_id: otherFarm, party_id: theirParty.data!.id, kind: 'service', starts_on: '2027-01-01' }).select('id').single();
    expect((await owner.client.from('transactions').update({ contract_id: theirs.data!.id }).eq('id', plain.body.id)).error?.code).toBe('23503');
    expect((await request(app()).post('/api/sales').set(as(owner)).send({ cropId: 'grau', date: '2026-11-10', totalLei: 1000, contractId: theirs.data!.id })).body).toEqual({ error: 'unknown_contract' });
  });

  it('archiving the party archives its contracts', async () => {
    expect((await request(app()).post(`/api/parties/${partyId}/archive`).set(as(owner))).status).toBe(204);
    expect((await admin.from('contracts').select('archived_at').eq('id', contractId).single()).data?.archived_at).not.toBeNull();
  });
});

describe('who reaches the contracts', () => {
  it('the accountant reads them and writes nothing', async () => {
    expect((await accountant.client.from('contracts').select('id').eq('farmer_id', farmId)).data).toHaveLength(1);
    expect((await accountant.client.from('contract_payments').select('id').eq('farmer_id', farmId)).data).toHaveLength(1);
    expect((await accountant.client.from('parties').select('id').eq('farmer_id', farmId)).data).toHaveLength(1);
    const added = await accountant.client.from('parties').insert({ farmer_id: farmId, name: 'X', kind: 'person' });
    expect(added.error?.code).toBe('42501');
    const changed = await accountant.client.from('contracts').update({ title: 'altceva' }).eq('farmer_id', farmId).select('id');
    expect(changed.data ?? []).toEqual([]);
  });

  it('a worker sees none of it and writes nothing', async () => {
    for (const t of ['parties', 'contracts', 'contract_payments']) expect((await worker.client.from(t).select('id').eq('farmer_id', farmId)).data ?? [], t).toEqual([]);
    expect((await worker.client.from('parties').insert({ farmer_id: farmId, name: 'X', kind: 'person' })).error?.code).toBe('42501');
  });

  it('nobody deletes a party or a contract past the API', async () => {
    for (const t of ['parties', 'contracts']) {
      const { error } = await owner.client.from(t).delete().eq('farmer_id', farmId);
      expect(error?.code, t).toBe('42501');
    }
  });

  it('the database keeps the schemas’ rules: a person has no CUI, a sale names its crop', async () => {
    expect((await owner.client.from('parties').insert({ farmer_id: farmId, name: 'Vasile', kind: 'person', cui: '12345678' })).error?.code).toBe('23514');
    const party = await owner.client.from('parties').insert({ farmer_id: farmId, name: 'Siloz', kind: 'company' }).select('id').single();
    expect((await owner.client.from('contracts').insert({ farmer_id: farmId, party_id: party.data!.id, kind: 'sale', starts_on: '2027-01-01' })).error?.code).toBe('23514');
  });
});

describe('across farms: GET /api/farms/contracts-summary (step 7)', () => {
  beforeAll(async () => {
    // The owner also manages the other farm, which gives 1 ha in arendă.
    const joined = await admin.from('farm_members').insert({ farmer_id: otherFarm, user_id: owner.id, role: 'manager', invited_by: other.id });
    if (joined.error) throw joined.error;
    const ilie = await admin.from('landowners').insert({ farmer_id: otherFarm, name: 'Ilie' }).select('id').single();
    if (ilie.error) throw ilie.error;
    const given = await admin
      .from('lease_contracts')
      .insert({ farmer_id: otherFarm, landowner_id: ilie.data.id, direction: 'given', area_ari: 100, starts_on: '2024-10-01', ends_on: '2030-09-30', rent_bani_per_ha: 100_000, pay_month: 10 });
    if (given.error) throw given.error;
  });

  type Farm = { farmId: string; role: string; arenda: boolean; count: number; inBani: number; outBani: number; takenAri: number; givenAri: number; landowners: number };
  const summary = async (u: TestUser) => {
    const res = await request(app()).get('/api/farms/contracts-summary').set(as(u));
    expect(res.status).toBe(200);
    return res.body as { farms: Farm[]; total: Omit<Farm, 'farmId' | 'role' | 'arenda'> & { due: number }; missing: string[] };
  };

  it('owner of one farm and manager of the other: both, and the total is their sum', async () => {
    const s = await summary(owner);
    expect(s.missing).toEqual([]);
    expect(s.farms.map((f) => [f.farmId, f.role, f.arenda])).toEqual([
      [farmId, 'owner', true],
      [otherFarm, 'manager', true],
    ]);
    const sum = (k: 'count' | 'inBani' | 'outBani' | 'takenAri' | 'givenAri' | 'landowners') => s.farms.reduce((a, f) => a + f[k], 0);
    expect(s.total).toMatchObject({ count: sum('count'), inBani: sum('inBani'), outBani: sum('outBani'), takenAri: sum('takenAri'), givenAri: 100, landowners: sum('landowners') });
    expect(s.farms[1]).toMatchObject({ givenAri: 100, landowners: 1 });
    expect(s.farms[1]!.inBani).toBeGreaterThan(0);
  });

  it('a worker on one of them sees nothing of it', async () => {
    const s = await summary(worker);
    expect(s.farms).toEqual([]);
    expect(s.total).toMatchObject({ count: 0, inBani: 0, outBani: 0, takenAri: 0, givenAri: 0, landowners: 0, due: 0 });
  });

  it('the accountant: the contracts, not the arendă', async () => {
    const s = await summary(accountant);
    expect(s.farms).toEqual([expect.objectContaining({ farmId, role: 'accountant', arenda: false, takenAri: 0, landowners: 0 })]);
  });

  it('the other farm’s owner sees only their own farm', async () => {
    expect((await summary(other)).farms.map((f) => f.farmId)).toEqual([otherFarm]);
  });
});
