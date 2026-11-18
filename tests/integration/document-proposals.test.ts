/* Every APIA paper fills the app (migration 046, docs/apia-documents-autofill-plan.md step 3) on the real Supabase:
   the new kinds, one paper once (sha256), proposals (who reads and writes, re-reads keep what was saved, „Nu salva”),
   decisions line by line, and the links from rows back to their paper. Run with `npm run test:integration` after
   `npm run db:migrate`.

   The cast: Ana owns farm A. Bogdan is a manager on A, Wally a worker on A. Sorin has his own farm. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const stamp = Date.now();
const password = `Test-${stamp}-pw`;

interface TestUser {
  id: string;
  client: SupabaseClient;
}
async function makeUser(tag: string): Promise<TestUser> {
  const email = `proposals-${tag}-${stamp}@cropcash.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, client };
}
async function makeFarm(u: TestUser, name: string): Promise<string> {
  const { data, error } = await u.client.rpc('create_farm', {
    p_name: name,
    p_county: 'TR',
    p_birth_year: 1970,
    p_parcels: [{ crop_id: 'grau', area_ari: 800 }],
    p_start_balance_bani: 0,
  });
  if (error) throw error;
  return data as string;
}

let ana: TestUser, bogdan: TestUser, wally: TestUser, sorin: TestUser;
let farmA: string, farmS: string;

const sha = (c: string) => c.repeat(64);
/** Keeps a paper of any kind. Only a cerere writes fields and rows, so the others pass none. */
const keep = (u: TestUser, farm: string, kind: string, over: { sha256?: string | null; year?: number; replaces?: string | null } = {}) =>
  u.client.rpc('save_cerere_document', {
    p_farmer_id: farm,
    p_client_id: crypto.randomUUID(),
    p_kind: kind,
    p_campaign_year: over.year ?? 2031,
    p_title: null,
    p_files: [],
    p_reading: { kind },
    p_reader_version: 'test',
    p_fields: null,
    p_rows: null,
    p_replaces: over.replaces ?? null,
    p_sha256: over.sha256 ?? null,
    p_pile_id: null,
  });

const diesel = { category: 'diesel', amountBani: 225000, date: '2031-07-08', docNo: 'CS 2201', counterparty: 'CARBURANȚI SINTETICI SRL', fuelLitersCl: 30000 };
const proposals = [
  { position: 0, target: 'expense', payload: diesel, quality: 'paper' },
  { position: 1, target: 'expense', payload: { ...diesel, amountBani: null }, quality: 'summary', status: 'duplicate', links: { duplicateOf: { index: 0 } } },
  { position: 2, target: 'calendar_event', payload: { date: '2031-10-31', reason: 'fuel_claim' }, quality: 'paper' },
];
const saveProposals = (u: TestUser, farm: string, doc: string, list: unknown[] = proposals) =>
  u.client.rpc('save_document_proposals', { p_farmer_id: farm, p_document_id: doc, p_proposals: list });

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [ana, bogdan, wally, sorin] = await Promise.all(['ana', 'bogdan', 'wally', 'sorin'].map(makeUser));
  [farmA, farmS] = await Promise.all([makeFarm(ana, 'Ferma A'), makeFarm(sorin, 'Ferma S')]);
  const { error } = await admin.from('farm_members').insert([
    { farmer_id: farmA, user_id: bogdan.id, role: 'manager' },
    { farmer_id: farmA, user_id: wally.id, role: 'worker' },
  ]);
  if (error) throw error;
});

