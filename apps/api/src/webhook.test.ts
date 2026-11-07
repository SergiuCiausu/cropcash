import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import Stripe from 'stripe';
import { loadData } from '@cropcash/shared';
import { createApp } from './app';
import type { AdminRepo, NewTransaction } from './db/admin';
import type { Repo } from './db/repo';
import { MoneyService } from './stripe/money';

const data = loadData();
const SECRET = 'whsec_test_cropcash';
const stripe = new Stripe('sk_test_dummy_for_signature_checks');

function memoryAdmin() {
  const txs = new Map<string, NewTransaction>();
  const admin: AdminRepo = {
    farmByUser: async () => null,
    farmBy: async () => null,
    setStripeIds: async () => {},
    recordTransaction: vi.fn(async (tx: NewTransaction) => {
      if (!txs.has(tx.stripe_object_id)) txs.set(tx.stripe_object_id, tx);
    }),
    recordPayout: async () => {},
    setPayoutStatus: vi.fn(async () => 1),
    upsertPension: async () => {},
  };
  return { admin, txs };
}

const repo = {} as Repo;
const makeApp = (admin: AdminRepo) =>
  createApp({
    corsOrigins: [],
    verifyToken: async () => ({ userId: 'u' }),
    repo,
    data,
    money: {
      money: new MoneyService(stripe, admin, data, async () => {}),
      admin,
      verifyWebhook: (raw, sig) => stripe.webhooks.constructEvent(raw, sig, SECRET),
      demoMode: false,
      data,
    },
  });

const event = (type: string, object: object) =>
  JSON.stringify({ id: `evt_${Math.random()}`, object: 'event', type, data: { object } });

const signed = (payload: string) => stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

describe('POST /api/webhooks/stripe', () => {
  it('rejects a missing or forged signature', async () => {
    const { admin } = memoryAdmin();
    const app = makeApp(admin);
    const payload = event('payment_intent.succeeded', {});
    expect((await request(app).post('/api/webhooks/stripe').set('Content-Type', 'application/json').send(payload)).status).toBe(400);
    const forged = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=1,v1=deadbeef')
      .send(payload);
    expect(forged.status).toBe(400);
  });

  it('records a simulated APIA payment once, even if Stripe sends it twice', async () => {
    const { admin, txs } = memoryAdmin();
    const app = makeApp(admin);
    const payload = event('payment_intent.succeeded', {
      id: 'pi_123',
      object: 'payment_intent',
      amount: 1_265_220,
      created: 1_794_000_000,
      metadata: { farmer_id: 'farm-1', kind: 'apia_advance', demo_date: '2026-11-07', crop_id: '' },
    });
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signed(payload))
        .send(payload);
      expect(res.status).toBe(200);
    }
    expect(txs.size).toBe(1);
    expect(txs.get('pi_123')).toMatchObject({ farmer_id: 'farm-1', amount_bani: 1_265_220, kind: 'apia_advance', occurred_at: '2026-11-07T09:00:00Z' });
  });

  it('ignores payments that are not CropCash incomes', async () => {
    const { admin, txs } = memoryAdmin();
    const payload = event('payment_intent.succeeded', { id: 'pi_x', amount: 100, created: 1, metadata: {} });
    await request(makeApp(admin)).post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', signed(payload)).send(payload);
    expect(txs.size).toBe(0);
  });

  it('marks a salary payout as paid', async () => {
    const { admin } = memoryAdmin();
    const payload = event('payout.paid', { id: 'po_1', object: 'payout' });
    await request(makeApp(admin)).post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', signed(payload)).send(payload);
    expect(admin.setPayoutStatus).toHaveBeenCalledWith('po_1', 'paid');
  });

  it('demo routes are off unless DEMO_MODE=true', async () => {
    const { admin } = memoryAdmin();
    const res = await request(makeApp(admin)).post('/api/demo/advance').set('Authorization', 'Bearer x').send({ months: 1 });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/pension (step 7)', () => {
  it('accepts only the slider range from plan-params.json and starts the subscription', async () => {
    const { admin } = memoryAdmin();
    admin.farmByUser = async () => ({ id: 'farm-1', stripe_customer_id: 'cus_1', pension_plans: null }) as never;
    const app = makeApp(admin);
    const start = vi.spyOn(MoneyService.prototype, 'startPension').mockResolvedValue();
    const post = (monthlyLei: unknown) =>
      request(app).post('/api/pension').set('Authorization', 'Bearer good').send({ monthlyLei });

    const { slider_min_lei, slider_max_lei } = data.params.pension;
    expect((await post(slider_min_lei.value - 10)).status).toBe(400);
    expect((await post(slider_max_lei.value + 10)).status).toBe(400);
    expect((await post(200.5)).status).toBe(400);
    expect(start).not.toHaveBeenCalled();

    expect((await post(200)).status).toBe(201);
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ id: 'farm-1' }), 20_000);
    start.mockRestore();
  });

  it('refuses a second pension', async () => {
    const { admin } = memoryAdmin();
    admin.farmByUser = async () =>
      ({ id: 'farm-1', stripe_customer_id: 'cus_1', pension_plans: [{ monthly_bani: 20_000, status: 'active' }] }) as never;
    const res = await request(makeApp(admin)).post('/api/pension').set('Authorization', 'Bearer good').send({ monthlyLei: 200 });
    expect(res.status).toBe(409);
  });
});
