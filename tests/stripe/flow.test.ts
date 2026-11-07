/* End-to-end money flow on the Stripe sandbox + the real Supabase project (docs/10 step 6).
   Slow (moves a Test Clock 6 months). Run with: npm run test:stripe */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { computeFarmPlan, loadData } from '../../packages/shared/src';
import { createApp } from '../../apps/api/src/app';
import { supabaseRepo } from '../../apps/api/src/db/repo';
import { supabaseAdminRepo } from '../../apps/api/src/db/admin';
import { supabaseFactory } from '../../apps/api/src/db/supabase';
import { supabaseTokenVerifier } from '../../apps/api/src/middleware/auth';
import { createStripe, MoneyService, type AdvanceEvent } from '../../apps/api/src/stripe/money';

const env = process.env as Record<string, string>;
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
    money: new MoneyService(stripe, admin, data, undefined, (m) => console.log('[money]', m)),
    admin,
    verifyWebhook: (raw, sig) => stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET),
    demoMode: true,
    data,
  },
});

const email = `stripe-flow-${Date.now()}@cropcash.test`;
const password = `Flow-${Date.now()}`;
let userId = '';
let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });
const me = async () => (await request(app).get('/api/me').set(auth())).body.farmer;

beforeAll(async () => {
  const sb = db.admin();
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = u.user.id;
  const c = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await c.auth.signInWithPassword({ email, password });
  token = s.session!.access_token;
  const res = await request(app)
    .post('/api/farmers')
    .set(auth())
    .send({ name: 'Ion Stripe', county: 'TR', age: 55, startBalanceLei: 35000, parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 7 }] });
  expect(res.status).toBe(201);
});

afterAll(async () => {
  const farm = await admin.farmByUser(userId);
  if (farm?.stripe_account_id) {
    await stripe.v2.core.accounts.close(farm.stripe_account_id, { applied_configurations: ['recipient'] }).catch(() => {});
  }
  if (farm?.test_clock_id) await stripe.testHelpers.testClocks.del(farm.test_clock_id).catch(() => {});
  await db.admin().auth.admin.deleteUser(userId);
});

