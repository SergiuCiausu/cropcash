import Stripe from 'stripe';
import {
  computeFarmPlan,
  loadData,
  simulationSteps,
  type AppData,
  type SimStep,
} from '@cropcash/shared';
import type { AdminRepo, MoneyFarm } from '../db/admin';
import { countyCity } from './kyc';

/**
 * The money flow from docs/08-stripe.md (§1b, verified on the sandbox):
 * farmer = Accounts v2 recipient (no Stripe dashboard), APIA payment = test destination
 * charge, salary = manual payout, pension = subscription on a Test Clock customer.
 */

const RO_TEST_IBAN = 'RO49AAAA1B31007593840000';
/** Stripe can't move a test clock more than two billing periods at once. */
const MAX_CLOCK_STEP_MONTHS = 2;

export function createStripe(secretKey: string): Stripe {
  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('CropCash only runs Stripe in test mode: STRIPE_SECRET_KEY must start with sk_test_');
  }
  return new Stripe(secretKey);
}

const iso = (unix: number) => new Date(unix * 1000).toISOString();
const unix = (isoDate: string) => Math.floor(Date.parse(isoDate) / 1000);

function addMonthsIso(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

export interface AdvanceEvent {
  type: SimStep['type'] | 'pension';
  date: string;
  amount: number;
  kind?: string;
  /** Stripe object id (invoice for pension rows). */
  id?: string;
  ok: boolean;
  note?: string;
}

export class MoneyService {
  constructor(
    private stripe: Stripe,
    private repo: AdminRepo,
    private data: AppData = loadData(),
    private sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
    /** Optional progress log (tests, debugging the demo). */
    private log: (msg: string) => void = () => {},
  ) {}

  /**
   * Creates (once) the farmer's Stripe account, demo clock and customer. Idempotent.
   * `startAt` (unix seconds) fixes the demo clock's start; the seed uses it, the app uses now.
   */
  async setup(farm: MoneyFarm, email: string | undefined, ip: string, startAt?: number): Promise<MoneyFarm> {
    let { stripe_account_id: acct, test_clock_id: clock, stripe_customer_id: customer } = farm;
    const [given, ...rest] = farm.name.trim().split(/\s+/);

    if (!acct) {
      const account = await this.stripe.v2.core.accounts.create({
        display_name: farm.name,
        // Required for recipient accounts; a placeholder keeps demo accounts without email working.
        contact_email: email ?? `fermier-${farm.id.slice(0, 8)}@cropcash.test`,
        identity: { country: 'ro', entity_type: 'individual' },
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
        defaults: { currency: 'ron', responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
        dashboard: 'none',
        metadata: { farmer_id: farm.id },
      });
      acct = account.id;
      // Test identity data (docs/08 §1b): the farmer never sees Stripe.
      await this.stripe.v2.core.accounts.update(acct, {
        defaults: { profile: { business_url: 'https://cropcash.test', product_description: 'Fermier (cont de test CropCash)' } },
        identity: {
          attestations: { terms_of_service: { account: { date: new Date().toISOString(), ip } } },
          individual: {
            given_name: given ?? farm.name,
            surname: rest.join(' ') || 'Test',
            date_of_birth: { day: 1, month: 1, year: 1901 },
            address: { country: 'ro', line1: 'address_full_match', city: countyCity(farm.county), postal_code: '000000' },
          },
        },
      });
      await this.stripe.accounts.createExternalAccount(acct, {
        external_account: { object: 'bank_account', country: 'RO', currency: 'ron', account_number: RO_TEST_IBAN },
      });
      // Salaries only when the app asks (default would pay out the whole balance daily).
      await this.stripe.accounts.update(acct, { settings: { payouts: { schedule: { interval: 'manual' } } } });
      await this.repo.setStripeIds(farm.id, { stripe_account_id: acct });
    }

    if (!clock) {
      const now = startAt ?? Math.floor(Date.now() / 1000);
      const tc = await this.stripe.testHelpers.testClocks.create({ frozen_time: now, name: `CropCash ${farm.id.slice(0, 8)}` });
      clock = tc.id;
      await this.repo.setStripeIds(farm.id, { test_clock_id: clock, demo_now: iso(now) });
    }

    if (!customer) {
      const c = await this.stripe.customers.create({ name: farm.name, email, test_clock: clock, metadata: { farmer_id: farm.id } });
      const pm = await this.stripe.paymentMethods.attach('pm_card_visa', { customer: c.id });
      await this.stripe.customers.update(c.id, { invoice_settings: { default_payment_method: pm.id } });
      customer = c.id;
      await this.repo.setStripeIds(farm.id, { stripe_customer_id: customer });
    }

    return (await this.repo.farmBy('id', farm.id))!;
  }

  /** A simulated income (APIA, harvest) paid to the farmer's account. */
  async income(farm: MoneyFarm, step: Extract<SimStep, { type: 'income' }>): Promise<AdvanceEvent> {
    if (!farm.stripe_account_id) throw new Error('no stripe account');
    const before = await this.available(farm.stripe_account_id);
    const pi = await this.stripe.paymentIntents.create({
      amount: step.amount,
      currency: 'ron',
      payment_method: 'pm_card_bypassPending',
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      transfer_data: { destination: farm.stripe_account_id },
      description: `Simulare ${step.kind} (test)`,
      metadata: { farmer_id: farm.id, kind: step.kind, demo_date: step.date, crop_id: step.cropId ?? '' },
    });
    await this.repo.recordTransaction({
      farmer_id: farm.id,
      amount_bani: step.amount,
      kind: step.kind,
      occurred_at: `${step.date}T09:00:00Z`,
      source: 'stripe_transfer',
      stripe_object_id: pi.id,
      crop_id: step.cropId ?? null,
      expected_payment_id: step.paymentId ?? null,
    });
    // The transfer shows up in the farmer's balance a few seconds later: wait, so a salary
    // paid right after (same "Dăm timpul înainte") finds the money.
    for (let i = 0; i < 30 && (await this.available(farm.stripe_account_id)) < before + step.amount; i++) {
      await this.sleep(1000);
    }
    return { type: 'income', kind: step.kind, date: step.date, amount: step.amount, ok: pi.status === 'succeeded' };
  }

  private async available(account: string): Promise<number> {
    const balance = await this.stripe.balance.retrieve({}, { stripeAccount: account });
    return balance.available.find((b) => b.currency === 'ron')?.amount ?? 0;
  }

  /** A declared credit repaid from the farmer's bank: recorded once, no Stripe. */
  async repayment(farm: MoneyFarm, step: Extract<SimStep, { type: 'repayment' }>): Promise<AdvanceEvent> {
    await this.repo.recordTransaction({
      farmer_id: farm.id,
      amount_bani: -step.amount,
      kind: 'loan_repayment',
      occurred_at: `${step.date}T09:00:00Z`,
      source: 'manual',
      stripe_object_id: `sim:${farm.id}:repay:${step.paymentId}`,
      expected_payment_id: step.paymentId,
    });
    return { type: 'repayment', kind: 'loan_repayment', date: step.date, amount: step.amount, ok: true };
  }

  /** A planned farm cost that is now paid. The farmer pays it from their bank: no Stripe call. */
  async expense(farm: MoneyFarm, step: Extract<SimStep, { type: 'expense' }>): Promise<AdvanceEvent> {
    await this.repo.recordTransaction({
      farmer_id: farm.id,
      amount_bani: -step.amount,
      kind: 'expense',
      occurred_at: `${step.date}T12:00:00Z`,
      source: 'manual',
      // Deterministic id: the same planned cost is never recorded twice.
      stripe_object_id: `sim:${farm.id}:${step.id}`,
      crop_id: step.cropId,
    });
    return { type: 'expense', kind: step.cropId, date: step.date, amount: step.amount, ok: true };
  }

  /** The monthly salary: the plan's safe amount on payday, paid out to the test IBAN. */
  async salary(farm: MoneyFarm, payday: string): Promise<AdvanceEvent> {
    if (!farm.stripe_account_id) throw new Error('no stripe account');
    const plan = computeFarmPlan({ ...farm, demo_now: `${payday}T00:00:00Z` }, this.data);
    // The fixed salary, lowered only if the money would run out (step 9).
    const amount = plan.monthlySalary;
    if (amount <= 0) return { type: 'salary', date: payday, amount: 0, ok: false, note: 'no_salary' };

    // A transfer just made can take a few seconds to become available: wait while it is pending.
    let available = 0;
    for (let i = 0; i < 10; i++) {
      const balance = await this.stripe.balance.retrieve({}, { stripeAccount: farm.stripe_account_id });
      available = balance.available.find((b) => b.currency === 'ron')?.amount ?? 0;
      const pending = balance.pending.find((b) => b.currency === 'ron')?.amount ?? 0;
      if (available >= amount || available + pending < amount) break;
      await this.sleep(1000);
    }
    if (available < amount) {
      await this.repo.recordPayout({ farmer_id: farm.id, amount_bani: amount, scheduled_for: payday, stripe_payout_id: null, status: 'failed' });
      return { type: 'salary', date: payday, amount, ok: false, note: 'insufficient_stripe_balance' };
    }
    const payout = await this.stripe.payouts.create(
      { amount, currency: 'ron', description: `Salariu CropCash ${payday.slice(0, 7)}`, metadata: { farmer_id: farm.id, month: payday.slice(0, 7) } },
      { stripeAccount: farm.stripe_account_id },
    );
    await this.repo.recordPayout({ farmer_id: farm.id, amount_bani: amount, scheduled_for: payday, stripe_payout_id: payout.id, status: 'pending' });
    await this.repo.recordTransaction({
      farmer_id: farm.id,
      amount_bani: -amount,
      kind: 'salary',
      occurred_at: `${payday}T08:00:00Z`,
      source: 'payout',
      stripe_object_id: payout.id,
    });
    return { type: 'salary', date: payday, amount, ok: true };
  }

  /** Monthly pension contribution (simulated Pilon III) as a subscription on the demo clock. */
  async startPension(farm: MoneyFarm, monthlyBani: number): Promise<void> {
    if (!farm.stripe_customer_id) throw new Error('no stripe customer');
    const price = await this.stripe.prices.create({
      unit_amount: monthlyBani,
      currency: 'ron',
      recurring: { interval: 'month' },
      product_data: { name: 'Contribuție pensie (simulare Pilon III)' },
    });
    const sub = await this.stripe.subscriptions.create({
      customer: farm.stripe_customer_id,
      items: [{ price: price.id }],
      metadata: { farmer_id: farm.id },
    });
    await this.repo.upsertPension({
      farmer_id: farm.id,
      monthly_bani: monthlyBani,
      stripe_subscription_id: sub.id,
      started_at: (farm.demo_now ?? new Date().toISOString()).slice(0, 10),
    });
    await this.syncPensionInvoices(farm);
  }

  /** Records every paid pension invoice (idempotent): works with or without webhooks. */
  async syncPensionInvoices(farm: MoneyFarm): Promise<AdvanceEvent[]> {
    if (!farm.stripe_customer_id) return [];
    const out: AdvanceEvent[] = [];
    for await (const inv of this.stripe.invoices.list({ customer: farm.stripe_customer_id, status: 'paid', limit: 100 })) {
      if (!inv.amount_paid) continue;
      const paidAt = inv.status_transitions?.paid_at ?? inv.created;
      await this.repo.recordTransaction({
        farmer_id: farm.id,
        amount_bani: -inv.amount_paid,
        kind: 'pension',
        occurred_at: iso(paidAt),
        source: 'subscription',
        stripe_object_id: inv.id!,
      });
      out.push({ type: 'pension', id: inv.id!, date: iso(paidAt).slice(0, 10), amount: inv.amount_paid, ok: true });
    }
    return out;
  }

  /**
   * "Dăm timpul înainte": for each step of at most two months, pay what falls in it
   * (incomes, salary on the 1st), move the Stripe Test Clock, then record the pension
   * invoices it produced. The demo clock (farmers.demo_now) follows the Test Clock.
   */
  async advance(farmerId: string, months: number): Promise<AdvanceEvent[]> {
    const events: AdvanceEvent[] = [];
    let farm = await this.repo.farmBy('id', farmerId);
    if (!farm?.test_clock_id || !farm.demo_now) throw new Error('stripe not set up');
    // Compare instants, not strings: the DB returns "+00:00" while toISOString() gives ".000Z".
    const target = addMonthsIso(farm.demo_now, months);
    const seenInvoices = new Set((await this.syncPensionInvoices(farm)).map((e) => e.id));

    while (Date.parse(farm.demo_now!) < Date.parse(target)) {
      const next = addMonthsIso(farm.demo_now!, MAX_CLOCK_STEP_MONTHS);
      const stepTo = Date.parse(next) < Date.parse(target) ? next : target;
      for (const step of simulationSteps(farm, this.data, stepTo)) {
        const t0 = Date.now();
        events.push(
          step.type === 'income'
            ? await this.income(farm, step)
            : step.type === 'expense'
              ? await this.expense(farm, step)
              : step.type === 'repayment'
                ? await this.repayment(farm, step)
                : await this.salary(farm, step.date),
        );
        this.log(`${step.type} ${step.date}: ${JSON.stringify(events.at(-1))} (${Date.now() - t0} ms)`);
        farm = (await this.repo.farmBy('id', farmerId))!;
      }
      const t1 = Date.now();
      await this.stripe.testHelpers.testClocks.advance(farm.test_clock_id!, { frozen_time: unix(stepTo) });
      await this.waitForClock(farm.test_clock_id!);
      this.log(`clock -> ${stepTo} (${Date.now() - t1} ms)`);
      await this.repo.setStripeIds(farmerId, { demo_now: stepTo });
      farm = (await this.repo.farmBy('id', farmerId))!;
      for (const p of await this.syncPensionInvoices(farm)) {
        if (!seenInvoices.has(p.id)) {
          seenInvoices.add(p.id);
          events.push(p);
        }
      }
      farm = (await this.repo.farmBy('id', farmerId))!;
    }
    await this.syncPayouts(farm);
    return events.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Salary payout statuses straight from Stripe. In test mode a payout can be paid before
   * we've stored it, so the payout.paid webhook may arrive too early; this closes the gap.
   */
  async syncPayouts(farm: MoneyFarm): Promise<void> {
    if (!farm.stripe_account_id) return;
    for await (const po of this.stripe.payouts.list({ limit: 100 }, { stripeAccount: farm.stripe_account_id })) {
      if (po.status === 'paid' || po.status === 'failed') await this.repo.setPayoutStatus(po.id, po.status);
    }
  }

  private async waitForClock(id: string): Promise<void> {
    for (let i = 0; i < 60; i++) {
      const c = await this.stripe.testHelpers.testClocks.retrieve(id);
      if (c.status === 'ready') return;
      if (c.status === 'internal_failure') throw new Error('test clock failed');
      await this.sleep(1000);
    }
    throw new Error('test clock did not finish advancing');
  }

  /** Webhooks (docs/08 §3). Every write is idempotent, so replays are harmless. */
  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const farmerId = pi.metadata?.farmer_id;
        const kind = pi.metadata?.kind;
        if (!farmerId || !(kind === 'apia_advance' || kind === 'apia_balance' || kind === 'crop_sale')) return;
        await this.repo.recordTransaction({
          farmer_id: farmerId,
          amount_bani: pi.amount,
          kind,
          occurred_at: `${pi.metadata.demo_date || iso(pi.created).slice(0, 10)}T09:00:00Z`,
          source: 'stripe_transfer',
          stripe_object_id: pi.id,
          crop_id: pi.metadata.crop_id || null,
        });
        return;
      }
      case 'invoice.paid': {
        const customer = typeof event.data.object.customer === 'string' ? event.data.object.customer : event.data.object.customer?.id;
        if (!customer) return;
        const farm = await this.repo.farmBy('stripe_customer_id', customer);
        if (farm) await this.syncPensionInvoices(farm);
        return;
      }
      case 'payout.paid':
      case 'payout.failed': {
        // The webhook can beat our own insert (test payouts settle almost instantly): retry briefly.
        const status = event.type === 'payout.paid' ? 'paid' : 'failed';
        for (let i = 0; i < 5; i++) {
          if ((await this.repo.setPayoutStatus(event.data.object.id, status)) > 0) return;
          await this.sleep(1000);
        }
        return;
      }
      default:
        return;
    }
  }
}

