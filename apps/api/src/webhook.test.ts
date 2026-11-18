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
  const leases = new Map<string, string>();
  const admin: AdminRepo = {
    farmByUser: async () => null,
    farmBy: async () => null,
    setStripeIds: async () => {},
    recordTransaction: vi.fn(async (tx: NewTransaction) => {
      if (!txs.has(tx.stripe_object_id)) txs.set(tx.stripe_object_id, tx);
    }),
    claimPayout: vi.fn(async () => null),
    finishPayout: vi.fn(async () => {}),
    setPayoutStatus: vi.fn(async () => 1),
    removePayoutTransaction: vi.fn(async (id: string) => void txs.delete(id)),
    upsertPension: async () => {},
    updatePension: vi.fn(async () => {}),
    setSalary: vi.fn(async () => {}),
    takeLease: vi.fn(async (farmerId: string, op: string, holder: string) => {
      const k = `${farmerId}:${op}`;
      if (leases.has(k)) return false;
      leases.set(k, holder);
      return true;
    }),
    releaseLease: vi.fn(async (farmerId: string, op: string, holder: string) => {
      if (leases.get(`${farmerId}:${op}`) === holder) leases.delete(`${farmerId}:${op}`);
    }),
  };
  return { admin, txs, leases };
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
    expect(admin.removePayoutTransaction).not.toHaveBeenCalled();
  });

  it('gives the money back when a salary payout fails', async () => {
    const { admin, txs } = memoryAdmin();
    txs.set('po_1', { farmer_id: 'f', amount_bani: -85_000, kind: 'salary', occurred_at: '2026-12-01T08:00:00Z', source: 'payout', stripe_object_id: 'po_1' });
    const payload = event('payout.failed', { id: 'po_1', object: 'payout' });
    const header = signed(payload);
    const res = await request(makeApp(admin)).post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(payload);
    expect(res.status).toBe(200);
    expect(admin.setPayoutStatus).toHaveBeenCalledWith('po_1', 'failed');
    expect(txs.has('po_1')).toBe(false);
  });

  it('demo routes are off unless DEMO_MODE=true', async () => {
    const { admin } = memoryAdmin();
    const res = await request(makeApp(admin)).post('/api/demo/advance').set('Authorization', 'Bearer x').send({ months: 1 });
    expect(res.status).toBe(404);
  });
});

/** A farm the plan can be built for, with or without a running pension. */
const pensionFarm = (status: 'active' | 'stopped' | null, salary_bani: number | null = null) =>
  ({
    id: 'farm-1',
    county: 'TR',
    birth_year: data.subsidies.meta.campaign_year - 55,
    start_balance_bani: 3_500_000,
    demo_now: '2026-11-15T00:00:00Z',
    salary_bani,
    stripe_customer_id: 'cus_1',
    parcels: [
      { crop_id: 'grau', area_ari: 800, is_arable: true },
      { crop_id: 'porumb', area_ari: 700, is_arable: true },
    ],
    transactions: [],
    pension_plans: status ? [{ monthly_bani: 20_000, status, stripe_subscription_id: 'sub_1' }] : null,
  }) as never;

