import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { loadData } from '@cropcash/shared';
import { createApp } from './app';
import type { FarmRow, Repo } from './db/repo';
import { addMonthsToDate, advanceFarm, runMonth, salaryMonths, salaryToPay } from './jobs/payoutScheduler';
import { assertTestKey, type StripeGateway } from './stripe/gateway';
import type { Ledger, StripeFarm } from './stripe/ledger';

const data = loadData();
const verifyToken = async (token: string) => {
  if (token !== 'good') throw new Error('bad');
  return { userId: 'u1' };
};
const auth = { Authorization: 'Bearer good' };
const year = data.subsidies.meta.campaign_year;

/** What Supabase does: money facts, each applied once per Stripe object. */
function fakeLedger(farm: StripeFarm) {
  const seen = new Set<string>();
  const once = (key: string) => (seen.has(key) ? false : (seen.add(key), true));
  const add = (row: object) => {
    farm.transactions = [...(farm.transactions ?? []), row as never];
  };
  const payouts = new Map<string, { id: string; amount_bani: number; scheduled_for: string; status: string; stripeId?: string }>();
  const sync = () => {
    farm.payouts = [...payouts.values()];
  };
  const ledger: Ledger = {
    farmById: async () => farm,
    farmByCustomer: async (c) => (c === farm.stripe_customer_id ? farm : null),
    saveStripeIds: async (_id, ids) => void Object.assign(farm, ids),
    setAppDate: async (_id, date) => void (farm.app_date = date),
    applyIncome: async (i) => {
      if (!once(i.objectId)) return false;
      add({ id: i.objectId, kind: null, category: i.category, crop_id: i.cropId ?? null, amount_bani: i.amountBani, occurred_at: i.at, note: null, source: 'stripe_transfer' });
      return true;
    },
    applyPlannedCost: async (c) => {
      if (!once(c.key)) return false;
      add({ id: c.key, kind: 'expense', category: 'field_work', crop_id: c.cropId ?? null, amount_bani: -c.amountBani, occurred_at: `${c.date}T12:00:00Z`, note: c.note ?? null, source: 'manual' });
      return true;
    },
    claimPayout: async (_id, amount, day) => {
      if (payouts.has(day)) return null;
      payouts.set(day, { id: day, amount_bani: amount, scheduled_for: day, status: 'scheduled' });
      sync();
      return day;
    },
    markPayout: async (id, stripeId) => {
      Object.assign(payouts.get(id)!, stripeId ? { stripeId, status: 'pending' } : { status: 'failed' });
      sync();
    },
    payoutPaid: async (stripeId) => {
      const p = [...payouts.values()].find((x) => x.stripeId === stripeId);
      if (!p || p.status === 'paid') return false;
      p.status = 'paid';
      add({ id: stripeId, kind: null, category: 'salary', crop_id: null, amount_bani: -p.amount_bani, occurred_at: `${p.scheduled_for}T12:00:00Z`, note: null, source: 'payout' });
      sync();
      return true;
    },
    payoutFailed: async (stripeId) => {
      const p = [...payouts.values()].find((x) => x.stripeId === stripeId);
      if (p && p.status !== 'paid') p.status = 'failed';
      sync();
    },
    invoicePaid: async (_id, amount, at, invoiceId) => {
      if (!once(invoiceId)) return false;
      add({ id: invoiceId, kind: null, category: 'pension', crop_id: null, amount_bani: -amount, occurred_at: at, note: null, source: 'subscription' });
      return true;
    },
    savePension: async (_id, monthly) => {
      farm.pension_plans = [{ monthly_bani: monthly, status: 'active' }];
    },
  };
  return ledger;
}

function fakeGateway(over: Partial<StripeGateway> = {}) {
  const gateway = {
    createAccount: vi.fn(async () => 'acct_1'),
    createClock: vi.fn(async () => 'clock_1'),
    createCustomer: vi.fn(async () => 'cus_1'),
    sendIncome: vi.fn(async ({ key }: { key: string }) => `pi_${key}`),
    payOut: vi.fn(async ({ month }: { month: string }) => `po_${month}`),
    subscribe: vi.fn(async () => 'sub_1'),
    advanceClock: vi.fn(async () => {}),
    parseEvent: vi.fn((raw: Buffer, sig: string) => {
      if (sig !== 'signed') throw new Error('bad signature');
      return JSON.parse(raw.toString());
    }),
    ...over,
  };
  return gateway as typeof gateway & StripeGateway;
}

