/**
 * Runs the real money flow on the Stripe sandbox, with an in-memory database, then replays the
 * events Stripe really produced through the real webhook route, each twice, and closes what it
 * made. Not part of `npm test`: it needs the test key and network.
 *   npx tsx --env-file=.env apps/api/src/stripe/sandbox.e2e.ts
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import Stripe from 'stripe';
import { loadData } from '@cropcash/shared';
import { advanceFarm } from '../jobs/payoutScheduler';
import { webhooksRouter } from '../routes/webhooks';
import { stripeGateway } from './gateway';
import type { Ledger, StripeFarm } from './ledger';

const key = process.env.STRIPE_SECRET_KEY ?? '';
const secret = 'whsec_e2e';
const gateway = stripeGateway(key, secret);
const stripe = new Stripe(key);
const data = loadData();
const farmerId = `e2e-${Date.now()}`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const farm: StripeFarm = {
  id: farmerId,
  name: 'Ion E2E',
  county: 'TR',
  birth_year: data.subsidies.meta.campaign_year - 55,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
  stripe_account_id: null,
  stripe_customer_id: null,
  test_clock_id: null,
  transactions: [],
  payouts: [],
};
const stripeIds = new Map<string, string>();
const payoutMonths: { id: string; stripeId: string }[] = [];
const add = (row: object) => farm.transactions!.push(row as never);
const seen = new Set<string>();
const ledger = {
  farmById: async () => farm,
  setAppDate: async (_: string, date: string) => void (farm.app_date = date),
  applyIncome: async (i: { amountBani: number; at: string; category: string; objectId: string }) => {
    if (seen.has(i.objectId)) return false;
    seen.add(i.objectId);
    add({ id: i.objectId, kind: null, category: i.category, crop_id: null, amount_bani: i.amountBani, occurred_at: i.at, note: null, source: 'stripe_transfer' });
    return true;
  },
  applyPlannedCost: async (c: { amountBani: number; date: string; key: string; note?: string }) => {
    if (seen.has(c.key)) return false;
    seen.add(c.key);
    add({ id: c.key, kind: 'expense', category: 'field_work', crop_id: null, amount_bani: -c.amountBani, occurred_at: `${c.date}T12:00:00Z`, note: c.note ?? null, source: 'manual' });
    return true;
  },
  claimPayout: async (_: string, amount: number, day: string) => {
    if (farm.payouts!.some((p) => p.scheduled_for === day)) return null;
    farm.payouts!.push({ id: day, amount_bani: amount, scheduled_for: day, status: 'scheduled' });
    return day;
  },
  markPayout: async (id: string, stripeId: string | null) => {
    const row = farm.payouts!.find((p) => p.id === id)!;
    row.status = stripeId ? 'pending' : 'failed';
    if (stripeId) {
      stripeIds.set(id, stripeId);
      payoutMonths.push({ id, stripeId });
    }
  },
  farmByCustomer: async (c: string) => (c === farm.stripe_customer_id ? farm : null),
  payoutPaid: async (stripeId: string) => {
    const id = [...stripeIds].find(([, v]) => v === stripeId)?.[0];
    const row = farm.payouts!.find((p) => p.id === id);
    if (!row || row.status === 'paid') return false;
    row.status = 'paid';
    add({ id: stripeId, kind: null, category: 'salary', crop_id: null, amount_bani: -row.amount_bani, occurred_at: `${row.scheduled_for}T12:00:00Z`, note: null, source: 'payout' });
    return true;
  },
  payoutFailed: async () => {},
  invoicePaid: async (_: string, amount: number, at: string, invoiceId: string) => {
    if (seen.has(invoiceId)) return false;
    seen.add(invoiceId);
    add({ id: invoiceId, kind: null, category: 'pension', crop_id: null, amount_bani: -amount, occurred_at: at, note: null, source: 'subscription' });
    return true;
  },
} as unknown as Ledger;

async function main() {
  let customer = '';
  const today = '2026-11-07';
  try {
    farm.stripe_account_id = await gateway.createAccount({ id: farmerId, name: farm.name! });
    farm.test_clock_id = await gateway.createClock(today);
    customer = await gateway.createCustomer(farmerId, farm.test_clock_id);
    farm.stripe_customer_id = customer;
    farm.app_date = today;
    console.log('account, clock and customer made');

    const amount = 1_264_932;
    const objectId = await gateway.sendIncome({ accountId: farm.stripe_account_id, farmerId, amount, kind: 'apia_advance', key: `e2e-${farmerId}` });
    await ledger.applyIncome({ farmerId, amountBani: amount, at: `${today}T12:00:00Z`, category: 'apia_advance', objectId });
    console.log('advance sent');

    const again = await gateway.sendIncome({ accountId: farm.stripe_account_id, farmerId, amount, kind: 'apia_advance', key: `e2e-${farmerId}` });
    console.log('same key gives the same payment:', again === objectId);

    await gateway.subscribe(customer, 5_000);
    farm.pension_plans = [{ monthly_bani: 5_000, status: 'active' }];
    console.log('pension started');

    await wait(8_000); // the transfer needs a few seconds
    const started = Date.now();
    await advanceFarm({ gateway, ledger, data, params: {} }, farmerId, farm.test_clock_id, today, 6);
    console.log(`clock moved 6 months in ${Math.round((Date.now() - started) / 1000)}s, app date ${farm.app_date}`);

    console.log('salaries', farm.payouts!.map((p) => `${p.scheduled_for.slice(0, 7)} ${p.amount_bani / 100} ${p.status}`).join(' | '));
    await wait(20_000);
    const statuses = await Promise.all(
      payoutMonths.map(async (p) => (await stripe.payouts.retrieve(p.stripeId, {}, { stripeAccount: farm.stripe_account_id! })).status),
    );
    console.log('payouts on Stripe:', statuses.join(','));
    const invoices = await stripe.invoices.list({ customer, limit: 20 });
    console.log('invoices:', invoices.data.map((i) => i.status).join(','));

    const hook = express();
    hook.use('/api', webhooksRouter(gateway, ledger));
    const server = hook.listen(0);
    const post = async (event: Stripe.Event) => {
      const payload = JSON.stringify(event);
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhooks/stripe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret }) },
        body: payload,
      });
      return res.status;
    };
    const platform = await stripe.events.list({ types: ['invoice.paid', 'payment_intent.succeeded'], limit: 100 });
    const onAccount = await stripe.events.list({ type: 'payout.paid', limit: 100 }, { stripeAccount: farm.stripe_account_id });
    const mine = platform.data.filter((ev) => {
      const o = ev.data.object as unknown as { customer?: string; metadata?: Record<string, string> };
      return o.customer === customer || o.metadata?.farmer_id === farmerId;
    });
    const events = [...mine, ...onAccount.data];
    console.log('real events:', events.map((ev) => ev.type).sort().join(','));
    const codes = new Set<number>();
    for (const ev of [...events, ...events]) codes.add(await post(ev));
    server.close();
    const count = (c: string) => farm.transactions!.filter((t) => t.category === c).length;
    console.log('webhook answers:', [...codes].join(','));
    console.log('after replaying each twice:', count('salary'), 'salaries,', count('pension'), 'pension payments,', count('apia_advance'), 'advance,', count('apia_balance'), 'APIA balance');
    console.log('salary rows:', farm.payouts!.map((p) => p.status).join(','));

    const balance = await stripe.balance.retrieve({}, { stripeAccount: farm.stripe_account_id });
    console.log('left in the account:', balance.available[0]?.amount, 'bani available,', balance.pending[0]?.amount, 'pending');
  } finally {
    if (farm.test_clock_id) await stripe.testHelpers.testClocks.del(farm.test_clock_id).catch(() => {});
    if (farm.stripe_account_id) {
      await stripe
        .rawRequest('POST', `/v2/core/accounts/${farm.stripe_account_id}/close`, { applied_configurations: ['recipient'] }, { apiVersion: '2026-10-28.endive' })
        .catch((e: Error) => console.log('close:', e.message.slice(0, 120)));
    }
    console.log('cleaned up');
  }
}

void main();