describe('POST /api/pension (step 7)', () => {
  it('accepts only the slider range from plan-params.json and starts the subscription', async () => {
    const { admin } = memoryAdmin();
    admin.farmByUser = async () => pensionFarm(null);
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
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ id: 'farm-1' }), 20_000, null);
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

describe('changing and stopping the pension', () => {
  const auth = { Authorization: 'Bearer good' };
  const withFarm = (farm: unknown) => {
    const { admin } = memoryAdmin();
    admin.farmByUser = async () => farm as never;
    return { admin, app: makeApp(admin) };
  };

  it('changes the amount inside the slider range, then fixes the salary again', async () => {
    const change = vi.spyOn(MoneyService.prototype, 'changePension').mockResolvedValue();
    const { admin, app } = withFarm(pensionFarm('active', 85_000));
    const { slider_min_lei, slider_max_lei } = data.params.pension;
    for (const bad of [slider_min_lei.value - 10, slider_max_lei.value + 10, 150.5]) {
      expect((await request(app).put('/api/pension').set(auth).send({ monthlyLei: bad })).status).toBe(400);
    }
    expect(change).not.toHaveBeenCalled();
    expect((await request(app).put('/api/pension').set(auth).send({ monthlyLei: 300 })).status).toBe(204);
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ id: 'farm-1' }), 30_000);
    expect(admin.setSalary).toHaveBeenCalledWith('farm-1', expect.any(Number));
    change.mockRestore();
  });

  it('stops it, and the salary is fixed at what is safe without it', async () => {
    const stop = vi.spyOn(MoneyService.prototype, 'stopPension').mockResolvedValue();
    // The repo is read again after the stop, so it already shows the plan stopped.
    const farms = [pensionFarm('active', 65_000), pensionFarm('stopped', 65_000)];
    const { admin } = memoryAdmin();
    admin.farmByUser = async () => farms.shift() ?? pensionFarm('stopped', 65_000);
    expect((await request(makeApp(admin)).delete('/api/pension').set(auth)).status).toBe(204);
    expect(stop).toHaveBeenCalledOnce();
    expect(admin.setSalary).toHaveBeenCalledWith('farm-1', 105_000);
    stop.mockRestore();
  });

  it('refuses both when no pension is running', async () => {
    for (const farm of [pensionFarm(null), pensionFarm('stopped')]) {
      const { admin, app } = withFarm(farm);
      expect((await request(app).put('/api/pension').set(auth).send({ monthlyLei: 300 })).body.error).toBe('no_pension');
      expect(admin.setSalary).not.toHaveBeenCalled();
    }
    expect((await request(withFarm(pensionFarm(null)).app).delete('/api/pension').set(auth)).status).toBe(409);
  });

  it('stopping a pension already stopped answers 204, without asking Stripe again (IDEM-06)', async () => {
    const stop = vi.spyOn(MoneyService.prototype, 'stopPension').mockResolvedValue();
    const { app } = withFarm(pensionFarm('stopped'));
    expect((await request(app).delete('/api/pension').set(auth)).status).toBe(204);
    expect(stop).not.toHaveBeenCalled();
    stop.mockRestore();
  });

  it('lets a stopped pension start again', async () => {
    const start = vi.spyOn(MoneyService.prototype, 'startPension').mockResolvedValue();
    const { app } = withFarm(pensionFarm('stopped'));
    expect((await request(app).post('/api/pension').set(auth).send({ monthlyLei: 200 })).status).toBe(201);
    start.mockRestore();
  });

  it('needs a farm', async () => {
    const { app } = withFarm(null);
    expect((await request(app).put('/api/pension').set(auth).send({ monthlyLei: 300 })).status).toBe(404);
    expect((await request(app).delete('/api/pension').set(auth)).status).toBe(404);
  });
});

describe('MoneyService pension changes', () => {
  const service = (calls: string[], sub: object = {}) => {
    const { admin } = memoryAdmin();
    const fake = {
      subscriptions: {
        retrieve: async () => ({ status: 'active', items: { data: [{ id: 'si_1' }] }, ...sub }),
        update: async (id: string, body: object) => void calls.push(`update ${id} ${JSON.stringify(body)}`),
        cancel: async (id: string, body: object) => void calls.push(`cancel ${id} ${JSON.stringify(body)}`),
      },
      prices: { list: async () => ({ data: [] }), create: async (p: { unit_amount: number }) => ({ id: `price_${p.unit_amount}` }) },
    } as unknown as Stripe;
    return { admin, money: new MoneyService(fake, admin, data, async () => {}) };
  };

  it('swaps the price from the next invoice, without charging or giving back for this month', async () => {
    const calls: string[] = [];
    const { admin, money } = service(calls);
    await money.changePension(pensionFarm('active') as never, 30_000);
    expect(calls).toEqual(['update sub_1 {"items":[{"id":"si_1","price":"price_30000"}],"proration_behavior":"none"}']);
    expect(admin.updatePension).toHaveBeenCalledWith('farm-1', { monthly_bani: 30_000 });
  });

  it('cancels now, keeps what was paid, and marks the plan stopped', async () => {
    const calls: string[] = [];
    const { admin, money } = service(calls);
    await money.stopPension(pensionFarm('active') as never);
    expect(calls).toEqual(['cancel sub_1 {"prorate":false}']);
    expect(admin.updatePension).toHaveBeenNthCalledWith(1, 'farm-1', { status: 'stopping' });
    expect(admin.updatePension).toHaveBeenLastCalledWith('farm-1', { status: 'stopped' });
  });

  it('finishes a stop that crashed after Stripe cancelled, without cancelling again (IDEM-06)', async () => {
    const calls: string[] = [];
    const { admin, money } = service(calls, { status: 'canceled' });
    const farm = { ...(pensionFarm('active') as object), pension_plans: [{ monthly_bani: 20_000, status: 'stopping', stripe_subscription_id: 'sub_1' }] };
    await money.stopPension(farm as never);
    expect(calls).toEqual([]);
    expect(admin.updatePension).toHaveBeenLastCalledWith('farm-1', { status: 'stopped' });
  });

  it('refuses to touch Stripe with no running pension', async () => {
    const calls: string[] = [];
    await expect(service(calls).money.stopPension(pensionFarm('stopped') as never)).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