const ionFarm = (over: Partial<StripeFarm> = {}): StripeFarm => ({
  id: 'farm-1',
  name: 'Ion',
  county: 'TR',
  birth_year: year - 55,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
  stripe_account_id: null,
  stripe_customer_id: null,
  test_clock_id: null,
  ...over,
});
const withStripe = (over: Partial<StripeFarm> = {}) =>
  ionFarm({ stripe_account_id: 'acct_1', stripe_customer_id: 'cus_1', test_clock_id: 'clock_1', app_date: '2026-11-07', ...over });

function setup(farm: StripeFarm | null = ionFarm(), { demoMode = true, gateway = fakeGateway() } = {}) {
  const ledger = fakeLedger(farm ?? ionFarm());
  const repo = { getMyFarm: async () => farm as FarmRow | null } as unknown as Repo;
  const app = createApp({
    corsOrigins: [],
    verifyToken,
    repo,
    data,
    now: () => new Date('2026-11-07T10:00:00Z'),
    getRates: async () => null,
    money: { gateway, ledger, demoMode },
  });
  return { app, gateway, ledger, farm: farm! };
}
const deps = (gateway: StripeGateway, ledger: Ledger) => ({ gateway, ledger, data, params: {} });

const webhook = (app: ReturnType<typeof createApp>, event: object, signature = 'signed') =>
  request(app).post('/api/webhooks/stripe').set('stripe-signature', signature).set('content-type', 'application/json').send(JSON.stringify(event));
const event = (type: string, object: object, livemode = false) => ({ type, livemode, data: { object } });
const entries = (farm: StripeFarm, category: string) => (farm.transactions ?? []).filter((t) => t.category === category);

describe('test keys only', () => {
  it('refuses a live or restricted key', () => {
    expect(() => assertTestKey('sk_live_abc')).toThrow();
    expect(() => assertTestKey('rk_test_abc')).toThrow();
    expect(() => assertTestKey('sk_test_abc')).not.toThrow();
  });
});