describe('Stripe money flow (sandbox)', () => {
  it('sets up a farmer account with no Stripe dashboard, a demo clock and a customer', async () => {
    const res = await request(app).post('/api/stripe/setup').set(auth()).send({});
    expect(res.status).toBe(200);
    const farm = await admin.farmByUser(userId);
    expect(farm?.stripe_account_id).toMatch(/^acct_/);
    expect(farm?.test_clock_id).toMatch(/^clock_/);
    expect(farm?.stripe_customer_id).toMatch(/^cus_/);
    const acct = await stripe.accounts.retrieve(farm!.stripe_account_id!);
    expect(acct.settings?.payouts?.schedule?.interval).toBe('manual');
    // Setup is idempotent.
    expect((await request(app).post('/api/stripe/setup').set(auth()).send({})).body.stripeAccountId).toBe(farm!.stripe_account_id);
  });

  it('the simulated APIA advance lands in the farmer’s Stripe balance and in the plan', async () => {
    const res = await request(app).post('/api/demo/income').set(auth()).send({ kind: 'apia_advance' });
    expect(res.status).toBe(201);
    const farm = await admin.farmByUser(userId);
    // The transfer becomes available within a few seconds.
    let available = 0;
    for (let i = 0; i < 15 && available === 0; i++) {
      const balance = await stripe.balance.retrieve({}, { stripeAccount: farm!.stripe_account_id! });
      available = balance.available.find((b) => b.currency === 'ron')?.amount ?? 0;
      if (!available) await new Promise((r) => setTimeout(r, 1000));
    }
    const { amount } = res.body.event as AdvanceEvent;
    expect(amount).toBe(computeFarmPlan(farm!, data).subsidies.totals.advanceLei);
    expect(available).toBe(amount);
    const plan = computeFarmPlan(await me(), data);
    expect(plan.startBalance).toBe(3_500_000 + amount);
    // A second advance is refused.
    expect((await request(app).post('/api/demo/income').set(auth()).send({ kind: 'apia_advance' })).status).toBe(409);
  });

  it('starts a 200 lei/month pension (first contribution paid now)', async () => {
    const res = await request(app).post('/api/pension').set(auth()).send({ monthlyLei: 200 });
    expect(res.status).toBe(201);
    const farm = await me();
    expect(farm.transactions.filter((t: { kind: string }) => t.kind === 'pension')).toHaveLength(1);
  });

  it('6 months forward: 6 salaries paid out, 6 more pension contributions, APIA balance in March', async () => {
    const res = await request(app).post('/api/demo/advance').set(auth()).send({ months: 6 });
    expect(res.status).toBe(200);
    const events = res.body.events as AdvanceEvent[];
    const salaries = events.filter((e) => e.type === 'salary');
    expect(salaries).toHaveLength(6);
    expect(salaries.every((e) => e.ok && e.amount > 0 && e.amount % 5_000 === 0)).toBe(true);
    expect(events.filter((e) => e.type === 'income').map((e) => e.kind)).toEqual(['apia_balance']);
    const pensions = events.filter((e) => e.type === 'pension').length;
    expect(pensions).toBeGreaterThanOrEqual(5);
    expect(pensions).toBeLessThanOrEqual(6);

    const farm = await me();
    expect(farm.payouts).toHaveLength(6);
    // Statuses synced from Stripe even if a payout.paid webhook arrived before the row existed.
    expect(farm.payouts.every((p: { status: string }) => p.status === 'paid' || p.status === 'pending')).toBe(true);
    expect(farm.payouts.some((p: { status: string }) => p.status === 'paid')).toBe(true);
    expect(farm.demo_now.slice(0, 7)).toBe(new Date(Date.parse(events.at(-1)!.date) + 0).toISOString().slice(0, 7));
    const plan = computeFarmPlan(farm, data);
    // The plan now starts 6 months later and no longer expects the APIA money already received.
    expect(plan.timelines.medium.months[0]!.key > '2027-04').toBe(true);
    expect(plan.received.map((r) => r.kind).sort()).toEqual(['apia_advance', 'apia_balance']);
  }, 240_000);

  it('changes the pension to 300 lei: the next contribution is 300 lei and the salary is fixed again', async () => {
    expect((await request(app).put('/api/pension').set(auth()).send({ monthlyLei: 300 })).status).toBe(204);
    const farm = (await admin.farmByUser(userId))!;
    const plan = [farm.pension_plans ?? []].flat()[0]!;
    expect(plan).toMatchObject({ monthly_bani: 30_000, status: 'active' });
    expect(farm.salary_bani).toBe(computeFarmPlan(farm, data).salary.salary);
    // An invoice Stripe drafted before the change, on the day the clock stopped, is still 200 lei (docs/08 §1c).
    const res = await request(app).post('/api/demo/advance').set(auth()).send({ months: 2 });
    const amounts = (res.body.events as AdvanceEvent[]).filter((e) => e.type === 'pension').map((e) => e.amount);
    expect(amounts.at(-1)).toBe(30_000);
    expect(amounts.filter((a) => a !== 30_000).length).toBeLessThanOrEqual(1);
  }, 120_000);

  it('stops the pension: Stripe cancels it, nothing more is taken, and the salary goes back up', async () => {
    const before = (await admin.farmByUser(userId))!;
    const subId = ([before.pension_plans ?? []].flat()[0] as { stripe_subscription_id: string }).stripe_subscription_id;
    expect((await request(app).delete('/api/pension').set(auth())).status).toBe(204);
    expect((await stripe.subscriptions.retrieve(subId)).status).toBe('canceled');
    const farm = (await admin.farmByUser(userId))!;
    expect([farm.pension_plans ?? []].flat()[0]).toMatchObject({ status: 'stopped' });
    expect(farm.salary_bani).toBe(computeFarmPlan(farm, data).salary.salary);
    expect(farm.salary_bani).toBeGreaterThanOrEqual(before.salary_bani ?? 0);
    const res = await request(app).post('/api/demo/advance').set(auth()).send({ months: 1 });
    expect((res.body.events as AdvanceEvent[]).filter((e) => e.type === 'pension' && e.date > before.demo_now!.slice(0, 10))).toEqual([]);
  }, 120_000);
});
