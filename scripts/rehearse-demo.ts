/*
 * npm run demo:rehearse [-- runs]   (default 3, docs/10 step 9)
 * Runs the pitch script (docs/09 §3) against the real Supabase + Stripe sandbox,
 * through the same API routes the phone calls: seed → subsidy → APIA advance →
 * envelopes → credit → 6 months forward → drought. Fails loudly if a
 * step breaks; prints the figures the presenter will say, next to what the app shows.
 */
import { execSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { computeFarmPlan, loadData } from '../packages/shared/src';
import { createApp } from '../apps/api/src/app';
import { supabaseRepo } from '../apps/api/src/db/repo';
import { supabaseAdminRepo } from '../apps/api/src/db/admin';
import { supabaseFactory } from '../apps/api/src/db/supabase';
import { supabaseTokenVerifier } from '../apps/api/src/middleware/auth';
import { createStripe, MoneyService, type AdvanceEvent } from '../apps/api/src/stripe/money';
import { randomUUID } from 'node:crypto';
import demoIon from '../docs/data/demo-ion.json';
import { issuedDemoInvoices, loadInvoicingData, loadIssuedDemo, type InvoiceView, type InvoicingView } from '../packages/shared/src/invoices/index';
import { supabaseInvoices } from '../apps/api/src/db/invoices';
import { InvoicingService } from '../apps/api/src/invoicing/service';
import { simulatedProvider } from '../apps/api/src/invoicing/simulated';

const env = process.env as Record<string, string>;
const runs = Number(process.argv[2] ?? 3);
const data = loadData();
const db = supabaseFactory(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY);
const admin = supabaseAdminRepo(db.admin());
const stripe = createStripe(env.STRIPE_SECRET_KEY);
const app = createApp({
  corsOrigins: [],
  verifyToken: supabaseTokenVerifier(env.SUPABASE_URL),
  repo: supabaseRepo(db),
  data,
  money: {
    money: new MoneyService(stripe, admin, data),
    admin,
    verifyWebhook: (raw, sig) => stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET),
    demoMode: true,
    data,
  },
  invoicing: (() => {
    const store = supabaseInvoices(db);
    return { store, service: new InvoicingService({ store, providers: { simulated: simulatedProvider(loadInvoicingData(), data) }, now: () => new Date() }) };
  })(),
});

const lei = (bani: number, step = 1) => (Math.round(bani / 100 / step) * step).toLocaleString('ro-RO');
const fail = (msg: string): never => {
  throw new Error(msg);
};