describe('dates', () => {
  it('keeps the day inside shorter months', () => {
    expect(addMonthsToDate('2026-12-31', 2)).toBe('2027-02-28');
    expect(addMonthsToDate('2026-11-07', 6)).toBe('2027-05-07');
  });

  it('counts each salary day passed, the 1st of the month', () => {
    expect(salaryMonths('2026-11-07', '2027-05-07')).toEqual(['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);
    expect(salaryMonths('2026-11-07', '2026-11-20')).toEqual([]);
  });
});

describe('simulate advance', () => {
  it('sets up Stripe once, saves the money and proposes the split at once', async () => {
    const { app, gateway, farm } = setup();
    const res = await request(app).post('/api/demo/simulate-advance').set(auth);
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(1264932);
    expect(Object.values(res.body.split as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(1264932);
    expect(farm.stripe_account_id).toBe('acct_1');
    expect(gateway.createAccount).toHaveBeenCalledTimes(1);
    expect(entries(farm, 'apia_advance')).toHaveLength(1);
  });

  it('refuses a second advance', async () => {
    const { app } = setup();
    await request(app).post('/api/demo/simulate-advance').set(auth);
    const again = await request(app).post('/api/demo/simulate-advance').set(auth);
    expect(again.body.error).toBe('already_received');
  });

  it('counts the advance once, even when the webhook repeats it', async () => {
    const { app, farm } = setup();
    await request(app).post('/api/demo/simulate-advance').set(auth);
    const objectId = entries(farm, 'apia_advance')[0]!.id;
    const paid = event('payment_intent.succeeded', { id: objectId, amount: 1264932, created: 1, metadata: { farmer_id: 'farm-1', kind: 'apia_advance' } });
    expect((await webhook(app, paid)).status).toBe(200);
    expect((await webhook(app, paid)).status).toBe(200);
    expect(entries(farm, 'apia_advance')).toHaveLength(1);
  });

  it('is hidden without DEMO_MODE', async () => {
    const { app } = setup(ionFarm(), { demoMode: false });
    expect((await request(app).post('/api/demo/simulate-advance').set(auth)).status).toBe(404);
    expect((await request(app).post('/api/demo/advance-clock').set(auth).send({ months: 6 })).status).toBe(404);
  });

  it('needs a session', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/demo/simulate-advance')).status).toBe(401);
  });
});

describe('webhooks', () => {
  it('refuses a bad signature and a live event, and changes nothing', async () => {
    const { app, farm } = setup(withStripe());
    const paid = event('payment_intent.succeeded', { id: 'pi_x', amount: 5, created: 1, metadata: { farmer_id: 'farm-1', kind: 'apia_advance' } });
    expect((await webhook(app, paid, 'forged')).status).toBe(400);
    expect((await webhook(app, event(paid.type, paid.data.object, true))).status).toBe(400);
    expect(entries(farm, 'apia_advance')).toHaveLength(0);
  });

  it('ignores payments that are not farm income', async () => {
    const { app, farm } = setup(withStripe());
    const other = event('payment_intent.succeeded', { id: 'pi_y', amount: 5, created: 1, metadata: {} });
    expect((await webhook(app, other)).status).toBe(200);
    expect(farm.transactions ?? []).toHaveLength(0);
  });

  it('marks a salary paid once, and a failed one as failed', async () => {
    const farm = withStripe();
    const { app, gateway, ledger } = setup(farm);
    await received(ledger);
    await runMonth(deps(gateway, ledger), 'farm-1', '2026-12');
    const paid = event('payout.paid', { id: 'po_2026-12' });
    await webhook(app, paid);
    await webhook(app, paid);
    expect(entries(farm, 'salary')).toHaveLength(1);
    await runMonth(deps(gateway, ledger), 'farm-1', '2027-01');
    await webhook(app, event('payout.failed', { id: 'po_2027-01' }));
    expect(farm.payouts!.find((p) => p.scheduled_for === '2027-01-01')!.status).toBe('failed');
  });

  it('adds each pension payment once, for the right farmer', async () => {
    const { app, farm } = setup(withStripe());
    const inv = (id: string, customer = 'cus_1') =>
      event('invoice.paid', { id, customer, amount_paid: 5_000, created: 1, status_transitions: { paid_at: 1_800_000_000 } });
    await webhook(app, inv('in_1'));
    await webhook(app, inv('in_1'));
    await webhook(app, inv('in_2', 'cus_someone_else'));
    expect(entries(farm, 'pension')).toHaveLength(1);
  });
});

const received = (ledger: Ledger) =>
  ledger.applyIncome({ farmerId: 'farm-1', amountBani: 1264932, at: '2026-11-07T12:00:00Z', category: 'apia_advance', objectId: 'pi_a' });

describe('the clock', () => {
  it('steps at most 2 months, and pays 6 salaries for 6 months', async () => {
    const farm = withStripe();
    const steps: string[] = [];
    const gateway = fakeGateway({
      advanceClock: async (_clock, date) => {
        steps.push(date);
      },
    });
    const { ledger } = setup(farm, { gateway });
    await received(ledger);
    await advanceFarm(deps(gateway, ledger), 'farm-1', 'clock_1', '2026-11-07', 6);
    expect(steps).toEqual(['2027-01-07', '2027-03-07', '2027-05-07']);
    expect(farm.payouts).toHaveLength(6);
    expect(farm.payouts!.map((p) => p.scheduled_for.slice(0, 7))).toEqual(['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);
    expect(farm.app_date).toBe('2027-05-07');
  });

  it('pays the same salaries whether Stripe confirms at once or much later', async () => {
    const run = async (confirmAtOnce: boolean) => {
      const farm = withStripe();
      const gateway = fakeGateway({ payOut: async ({ month }) => `po_${month}` });
      const { ledger } = setup(farm, { gateway });
      const mark = ledger.markPayout;
      ledger.markPayout = async (id, stripeId) => {
        await mark(id, stripeId);
        if (confirmAtOnce && stripeId) await ledger.payoutPaid(stripeId);
      };
      await received(ledger);
      await advanceFarm(deps(gateway, ledger), 'farm-1', 'clock_1', '2026-11-07', 6);
      return farm.payouts!.map((p) => p.amount_bani);
    };
    const late = await run(false);
    expect(late).toHaveLength(6);
    expect(new Set(late).size).toBe(1);
    expect(await run(true)).toEqual(late);
  });

  it('follows the salary rule', () => {
    expect(salaryToPay(95_000, null, false)).toBe(95_000);
    expect(salaryToPay(110_000, 95_000, false)).toBe(95_000);
    expect(salaryToPay(170_000, 95_000, true)).toBe(170_000);
    expect(salaryToPay(60_000, 95_000, false)).toBe(60_000);
  });

  it('brings in the APIA balance in March and books the planned costs', async () => {
    const farm = withStripe();
    const { gateway, ledger } = setup(farm);
    await advanceFarm(deps(gateway, ledger), 'farm-1', 'clock_1', '2026-11-07', 6);
    const balance = entries(farm, 'apia_balance');
    expect(balance).toHaveLength(1);
    expect(balance[0]!.occurred_at.slice(0, 7)).toBe('2027-03');
    expect(entries(farm, 'field_work').length).toBeGreaterThan(0);
  });

  it('never pays or books twice if a month runs again', async () => {
    const farm = withStripe();
    const { gateway, ledger } = setup(farm);
    await received(ledger);
    await runMonth(deps(gateway, ledger), 'farm-1', '2027-03');
    const after = (farm.transactions ?? []).length;
    await runMonth(deps(gateway, ledger), 'farm-1', '2027-03');
    expect(gateway.payOut).toHaveBeenCalledTimes(1);
    expect(farm.transactions ?? []).toHaveLength(after);
  });

  it('marks a salary failed when the account has too little', async () => {
    const farm = withStripe();
    const gateway = fakeGateway({ payOut: vi.fn(async () => null) });
    const { ledger } = setup(farm, { gateway });
    await received(ledger);
    await runMonth(deps(gateway, ledger), 'farm-1', '2026-12');
    expect(farm.payouts![0]!.status).toBe('failed');
  });

  it('answers at once, refuses a second run, and needs money first', async () => {
    const { app } = setup(withStripe());
    const gate = setup(withStripe(), { gateway: fakeGateway({ advanceClock: () => new Promise(() => {}) }) });
    expect((await request(gate.app).post('/api/demo/advance-clock').set(auth).send({ months: 6 })).status).toBe(202);
    expect((await request(gate.app).post('/api/demo/advance-clock').set(auth).send({ months: 6 })).body.error).toBe('busy');
    expect((await request(app).post('/api/demo/advance-clock').set(auth).send({ months: 99 })).status).toBe(400);
    const early = setup(ionFarm());
    expect((await request(early.app).post('/api/demo/advance-clock').set(auth).send({ months: 6 })).body.error).toBe('no_money_yet');
  });
});

describe('start_pension', () => {
  it("refuses less than the chosen fund's minimum", async () => {
    const { app, gateway } = setup(ionFarm({ pension_fund_id: 'raiffeisen-acumulare' }));
    const res = await request(app).post('/api/pension').set(auth).send({ monthly: 5_000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'below_minimum', minimum: 10_000 });
    expect(gateway.subscribe).not.toHaveBeenCalled();
  });

  it('starts once, and the salary then leaves room for it', async () => {
    const { app, gateway, farm } = setup(ionFarm());
    expect((await request(app).post('/api/pension').set(auth).send({ monthly: 5_000 })).status).toBe(201);
    expect(gateway.subscribe).toHaveBeenCalledWith('cus_1', 5_000);
    expect(farm.pension_plans).toEqual([{ monthly_bani: 5_000, status: 'active' }]);
    expect((await request(app).post('/api/pension').set(auth).send({ monthly: 5_000 })).body.error).toBe('already_started');
  });
});

describe('without Stripe', () => {
  it('has no money routes, and the rest still works', async () => {
    const repo = { getMyFarm: async () => ionFarm() } as unknown as Repo;
    const app = createApp({ corsOrigins: [], verifyToken, repo, data, getRates: async () => null });
    expect((await request(app).post('/api/webhooks/stripe').send('{}')).status).toBe(401);
    expect((await request(app).post('/api/pension').set(auth).send({ monthly: 5_000 })).status).toBe(404);
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});
