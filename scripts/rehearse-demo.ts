/*
 * npm run demo:rehearse [-- runs]   (default 3, docs/10 step 9)
 * Runs the pitch script (docs/09 §3) against the real Supabase + Stripe sandbox,
 * through the same API routes the phone calls: seed → subsidy → APIA advance →
 * envelopes → credit → 6 months forward → drought → pension. Fails loudly if a
 * step breaks; prints the figures the presenter will say, next to what the app shows.
 */
import { execSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { computeFarmPlan, loadData, simulatePension, type FarmPlan } from '../packages/shared/src';
import { createApp } from '../apps/api/src/app';
import { supabaseRepo } from '../apps/api/src/db/repo';
import { supabaseAdminRepo } from '../apps/api/src/db/admin';
import { supabaseFactory } from '../apps/api/src/db/supabase';
import { supabaseTokenVerifier } from '../apps/api/src/middleware/auth';
import { createStripe, MoneyService, type AdvanceEvent } from '../apps/api/src/stripe/money';

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
  const plan = async (): Promise<FarmPlan> => computeFarmPlan((await call('GET', '/me')).farmer, data);

  try {
    // 1:10 Subsidy as a range.
    let p = await plan();
    const tot = p.subsidies.totals.lei;
    say('Subvenția', 'cam 16.900, între 15.200 și 17.100', `cam ${lei(tot.probable, 100)}, între ${lei(tot.min, 100)} și ${lei(tot.max, 100)}`);
    say('Ceasul demo', '15 noiembrie 2026', p.today);

    // 2:10 "Au intrat 12.652 lei!" + split + credit.
    const inc = (await call('POST', '/demo/income', { kind: 'apia_advance' })).event as AdvanceEvent;
    say('Avansul APIA', '12.652 lei', `${lei(inc.amount)} lei`);
    p = await plan();
    await call('PUT', '/envelopes', p.proposal);
    say('Salariul fără credit', '1.000 lei', `${lei(p.salary.salary)} lei`);
    const sug = p.creditSuggestion ?? fail('no credit suggestion');
    say('Salariul cu credit', '2.850 lei', `${lei(sug.salary)} lei`);
    say('Creditul', '14.800 lei în 2027-04', `${lei(sug.credit.amount)} lei în ${sug.credit.takeMonth}`);
    const take = sug.credit.takeMonth!;
    const [y, m] = take.split('-').map(Number) as [number, number];
    const repay = `${m + 7 > 12 ? y + 1 : y}-${String(((m + 6) % 12) + 1).padStart(2, '0')}`;
    await call('POST', '/credits', { amountLei: sug.credit.amount / 100, takeMonth: take, repayMonth: repay });
    p = await plan();
    say('Salariul după credit', '2.850 lei', `${lei(p.monthlySalary)} lei`);

    // 2:40 Pension: started before moving time, so its contributions show up month by month.
    await call('POST', '/pension', { monthlyLei: 200 });
    const sim = simulatePension(p.age, 20_000, p.pension) ?? fail('no pension simulation');
    say('Pensia 200 lei', 'cam 29.000 lei la 65', `cam ${lei(sim.atTarget.probable, 1000)} lei la ${p.pension.targetAge}`);

    // 2:55 Six months forward.
    const t1 = Date.now();
    const ev = (await call('POST', '/demo/advance', { months: 6 })).events as AdvanceEvent[];
    const sal = ev.filter((e) => e.type === 'salary');
    if (sal.length !== 6 || !sal.every((e) => e.ok)) fail(`expected 6 paid salaries, got ${JSON.stringify(sal)}`);
    const pensions = ev.filter((e) => e.type === 'pension').length;
    if (pensions < 5) fail(`expected at least 5 pension contributions, got ${pensions}`);
    say(
      '6 luni înainte',
      '5 × 2.850, mai: 1.550; pensia',
      `${sal.map((e) => `${e.date.slice(5, 7)}: ${lei(e.amount)}`).join(', ')}; ${pensions} × pensie; ` +
        `${ev.filter((e) => e.type === 'income').map((e) => e.kind).join(', ')} · ${((Date.now() - t1) / 1000).toFixed(0)}s`,
    );
    p = await plan();

    // 3:25 Drought.
    const yearIn = (sc: 'bad' | 'medium') => p.projection[sc].years.find((x) => x.year === 2027)?.in ?? 0;
    say('Secetă: venit 2027', '~80.000 lei (vs ~98.000)', `${lei(yearIn('bad'), 1000)} lei (vs ${lei(yearIn('medium'), 1000)})`);
    say('Secetă: fondul țintă', '~30.000 lei', `${lei(p.riskTarget, 1000)} lei, strâns ${lei(p.riskFund.saved)}`);
    say('Secetă: salariul sigur', '0 lei', `${lei(p.salaries.bad.salary)} lei`);
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
