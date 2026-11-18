/* Money operations run twice do one thing (docs/idempotency-plan.md, step 12 in docs/10-plan.md). */
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type Stripe from 'stripe';
import { loadData } from '@cropcash/shared';
import { createApp } from './app';
import type { AdminRepo } from './db/admin';
import type { Repo } from './db/repo';
import { MoneyService } from './stripe/money';

const data = loadData();
const auth = { Authorization: 'Bearer good' };
const KEY_A = '0b6f7e2a-3c1d-4e5f-8a9b-1c2d3e4f5a6b';
const KEY_B = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';

const farmOf = (over: object = {}) =>
  ({
    id: 'farm-1',
    user_id: 'u',
    name: 'Ion Popescu',
    county: 'TR',
    birth_year: data.subsidies.meta.campaign_year - 55,
    start_balance_bani: 3_500_000,
    demo_now: '2026-11-15T00:00:00+00:00',
    salary_bani: 85_000,
    stripe_account_id: 'acct_1',
    stripe_customer_id: 'cus_1',
    test_clock_id: 'clock_1',
    parcels: [
      { crop_id: 'grau', area_ari: 800, is_arable: true },
      { crop_id: 'porumb', area_ari: 700, is_arable: true },
    ],
    transactions: [],
    pension_plans: null,
    ...over,
  }) as never;

function memoryAdmin(farm: unknown) {
  const leases = new Map<string, string>();
  const admin: AdminRepo = {
    farmByUser: async () => farm as never,
    farmBy: async () => farm as never,
    setStripeIds: vi.fn(async () => {}),
    recordTransaction: vi.fn(async () => {}),
    claimPayout: vi.fn(async () => null),
    finishPayout: vi.fn(async () => {}),
    setPayoutStatus: vi.fn(async () => 1),
    removePayoutTransaction: vi.fn(async () => {}),
    upsertPension: vi.fn(async () => {}),
    updatePension: vi.fn(async () => {}),
    setSalary: vi.fn(async () => {}),
    takeLease: vi.fn(async (farmerId: string, op: string, holder: string) => {
      if (leases.has(`${farmerId}:${op}`)) return false;
      leases.set(`${farmerId}:${op}`, holder);
      return true;
    }),
    releaseLease: vi.fn(async (farmerId: string, op: string, holder: string) => {
      if (leases.get(`${farmerId}:${op}`) === holder) leases.delete(`${farmerId}:${op}`);
    }),
  };
  return { admin, leases };
}

function appFor(farm: unknown, stripe: object = {}) {
  const { admin, leases } = memoryAdmin(farm);
  const money = new MoneyService(stripe as Stripe, admin, data, async () => {});
  const app = createApp({
    corsOrigins: [],
    verifyToken: async () => ({ userId: 'u' }),
    repo: {} as Repo,
    data,
    money: { money, admin, verifyWebhook: () => ({}) as never, demoMode: true, data },
  });
  return { app, admin, money, leases };
}

describe('the farm lease (M2)', () => {
  it('a second money call while one runs gets 409 busy and touches nothing', async () => {
    const { app, money, leases } = appFor(farmOf());
    leases.set('farm-1:pension', 'someone-else');
    leases.set('farm-1:demo_money', 'someone-else');
    leases.set('farm-1:stripe_setup', 'someone-else');
    const start = vi.spyOn(money, 'startPension');
    const advance = vi.spyOn(money, 'advanceTo');
    const setup = vi.spyOn(money, 'setup');
    expect((await request(app).post('/api/pension').set(auth).send({ monthlyLei: 200 })).body.error).toBe('busy');
    expect((await request(app).post('/api/demo/advance').set(auth).send({ months: 1 })).body.error).toBe('busy');
    expect((await request(app).post('/api/stripe/setup').set(auth).send({})).body.error).toBe('busy');
    expect(start).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
  });

  it('is given back after the call, even when it fails', async () => {
    const { app, money, leases } = appFor(farmOf());
    vi.spyOn(money, 'startPension').mockRejectedValue(new Error('stripe down'));
    expect((await request(app).post('/api/pension').set(auth).send({ monthlyLei: 200 })).status).toBe(500);
    expect(leases.size).toBe(0);
  });
});

