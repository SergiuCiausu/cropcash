/*
 * npm run seed:demo — puts Ion's demo account back at the start of the pitch (docs/09 §3):
 * farm onboarded, Stripe account + Test Clock at demo_start, APIA advance NOT yet paid,
 * His crops sit on his two real blocs in Măldăeni, with the demo work from
 * demo-ion.json (plot_work, docs/harta-plan.md step 11), and his cerere de plată kept and put on those parcels
 * (docs/cerere-documents-google-map-plan.md step 8: the persona's name, his real blocs, no CNP or IBAN). Safe to run again and again: the old account, its Stripe objects and all
 * its rows (cascade) are removed first.
 *
 * Needs in .env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * STRIPE_SECRET_KEY (sk_test_), DEMO_EMAIL, DEMO_PASSWORD.
 */
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadData } from '../packages/shared/src';
import { createApp } from '../apps/api/src/app';
import { supabaseRepo } from '../apps/api/src/db/repo';
import { supabaseAdminRepo } from '../apps/api/src/db/admin';
import { supabaseFactory } from '../apps/api/src/db/supabase';
import { grantRole } from '../apps/api/src/db/roles';
import { supabaseTokenVerifier } from '../apps/api/src/middleware/auth';
import { createStripe, MoneyService } from '../apps/api/src/stripe/money';
import { parseBlocs } from '../packages/shared/src/plots/index';
import { CERERE_READER_VERSION, cerereFieldsToRow, cerereRowToRow, demoCerere } from '../packages/shared/src';
import { supabaseFarmDocuments } from '../apps/api/src/db/farm-documents';
import { harvestYear } from '../packages/shared/src/farm/harvests';
import bloc286 from '../packages/shared/src/plots/__fixtures__/lpis-bloc-153277-286.json';
import bloc293 from '../packages/shared/src/plots/__fixtures__/lpis-bloc-153277-293.json';
import { randomUUID } from 'node:crypto';
import { issuedDemoInvoices, issuedDemoProfile, loadInvoicingData, loadIssuedDemo } from '../packages/shared/src/invoices/index';
import { supabaseInvoices } from '../apps/api/src/db/invoices';
import { InvoicingService } from '../apps/api/src/invoicing/service';
import { simulatedProvider } from '../apps/api/src/invoicing/simulated';

const t0 = Date.now();
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set (see .env.example)`);
  return v;
};
const env = {
  url: need('SUPABASE_URL'),
  anon: need('SUPABASE_ANON_KEY'),
  service: need('SUPABASE_SERVICE_ROLE_KEY'),
  stripe: need('STRIPE_SECRET_KEY'),
  email: need('DEMO_EMAIL'),
  password: need('DEMO_PASSWORD'),
};
const ion = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'docs', 'data', 'demo-ion.json'), 'utf8'));
const step = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

const data = loadData();
const db = supabaseFactory(env.url, env.anon, env.service);
const sb = db.admin();
const admin = supabaseAdminRepo(sb);
const stripe = createStripe(env.stripe);
const money = new MoneyService(stripe, admin, data);

// 1. Remove the previous demo account (Stripe objects first, then the user; rows cascade).
const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) throw listErr;
const old = list.users.find((u) => u.email?.toLowerCase() === env.email.toLowerCase());
if (old) {
  const farm = await admin.farmByUser(old.id);
  if (farm?.test_clock_id) await stripe.testHelpers.testClocks.del(farm.test_clock_id).catch(() => {});
  if (farm?.stripe_account_id) {
    await stripe.v2.core.accounts.close(farm.stripe_account_id, { applied_configurations: ['recipient'] }).catch(() => {});
  }
  const { error } = await sb.auth.admin.deleteUser(old.id);
  if (error) throw error;
  step(`removed the old demo account (${env.email})`);
}

// 2. Fresh user, logged in like the app does.
const { data: created, error: createErr } = await sb.auth.admin.createUser({
  email: env.email,
  password: env.password,
  email_confirm: true,
});
if (createErr) throw createErr;
// The new user has a new id, and deleting the old one dropped its app_roles row: make the demo account an admin again.
await grantRole(sb, created.user.id, 'admin', 'seed:demo — the demo account opens /admin');
const client = createClient(env.url, env.anon, { auth: { persistSession: false } });
const { data: session, error: loginErr } = await client.auth.signInWithPassword({ email: env.email, password: env.password });
if (loginErr) throw loginErr;
step('created the user (admin in app_roles)');

// 3. Onboarding through the real API route (same validation as the phone).
const app = createApp({
  corsOrigins: [],
  verifyToken: supabaseTokenVerifier(env.url),
  repo: supabaseRepo(db),
  data,
  // The invoices of step 6, on the simulator, as in server.ts.
  invoicing: (() => {
    const store = supabaseInvoices(db);
    return { store, service: new InvoicingService({ store, providers: { simulated: simulatedProvider(loadInvoicingData(), data) }, now: () => new Date() }) };
  })(),
});
const server = app.listen(0);
const call = (method: string, path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session!.access_token}` },
    body: JSON.stringify(body),
  });
