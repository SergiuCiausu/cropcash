/* The kept cerere (migration 041, docs/cerere-documents-google-map-plan.md step 2) on the real Supabase:
   who reads and writes papers, fields and rows, the version check, putting rows on the map, deleting, and the
   private farm-documents bucket. Run with `npm run test:integration` after `npm run db:migrate`.

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
const BUCKET = 'farm-documents';

interface TestUser {
  id: string;
  client: SupabaseClient;
}
async function makeUser(tag: string): Promise<TestUser> {
  const email = `docs-${tag}-${stamp}@cropcash.test`;
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
    p_parcels: [
      { crop_id: 'grau', area_ari: 800 },
      { crop_id: 'porumb', area_ari: 700 },
    ],
    p_start_balance_bani: 0,
  });
  if (error) throw error;
  return data as string;
}

let ana: TestUser, bogdan: TestUser, wally: TestUser, sorin: TestUser;
let farmA: string, farmS: string;

const reading = { kind: 'apia_cerere', year: 2031, totalAri: 1500 };
const fields = { applicant_type: 'pf', last_name: 'Test', first_name: 'Ion', birth_year: 1970, county: 'TR', total_area_ari: 1500, schemes: ['BISS'], edited: {} };
const rows = [
  { row_no: 1, county: 'TR', siruta: 153277, bloc_fizic: '286', parcel_no: '1a', land_use: 'TA', apia_crop_code: 101, crop_name: 'Grâu', crop_id: 'grau', area_ari: 800 },
  { row_no: 2, county: 'TR', siruta: 153277, bloc_fizic: '293', parcel_no: '1', land_use: 'TA', apia_crop_code: 108, crop_name: 'Porumb', crop_id: 'porumb', area_ari: 700 },
];
const save = (u: TestUser, farm: string, over: { files?: unknown[]; replaces?: string | null; reading?: unknown; year?: number } = {}) =>
  u.client.rpc('save_cerere_document', {
    p_farmer_id: farm,
    p_client_id: crypto.randomUUID(),
    p_kind: 'apia_cerere',
    p_campaign_year: over.year ?? 2031,
    p_title: 'Cererea de test',
    p_files: over.files ?? [],
    p_reading: over.reading ?? reading,
    p_reader_version: 'test',
    p_fields: fields,
    p_rows: rows,
    p_replaces: over.replaces ?? null,
  });

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
  const { data } = await admin.storage.from(BUCKET).list(farmA, { limit: 100 });
  for (const folder of data ?? []) {
    const { data: inner } = await admin.storage.from(BUCKET).list(`${farmA}/${folder.name}`);
    if (inner?.length) await admin.storage.from(BUCKET).remove(inner.map((f) => `${farmA}/${folder.name}/${f.name}`));
  }
  await Promise.all([ana, bogdan, wally, sorin].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe('kept papers', () => {
  let doc: string;

  it('the owner keeps a cerere; a second one for the year is refused with the current id', async () => {
    const first = await save(ana, farmA, { files: [{ path: `${farmA}/x/1.pdf`, mediaType: 'application/pdf', bytes: 1, sha256: 'x' }] });
    expect(first.error).toBeNull();
    doc = first.data as string;
    const second = await save(bogdan, farmA);
    expect(second.error?.hint).toBe('cerere_exists');
    expect(second.error?.details).toBe(doc);
  });

  it('a manager may not keep files, but may replace the cerere without them', async () => {
    expect((await save(bogdan, farmA, { files: [{ path: 'x' }], replaces: doc })).error?.hint).toBe('role_not_allowed');
    const r = await save(bogdan, farmA, { replaces: doc });
    expect(r.error).toBeNull();
    const old = await ana.client.from('farm_documents').select('superseded_by').eq('id', doc).single();
    expect(old.data?.superseded_by).toBe(r.data);
    doc = r.data as string;
  });

  it('owner and manager read it; a worker and a stranger read nothing', async () => {
    for (const u of [ana, bogdan]) expect((await u.client.from('cerere_rows').select('row_no').eq('document_id', doc)).data).toHaveLength(2);
    for (const u of [wally, sorin]) {
      expect((await u.client.from('farm_documents').select('id').eq('farmer_id', farmA)).data).toEqual([]);
      expect((await u.client.from('cerere_fields').select('document_id').eq('farmer_id', farmA)).data).toEqual([]);
    }
  });

  it('nobody writes the tables past the functions', async () => {
    const ins = await ana.client.from('farm_documents').insert({ farmer_id: farmA, kind: 'other', reading: {}, reader_version: 'x' });
    expect(ins.error).not.toBeNull();
    await ana.client.from('cerere_rows').update({ area_ari: 1 }).eq('document_id', doc);
    expect((await ana.client.from('cerere_rows').select('area_ari').eq('document_id', doc).eq('row_no', 1).single()).data?.area_ari).toBe(800);
  });

  it('a CNP is refused even if the API missed it', async () => {
    const r = await save(ana, farmA, { reading: { ...reading, note: 'CNP 1700515340015' }, year: 2032 });
    expect(r.error?.code).toBe('23514');
  });

  it('edits go on the version read; an older one is stale', async () => {
    const { data: d } = await bogdan.client.from('farm_documents').select('version').eq('id', doc).single();
    const ok = await bogdan.client.rpc('update_cerere', {
      p_farmer_id: farmA,
      p_document_id: doc,
      p_version: d!.version,
      p_fields: { ...fields, first_name: 'Ionel', edited: { firstName: true } },
      p_rows: [{ ...rows[1], area_ari: 720, edited: { areaAri: true } }],
      p_status: 'checked',
    });
    expect(ok.error).toBeNull();
    expect(ok.data).toBe(d!.version + 1);
    const stale = await ana.client.rpc('update_cerere', { p_farmer_id: farmA, p_document_id: doc, p_version: d!.version, p_fields: null, p_rows: [] });
    expect(stale.error?.hint).toBe('stale');
    const worker = await wally.client.rpc('update_cerere', { p_farmer_id: farmA, p_document_id: doc, p_version: d!.version + 1, p_fields: null, p_rows: null });
    expect(worker.error?.hint).toBe('role_not_allowed');
  });

  it('rows go on the map and the seasons point back at them', async () => {
    const { data: year } = await ana.client.rpc('farm_harvest_year', { p_farmer: farmA });
    const item = (r: (typeof rows)[number], area = r.area_ari) => ({
      row_no: r.row_no,
      plot: { county: 'TR', siruta: r.siruta, bloc_fizic: r.bloc_fizic, parcel_no: r.parcel_no, land_use: 'TA', season: { crop_id: r.crop_id, apia_crop_code: r.apia_crop_code, area_ari: area } },
    });
    const applied = await bogdan.client.rpc('apply_cerere', { p_farmer_id: farmA, p_document_id: doc, p_harvest_year: year, p_items: [item(rows[0]!), item(rows[1]!, 720)] });
    expect(applied.error).toBeNull();
    const links = (await ana.client.from('cerere_rows').select('id, row_no, plot_id').eq('document_id', doc).order('row_no')).data!;
    expect(links.every((l) => l.plot_id)).toBe(true);
    const seasons = (await ana.client.from('plot_seasons').select('plot_id, source_row_id').eq('harvest_year', year).in('plot_id', links.map((l) => l.plot_id))).data!;
    expect(seasons.map((s) => s.source_row_id).sort()).toEqual(links.map((l) => l.id).sort());
    expect((await ana.client.from('farm_documents').select('status').eq('id', doc).single()).data?.status).toBe('applied');
  });

  it('only the owner deletes; the replaced paper becomes current again', async () => {
    expect((await bogdan.client.rpc('delete_farm_document', { p_farmer_id: farmA, p_document_id: doc })).error?.hint).toBe('role_not_allowed');
    expect((await ana.client.rpc('delete_farm_document', { p_farmer_id: farmA, p_document_id: doc })).error).toBeNull();
    const current = await ana.client.from('farm_documents').select('id').eq('farmer_id', farmA).eq('campaign_year', 2031).is('superseded_by', null);
    expect(current.data).toHaveLength(1);
  });
});

describe('the farm-documents bucket', () => {
  const pdf = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });

  it('only the owner adds, reads and removes files in the farm folder', async () => {
    const path = `${farmA}/${crypto.randomUUID()}/1.pdf`;
    expect((await ana.client.storage.from(BUCKET).upload(path, pdf)).error).toBeNull();
    expect((await bogdan.client.storage.from(BUCKET).upload(`${farmA}/${crypto.randomUUID()}/1.pdf`, pdf)).error).not.toBeNull();
    expect((await ana.client.storage.from(BUCKET).upload(`${farmS}/${crypto.randomUUID()}/1.pdf`, pdf)).error).not.toBeNull();

    expect((await ana.client.storage.from(BUCKET).download(path)).error).toBeNull();
    for (const u of [bogdan, wally, sorin]) expect((await u.client.storage.from(BUCKET).download(path)).error).not.toBeNull();
    const signed = await ana.client.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    expect((await bogdan.client.storage.from(BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();

    await bogdan.client.storage.from(BUCKET).remove([path]);
    expect((await ana.client.storage.from(BUCKET).download(path)).error).toBeNull();
    expect((await ana.client.storage.from(BUCKET).remove([path])).error).toBeNull();
    /* Gone means no new link, and an old one stops working. A direct download right after can still be served
       from Supabase's cache (seen 2026-11-18, even with cacheControl 0); the app never downloads directly, only
       through these 60-second links. */
    expect((await ana.client.storage.from(BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await fetch(signed.data!.signedUrl)).ok).toBe(false);
  });

  it('is private: no public URL serves a file', async () => {
    const path = `${farmA}/${crypto.randomUUID()}/1.pdf`;
    await ana.client.storage.from(BUCKET).upload(path, pdf);
    const { data } = ana.client.storage.from(BUCKET).getPublicUrl(path);
    expect((await fetch(data.publicUrl)).ok).toBe(false);
    await ana.client.storage.from(BUCKET).remove([path]);
  });
});