async function rehearse(n: number) {
  const t0 = Date.now();
  const rows: [string, string, string][] = [];
  const say = (step: string, pitch: string, app: string) => rows.push([step, pitch, app]);

  execSync('npm run seed:demo', { stdio: 'ignore' });
  const c = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await c.auth.signInWithPassword({ email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD });
  if (error) throw error;

  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (method: string, path: string, body?: object, expect = [200, 201, 204]) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session!.access_token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!expect.includes(res.status)) fail(`${method} ${path} → ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
  const plan = async (): Promise<ReturnType<typeof computeFarmPlan>> => computeFarmPlan((await call('GET', '/me')).farmer, data);

  try {
    // 1:10 Subsidy as a range.
    let p = await plan();
    const tot = p.subsidies.totals.lei;
    say('Subvenția', 'cam 16.900, între 15.200 și 17.100', `cam ${lei(tot.probable, 100)}, între ${lei(tot.min, 100)} și ${lei(tot.max, 100)}`);
    say('Ceasul demo', '15 noiembrie 2026', p.today);

    // 2:10 "Au intrat 12.649 lei!" + split + credit.
    const inc = (await call('POST', '/demo/income', { kind: 'apia_advance' })).event as AdvanceEvent;
    say('Avansul APIA', '12.649 lei', `${lei(inc.amount)} lei`);
    p = await plan();
    await call('PUT', '/envelopes', p.proposal);
    say('Salariul fără credit', '1.050 lei', `${lei(p.salary.salary)} lei`);
    const sug = p.creditSuggestion ?? fail('no credit suggestion');
    say('Salariul cu credit', '2.950 lei', `${lei(sug.salary)} lei`);
    say('Creditul', '15.100 lei în 2027-04', `${lei(sug.credit.amount)} lei în ${sug.credit.takeMonth}`);
    const take = sug.credit.takeMonth!;
    const [y, m] = take.split('-').map(Number) as [number, number];
    const repay = `${m + 7 > 12 ? y + 1 : y}-${String(((m + 6) % 12) + 1).padStart(2, '0')}`;
    await call('POST', '/credits', { amountLei: sug.credit.amount / 100, takeMonth: take, repayMonth: repay });
    p = await plan();
    say('Salariul după credit', '2.950 lei', `${lei(p.monthlySalary)} lei`);

    // „Fă factura” (docs/facturi-plan.md step 6): Ion, a PFA on the demo account, invoices maize on the demo date. An
    // invoice alone doesn't change the plan, so the figures above and below stay the pitch's. The jump below moves it on.
    const info = (await call('GET', '/invoicing')) as InvoicingView;
    if (info.profile?.legalForm !== 'pfa') fail(`demo account is not a PFA: ${JSON.stringify(info.profile)}`);
    const series = info.series.find((x) => x.simulated && !x.archived) ?? fail('no simulated series');
    const sample = issuedDemoInvoices(loadIssuedDemo(), loadInvoicingData().sim, data.crops.crops, demoIon.parcels).find((x) => x.story === 'accepted') ?? fail('no sample invoice');
    const issued = (await call('POST', '/invoices', { seriesId: series.id, issueDate: p.today, buyer: sample.buyer, lines: sample.lines, clientId: randomUUID() })) as { id: string; docId: string };
    const before = ((await call('GET', `/invoices/${issued.id}`)) as { invoice: InvoiceView }).invoice;
    if (before.status !== 'sent_to_spv' && before.status !== 'in_processing') fail(`new invoice ${issued.docId}: ${before.status}`);

    // 2:55 Six months forward.
    const t1 = Date.now();
    const ev = (await call('POST', '/demo/advance', { months: 6 })).events as AdvanceEvent[];
    const sal = ev.filter((e) => e.type === 'salary');
    if (sal.length !== 6 || !sal.every((e) => e.ok)) fail(`expected 6 paid salaries, got ${JSON.stringify(sal)}`);
    say(
      '6 luni înainte',
      '5 × 2.700, mai: 2.450',
      `${sal.map((e) => `${e.date.slice(5, 7)}: ${lei(e.amount)}`).join(', ')}; ` +
        `${ev.filter((e) => e.type === 'income').map((e) => e.kind).join(', ')} · ${((Date.now() - t1) / 1000).toFixed(0)}s`,
    );
    p = await plan();

    // 3:25 Drought.
    const yearIn = (sc: 'bad' | 'medium') => p.projection[sc].years.find((x) => x.year === 2027)?.in ?? 0;
    say('Secetă: venit 2027', '~79.000 lei (vs ~98.000)', `${lei(yearIn('bad'), 1000)} lei (vs ${lei(yearIn('medium'), 1000)})`);
    say('Secetă: salariul sigur', '0 lei', `${lei(p.salaries.bad.salary)} lei`);

    // „Fă factura → Primită de ANAF”: six months on the farm's clock is well past the simulator's delays.
    const after = ((await call('GET', `/invoices/${issued.id}`)) as { invoice: InvoiceView }).invoice;
    if (after.status !== 'accepted') fail(`${issued.docId} after the jump: ${after.status}`);
    const out = ((await call('GET', '/invoices?direction=out')) as { invoices: InvoiceView[] }).invoices;
    say('Facturi emise', '4 primite, 1 anulată, + cea nouă', `${out.map((i) => `${i.docId} ${i.status}`).join(', ')}`);

    // „Primite → Notează cheltuiala”, last, so the expense doesn't move the figures the pitch reads out above.
    const inbox = ((await call('GET', '/invoices?direction=in')) as { invoices: InvoiceView[] }).invoices;
    const first = inbox.find((i) => i.status === 'new' && i.proposal?.category) ?? fail(`no supplier invoice to note: ${inbox.map((i) => i.status).join(', ')}`);
    const pr = first.proposal!;
    const exp = (await call('POST', '/expenses', {
      category: pr.category,
      amountLei: pr.amountBani / 100,
      date: pr.date,
      docNo: pr.docNo,
      ...(pr.counterparty ? { counterparty: pr.counterparty } : {}),
      clientId: randomUUID(),
    })) as { id: string };
    await call('POST', `/einvoice/inbox/${first.id}/link`, { transactionId: exp.id });
    const noted = ((await call('GET', `/invoices/${first.id}`)) as { invoice: InvoiceView }).invoice;
    if (noted.status !== 'recorded' || noted.transactionId !== exp.id) fail(`${first.docId}: ${noted.status}, linked to ${noted.transactionId}`);
    say('Factură primită', `${inbox.length} de la furnizori`, `${first.docId} → cheltuială ${lei(pr.amountBani)} lei (${pr.category})`);
  } finally {
    server.close();
    console.log(`\n── Repetiția ${n}/${runs} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    const w = Math.max(0, ...rows.map((r) => r[1].length));
    for (const [step, pitch, got] of rows) console.log(`${step.padEnd(22)} pitch: ${pitch.padEnd(w)}  app: ${got}`);
  }
}

try {
  for (let i = 1; i <= runs; i++) await rehearse(i);
  console.log(`\n${runs} repetiții la rând, fără erori.`);
} catch (err) {
  console.error(`\nRepetiția a picat: ${(err as Error).message}`);
  process.exitCode = 1;
}