describe('advance clock (IDEM-01)', () => {
  it('moves to `from` + months, not to the date it finds', async () => {
    const { app, money } = appFor(farmOf());
    const advance = vi.spyOn(money, 'advanceTo').mockResolvedValue([]);
    const res = await request(app).post('/api/demo/advance').set(auth).send({ months: 2, from: '2026-11-15T00:00:00+00:00' });
    expect(res.status).toBe(200);
    expect(advance).toHaveBeenCalledWith('farm-1', '2027-01-15T00:00:00.000Z');
  });

  it('the same tap again, once the clock is there, answers `already` and moves nothing', async () => {
    const { app, money } = appFor(farmOf({ demo_now: '2026-12-15T00:00:00+00:00' }));
    const advance = vi.spyOn(money, 'advanceTo');
    const res = await request(app).post('/api/demo/advance').set(auth).send({ months: 1, from: '2026-11-15T00:00:00+00:00' });
    expect(res.body).toEqual({ events: [], already: true });
    expect(advance).not.toHaveBeenCalled();
  });

  it('goes on from where a crashed run stopped', async () => {
    const { app, money } = appFor(farmOf({ demo_now: '2027-01-15T00:00:00+00:00' }));
    const advance = vi.spyOn(money, 'advanceTo').mockResolvedValue([]);
    await request(app).post('/api/demo/advance').set(auth).send({ months: 4, from: '2026-11-15T00:00:00+00:00' });
    expect(advance).toHaveBeenCalledWith('farm-1', '2027-03-15T00:00:00.000Z');
  });

  it('a tap from an old screen answers 409 stale_clock', async () => {
    const { app, money } = appFor(farmOf({ demo_now: '2027-05-15T00:00:00+00:00' }));
    const advance = vi.spyOn(money, 'advanceTo');
    const res = await request(app).post('/api/demo/advance').set(auth).send({ months: 1, from: '2026-11-15T00:00:00+00:00' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('stale_clock');
    expect(advance).not.toHaveBeenCalled();
  });
});

describe('salary payouts (IDEM-01)', () => {
  /** Enough money on hand for the plan to pay the fixed 850 lei. */
  const rich = () => farmOf({ start_balance_bani: 30_000_000 });
  const stripeWith = (created: { key?: string }[]) => ({
    balance: { retrieve: async () => ({ available: [{ currency: 'ron', amount: 10_000_000 }], pending: [] }) },
    payouts: {
      create: async (_body: object, opts: { idempotencyKey?: string }) => {
        created.push({ key: opts.idempotencyKey });
        return { id: `po_${created.length}` };
      },
    },
  });

  it('a payday already paid is not paid again', async () => {
    const created: { key?: string }[] = [];
    const { admin, money } = appFor(farmOf(), stripeWith(created));
    admin.claimPayout = vi.fn(async () => ({ status: 'pending', stripe_payout_id: 'po_old' }));
    const ev = await money.salary(rich(), '2026-12-01');
    expect(created).toEqual([]);
    expect(ev).toMatchObject({ ok: true, note: 'already_paid' });
  });

  it('a payday left half done by a crash is finished with the same Stripe key', async () => {
    const created: { key?: string }[] = [];
    const { admin, money } = appFor(farmOf(), stripeWith(created));
    admin.claimPayout = vi.fn(async () => ({ status: 'creating', stripe_payout_id: null }));
    await money.salary(rich(), '2026-12-01');
    expect(created).toEqual([{ key: 'cc:salary:farm-1:2026-12-01' }]);
    expect(admin.finishPayout).toHaveBeenCalledWith('farm-1', '2026-12-01', { stripe_payout_id: 'po_1', status: 'pending' });
  });

  it('a new payday is claimed, then paid once with its key', async () => {
    const created: { key?: string }[] = [];
    const { admin, money } = appFor(farmOf(), stripeWith(created));
    await money.salary(rich(), '2026-12-01');
    expect(admin.claimPayout).toHaveBeenCalledWith(expect.objectContaining({ farmer_id: 'farm-1', scheduled_for: '2026-12-01' }));
    expect(created).toEqual([{ key: 'cc:salary:farm-1:2026-12-01' }]);
  });
});

describe('simulated incomes (IDEM-01, IDEM-03)', () => {
  it('each income carries a key made from what it is', async () => {
    const keys: (string | undefined)[] = [];
    const stripe = {
      balance: { retrieve: async () => ({ available: [{ currency: 'ron', amount: 0 }], pending: [] }) },
      paymentIntents: {
        create: async (_b: object, opts: { idempotencyKey?: string }) => {
          keys.push(opts.idempotencyKey);
          // A replay: Stripe says so, and the money is already in the balance.
          return { id: 'pi_1', status: 'succeeded', lastResponse: { headers: { 'idempotent-replayed': 'true' } } };
        },
      },
    };
    const { admin, money } = appFor(farmOf(), stripe);
    await money.income(farmOf(), { type: 'income', kind: 'apia_advance', amount: 500_000, date: '2026-11-16' });
    expect(keys).toEqual(['cc:income:farm-1:apia_advance:2026-11-16:-']);
    expect(admin.recordTransaction).toHaveBeenCalledWith(expect.objectContaining({ stripe_object_id: 'pi_1' }));
  });

  it('the APIA advance asked for again once it arrived answers 200 `already`', async () => {
    const received = farmOf({
      transactions: [{ amount_bani: 1_000_000, kind: 'apia_advance', occurred_at: '2026-11-16T09:00:00Z', source: 'stripe_transfer', crop_id: null, category: null, expected_payment_id: null }],
    });
    const { app, money } = appFor(received);
    const income = vi.spyOn(money, 'income');
    const res = await request(app).post('/api/demo/income').set(auth).send({ kind: 'apia_advance' });
    expect(res.status).toBe(200);
    expect(res.body.already).toBe(true);
    expect(income).not.toHaveBeenCalled();
  });
});

describe('start pension (IDEM-02)', () => {
  const active = (start_key: string | null) =>
    farmOf({ pension_plans: [{ monthly_bani: 20_000, status: 'active', stripe_subscription_id: 'sub_1', start_key }] });

  it('the same key again gets 201 again, without a second subscription', async () => {
    const { app, money } = appFor(active(KEY_A));
    const start = vi.spyOn(money, 'startPension');
    const res = await request(app).post('/api/pension').set(auth).set('Idempotency-Key', KEY_A).send({ monthlyLei: 200 });
    expect(res.status).toBe(201);
    expect(start).not.toHaveBeenCalled();
  });

  it('another key, with a pension already running, gets 409', async () => {
    const { app } = appFor(active(KEY_A));
    const res = await request(app).post('/api/pension').set(auth).set('Idempotency-Key', KEY_B).send({ monthlyLei: 200 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('pension_exists');
  });

  it('takes over a subscription left running by a crash instead of making another', async () => {
    const calls: string[] = [];
    const stripe = {
      subscriptions: {
        list: async () => ({ data: [{ id: 'sub_left', metadata: { farmer_id: 'farm-1' }, items: { data: [{ price: { unit_amount: 20_000 } }] } }] }),
        create: async () => void calls.push('create sub'),
      },
      prices: { create: async () => void calls.push('create price') },
      invoices: { list: () => ({ [Symbol.asyncIterator]: async function* () {} }) },
    };
    const { admin, money } = appFor(farmOf(), stripe);
    await money.startPension(farmOf(), 20_000, KEY_A);
    expect(calls).toEqual([]);
    expect(admin.upsertPension).toHaveBeenCalledWith(expect.objectContaining({ stripe_subscription_id: 'sub_left', start_key: KEY_A }));
  });

  it('a new one sends Stripe keys made from the phone key', async () => {
    const keys: (string | undefined)[] = [];
    const stripe = {
      subscriptions: {
        list: async () => ({ data: [] }),
        create: async (_b: object, o: { idempotencyKey?: string }) => (keys.push(o.idempotencyKey), { id: 'sub_new', items: { data: [] } }),
      },
      prices: { create: async (_b: object, o: { idempotencyKey?: string }) => (keys.push(o.idempotencyKey), { id: 'price_1' }) },
      invoices: { list: () => ({ [Symbol.asyncIterator]: async function* () {} }) },
    };
    const { money } = appFor(farmOf(), stripe);
    await money.startPension(farmOf(), 20_000, KEY_A);
    expect(keys).toEqual([`cc:pension-price:farm-1:${KEY_A}`, `cc:pension-sub:farm-1:${KEY_A}`]);
  });
});

describe('Stripe setup (IDEM-04)', () => {
  it('every create sends a key built from the farm, so a retry after a failure reuses what was made', async () => {
    const keys: string[] = [];
    const keyed = (id: string) => async (...args: unknown[]) => {
      const opts = args.at(-1) as { idempotencyKey?: string } | undefined;
      if (opts?.idempotencyKey) keys.push(opts.idempotencyKey);
      return { id };
    };
    const stripe = {
      v2: { core: { accounts: { create: keyed('acct_new'), update: keyed('acct_new') } } },
      accounts: { createExternalAccount: keyed('ba_1'), update: keyed('acct_new') },
      testHelpers: { testClocks: { create: async () => ({ id: 'clock_new' }) } },
      customers: { create: keyed('cus_new'), update: keyed('cus_new') },
      paymentMethods: { attach: keyed('pm_1') },
    };
    const bare = farmOf({ stripe_account_id: null, stripe_customer_id: null, test_clock_id: null });
    const { money } = appFor(bare, stripe);
    await money.setup(bare, 'ion@example.com', '127.0.0.1');
    expect(keys).toEqual([
      'cc:setup-account:farm-1',
      'cc:setup-bank:farm-1',
      'cc:setup-customer:farm-1:clock_new',
      'cc:setup-pm:cus_new',
    ]);
  });
});