try {
  const res = await call('POST', '/api/farmers', {
      name: ion.name,
      county: ion.county,
      age: ion.age,
      startBalanceLei: ion.start_balance_lei,
      parcels: ion.parcels.map((p: { crop_id: string; area_ha: number }) => ({ cropId: p.crop_id, areaHa: p.area_ha })),
  });
  if (res.status !== 201) throw new Error(`onboarding failed: ${res.status} ${await res.text()}`);
} catch (e) {
  server.close();
  throw e;
}
step('onboarded the farm');

// 4. Stripe account and Test Clock at the demo start.
const farm = await admin.farmByUser(created.user.id);
if (!farm) throw new Error('farm not found after onboarding');
const startAt = Math.floor(Date.parse(`${ion.demo_start.value}T09:00:00Z`) / 1000);
const ready = await money.setup(farm, env.email, '127.0.0.1', startAt);
step(`Stripe ready: ${ready.stripe_account_id}, clock ${ready.test_clock_id} at ${ready.demo_now}`);

// 5. His crops on his real blocs (wheat on 286, maize on 293, as /ferma-lui-ion shows), then his demo work.
try {
  const year = harvestYear(ion.demo_start.value);
  const work = ion.plot_work as { sown_on: Record<string, string>; operations: { crop_id: string; kind: string; status: string; on_date: string }[] };
  const blocs = [bloc286, bloc293].map((b) => parseBlocs(b)[0]!);
  const crops = ion.parcels as { crop_id: string; area_ha: number }[];
  const plots = crops.map((p, i) => {
    const b = blocs[i]!;
    return {
      county: ion.county,
      siruta: b.siruta,
      blocFizic: b.bloc,
      lpisFbid: b.fbid,
      landUse: b.landUse,
      geometry: b.geometry,
      geometrySource: 'lpis',
      season: { cropId: p.crop_id, areaAri: Math.round(p.area_ha * 100), sownOn: work.sown_on[p.crop_id] ?? null },
    };
  });
  const saved = await call('PUT', '/api/plots', { harvestYear: year, plots });
  if (!saved.ok) throw new Error(`parcels failed: ${saved.status} ${await saved.text()}`);
  const { ids } = (await saved.json()) as { ids: string[] };

  // His cerere de plată, kept and linked to the parcels just placed: /documente shows it „pusă pe hartă”.
  // Before migration 041 is on the database there is nowhere to keep it; the rest of the demo goes on.
  try {
    const kept = demoCerere(
      plots.map((p) => ({ county: p.county, siruta: p.siruta, blocFizic: p.blocFizic, parcelNo: null, landUse: p.landUse, cropId: p.season.cropId, areaAri: p.season.areaAri, plotId: null })),
      year,
      { name: ion.name, county: ion.county, age: ion.age ?? null },
      data,
      ion.demo_start.value,
    );
    const docId = await supabaseFarmDocuments(db).save(session.session!.access_token, farm.id, {
      clientId: randomUUID(),
      kind: 'apia_cerere',
      campaignYear: year,
      title: null,
      files: [],
      reading: kept.reading,
      readerVersion: CERERE_READER_VERSION,
      fields: cerereFieldsToRow(kept.fields),
      rows: kept.rows.map(cerereRowToRow),
      replaces: null,
    });
    const items = plots.map((p, i) => ({ rowNo: i + 1, plot: { ...p, id: ids[i] } }));
    const applied = await call('POST', `/api/farm-documents/${docId}/apply`, { harvestYear: year, items });
    if (!applied.ok) throw new Error(`cerere apply failed: ${applied.status} ${await applied.text()}`);
    step(`cerere de plată ${year} kept, ${items.length} rows put on the parcels`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/farm_documents|save_cerere_document|schema cache|does not exist/i.test(msg)) throw e;
    step(`cerere skipped: migration 041 is not on the database yet (${msg.slice(0, 80)})`);
  }

  for (const o of work.operations) {
    const plotId = ids[crops.findIndex((p) => p.crop_id === o.crop_id)];
    if (!plotId) continue;
    const r = await call('POST', '/api/plots/operations', { plotId, harvestYear: year, kind: o.kind, status: o.status, onDate: o.on_date });
    if (r.status !== 201) throw new Error(`work failed: ${r.status} ${await r.text()}`);
  }
  step(`parcels on blocs ${blocs.map((b) => b.bloc).join(' and ')}, ${work.operations.length} pieces of demo work`);

  // 6. „Facturi” (docs/facturi-plan.md step 6). On the demo account Ion is a PFA (einvoice-demo-issued.json) with three
  //    maize invoices already given: one rejected and sent again, one accepted, one cancelled by a storno. The simulator
  //    goes by the farm's clock, so the clock is set to each day in turn, as if those days had passed, then put back
  //    where Stripe left it. The suppliers' invoices in „Primite” come on the first read, up to the demo date.
  const demoNow = ready.demo_now;
  const setClock = async (day: string) => {
    const { error } = await sb.from('farmers').update({ demo_now: `${day}T09:00:00.000Z` }).eq('id', farm.id);
    if (error) throw error;
  };
  const dayAfter = (day: string, n = 1) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const ok = async (method: string, path: string, body: unknown, want: number[]) => {
    const r = await call(method, path, body);
    if (!want.includes(r.status)) throw new Error(`${method} ${path} failed: ${r.status} ${await r.text()}`);
    return r.status === 204 ? null : r.json();
  };
  const outList = async () => ((await ok('GET', '/api/invoices?direction=out', undefined, [200])) as { invoices: { id: string; docId: string; status: string }[] }).invoices;
  const issuedFile = loadIssuedDemo();
  const stories = issuedDemoInvoices(issuedFile, loadInvoicingData().sim, data.crops.crops, ion.parcels).sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  try {
    await ok('PUT', '/api/invoicing/profile', issuedDemoProfile(issuedFile), [204]);
    const { id: seriesId } = (await ok('POST', '/api/invoicing/series', { prefix: issuedFile.series_prefix, simulated: true }, [201])) as { id: string };
    for (const inv of stories) {
      await setClock(inv.issueDate);
      const { id } = (await ok(
        'POST',
        '/api/invoices',
        { seriesId, issueDate: inv.issueDate, buyer: inv.buyer, lines: inv.lines, ...(inv.note ? { note: inv.note } : {}), clientId: randomUUID() },
        [201],
      )) as { id: string };
      await setClock(dayAfter(inv.issueDate));
      const now = (await outList()).find((i) => i.id === id)?.status;
      const want = inv.story === 'rejected_then_resent' ? 'rejected' : 'accepted';
      if (now !== want) throw new Error(`invoice ${inv.number}: ${now}, expected ${want}`);
      if (inv.story === 'rejected_then_resent') {
        await ok('POST', `/api/invoices/${id}/resend`, {}, [204]);
        await setClock(dayAfter(inv.issueDate, 2));
      }
      if (inv.story === 'storno') {
        await setClock(inv.stornoDate!);
        await ok('POST', `/api/invoices/${id}/cancel`, { issueDate: inv.stornoDate, clientId: randomUUID() }, [201]);
        await setClock(dayAfter(inv.stornoDate!));
      }
    }
  } finally {
    const { error } = await sb.from('farmers').update({ demo_now: demoNow }).eq('id', farm.id);
    if (error) throw error;
  }
  const out = await outList();
  const inbox = ((await ok('GET', '/api/invoices?direction=in', undefined, [200])) as { invoices: unknown[] }).invoices;
  const byStatus = out.reduce<Record<string, number>>((m, i) => ({ ...m, [i.status]: (m[i.status] ?? 0) + 1 }), {});
  if (byStatus.accepted !== 3 || byStatus.cancelled !== 1) throw new Error(`issued invoices: ${JSON.stringify(byStatus)}, expected 3 accepted and 1 cancelled`);
  step(`invoices: ${out.length} given (${out.map((i) => `${i.docId} ${i.status}`).join(', ')}), ${inbox.length} from suppliers in „Primite”`);
} finally {
  server.close();
}

console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s. Log in as ${env.email}.`);