afterAll(async () => {
  await Promise.all([ana, bogdan, wally, sorin].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe('papers of every kind, once each', () => {
  it('keeps the new kinds, and still refuses an unknown one', async () => {
    for (const kind of ['lease', 'fuel_quarter_request', 'apia_credit_cert', 'bank_statement']) expect((await keep(ana, farmA, kind)).error).toBeNull();
    expect((await keep(ana, farmA, 'passport')).error?.code).toBe('23514');
  });

  it('the same paper twice on a farm is refused with the first one’s id; another farm may have it', async () => {
    const first = await keep(ana, farmA, 'lease', { sha256: sha('a') });
    expect(first.error).toBeNull();
    const again = await keep(bogdan, farmA, 'lease', { sha256: sha('a') });
    expect(again.error?.hint).toBe('same_paper');
    expect(again.error?.details).toBe(first.data);
    expect((await keep(sorin, farmS, 'lease', { sha256: sha('a') })).error).toBeNull();
    expect((await keep(ana, farmA, 'lease', { sha256: 'not-a-hash' })).error?.code).toBe('23514');
  });

  it('a cerere may be replaced by the same pages', async () => {
    const first = await keep(ana, farmA, 'apia_cerere', { sha256: sha('b'), year: 2033 });
    expect(first.error).toBeNull();
    const replaced = await keep(ana, farmA, 'apia_cerere', { sha256: sha('b'), year: 2033, replaces: first.data as string });
    expect(replaced.error).toBeNull();
  });
});

describe('proposals', () => {
  let doc: string;

  beforeAll(async () => {
    doc = (await keep(ana, farmA, 'fuel_quarter_request')).data as string;
  });

  it('owner and manager write and read them; a worker and a stranger can do neither', async () => {
    expect((await saveProposals(bogdan, farmA, doc)).data).toBe(3);
    for (const u of [ana, bogdan]) expect((await u.client.from('document_proposals').select('position').eq('document_id', doc)).data).toHaveLength(3);
    for (const u of [wally, sorin]) {
      expect((await u.client.from('document_proposals').select('id').eq('farmer_id', farmA)).data).toEqual([]);
      expect((await saveProposals(u, farmA, doc)).error).not.toBeNull();
    }
  });

  it('nobody writes the table past the functions', async () => {
    const ins = await ana.client.from('document_proposals').insert({ document_id: doc, farmer_id: farmA, position: 9, target: 'sale', payload: {}, quality: 'paper' });
    expect(ins.error).not.toBeNull();
    await ana.client.from('document_proposals').update({ status: 'applied' }).eq('document_id', doc);
    const { data } = await ana.client.from('document_proposals').select('status').eq('document_id', doc).order('position');
    expect(data?.map((r) => r.status)).toEqual(['proposed', 'duplicate', 'proposed']);
  });

  it('refuses a CNP or IBAN in a payload, an unknown target, and a proposal born applied', async () => {
    const cnp = [{ position: 0, target: 'sale', payload: { cropId: 'grau', note: '1660315340010' }, quality: 'paper' }];
    expect((await saveProposals(ana, farmA, doc, cnp)).error?.code).toBe('23514');
    const iban = [{ position: 0, target: 'sale', payload: { counterparty: 'RO49AAAA1B31007593840000' }, quality: 'paper' }];
    expect((await saveProposals(ana, farmA, doc, iban)).error?.code).toBe('23514');
    expect((await saveProposals(ana, farmA, doc, [{ position: 0, target: 'tractor', payload: {}, quality: 'paper' }])).error?.code).toBe('23514');
    expect((await saveProposals(ana, farmA, doc, [{ ...proposals[0], status: 'applied' }])).error?.code).toBe('22023');
    // A refused write changes nothing.
    expect((await ana.client.from('document_proposals').select('id').eq('document_id', doc)).data).toHaveLength(3);
  });

  it('„Nu salva” and back; a duplicate or another farm’s proposal is not touched', async () => {
    const { data } = await ana.client.from('document_proposals').select('id, position').eq('document_id', doc).order('position');
    const [first, dup] = data!;
    const set = (u: TestUser, farm: string, id: string, status: string) => u.client.rpc('set_proposal_status', { p_farmer_id: farm, p_proposal_id: id, p_status: status });
    expect((await set(bogdan, farmA, first.id, 'skipped')).error).toBeNull();
    expect((await set(bogdan, farmA, first.id, 'proposed')).error).toBeNull();
    expect((await set(ana, farmA, first.id, 'applied')).error?.code).toBe('22023');
    expect((await set(ana, farmA, dup.id, 'skipped')).error?.code).toBe('P0002');
    expect((await set(sorin, farmS, first.id, 'skipped')).error?.code).toBe('P0002');
  });

  it('a re-read replaces what wasn’t saved and keeps what was', async () => {
    // Step 6 marks a proposal applied; here the service role stands in for it.
    const { error } = await admin
      .from('document_proposals')
      .update({ status: 'applied', applied_at: new Date().toISOString(), applied_table: 'transactions' })
      .eq('document_id', doc)
      .eq('position', 0);
    expect(error).toBeNull();
    const reread = [{ ...proposals[0], payload: { ...diesel, amountBani: 1 } }, { position: 3, target: 'calendar_event', payload: { date: '2031-11-01', reason: 'other' }, quality: 'paper' }];
    expect((await saveProposals(ana, farmA, doc, reread)).data).toBe(1);
    const { data } = await ana.client.from('document_proposals').select('position, status, payload').eq('document_id', doc).order('position');
    expect(data?.map((r) => [r.position, r.status])).toEqual([
      [0, 'applied'],
      [3, 'proposed'],
    ]);
    expect((data![0].payload as { amountBani: number }).amountBani).toBe(225000);
  });

  it('go with their paper when it is deleted', async () => {
    expect((await ana.client.rpc('delete_farm_document', { p_farmer_id: farmA, p_document_id: doc, p_only_files: false })).error).toBeNull();
    expect((await admin.from('document_proposals').select('id').eq('document_id', doc)).data).toEqual([]);
  });
});

describe('decisions and where rows came from', () => {
  it('one decision per campaign and round, lines read by the team only', async () => {
    const { data: d, error } = await admin.from('subsidy_decisions').insert({ farmer_id: farmA, campaign_year: 2031, round: 'advance', total_bani: 930000 }).select('id').single();
    expect(error).toBeNull();
    expect((await admin.from('subsidy_decision_lines').insert([
      { decision_id: d!.id, farmer_id: farmA, line_no: 1, scheme: 'PD-01', area_ari: 1500, amount_bani: 600000 },
      { decision_id: d!.id, farmer_id: farmA, line_no: 2, scheme: 'PD-02', area_ari: 1500, amount_bani: 330000 },
    ])).error).toBeNull();
    expect((await admin.from('subsidy_decisions').insert({ farmer_id: farmA, campaign_year: 2031, round: 'advance', total_bani: 1 })).error?.code).toBe('23505');
    expect((await bogdan.client.from('subsidy_decision_lines').select('scheme').eq('decision_id', d!.id)).data).toHaveLength(2);
    for (const u of [wally, sorin]) expect((await u.client.from('subsidy_decisions').select('id').eq('farmer_id', farmA)).data).toEqual([]);
    expect((await ana.client.from('subsidy_decisions').insert({ farmer_id: farmA, campaign_year: 2031, round: 'balance', total_bani: 1 })).error).not.toBeNull();
    // A line can't hang off another farm's decision.
    expect((await admin.from('subsidy_decision_lines').insert({ decision_id: d!.id, farmer_id: farmS, line_no: 3, scheme: 'PD-04', amount_bani: 1 })).error?.code).toBe('23503');
  });

  it('a row points only at a paper of its own farm, and loses the link when the paper goes', async () => {
    const own = (await keep(ana, farmA, 'apia_decizie')).data as string;
    const other = (await keep(sorin, farmS, 'apia_decizie')).data as string;
    const bad = await admin.from('subsidy_decisions').insert({ farmer_id: farmA, campaign_year: 2032, round: 'advance', total_bani: 1, source_document_id: other });
    expect(bad.error?.code).toBe('23503');
    const { data: d } = await admin.from('subsidy_decisions').insert({ farmer_id: farmA, campaign_year: 2032, round: 'balance', total_bani: 1, source_document_id: own }).select('id').single();
    await ana.client.rpc('delete_farm_document', { p_farmer_id: farmA, p_document_id: own, p_only_files: false });
    const { data: after } = await admin.from('subsidy_decisions').select('source_document_id').eq('id', d!.id).single();
    expect(after?.source_document_id).toBeNull();
  });
});
