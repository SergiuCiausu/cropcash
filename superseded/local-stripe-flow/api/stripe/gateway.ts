import Stripe from 'stripe';

const V2 = { apiVersion: '2026-10-28.endive' };
/** Stripe refuses a longer jump for a clock with a monthly subscription. */
export const MAX_CLOCK_STEP_MONTHS = 2;
const CLOCK_POLL_MS = 1_500;
const CLOCK_POLLS = 60;
const TEST_IBAN = 'RO49AAAA1B31007593840000';

export type IncomeKind = 'apia_advance' | 'apia_balance' | 'crop_sale';

/** Everything the app asks of Stripe. Tests replace it. */
export interface StripeGateway {
  createAccount(farmer: { id: string; name: string }): Promise<string>;
  createClock(date: string): Promise<string>;
  createCustomer(farmerId: string, clockId: string): Promise<string>;
  /** Simulated money: a test card pays, and it lands in the farmer's account. */
  sendIncome(i: { accountId: string; farmerId: string; amount: number; kind: IncomeKind; key: string; cropId?: string }): Promise<string>;
  /** Null when the account can't cover it. */
  payOut(p: { accountId: string; amount: number; month: string; key: string }): Promise<string | null>;
  subscribe(customerId: string, monthly: number): Promise<string>;
  /** Resolves once Stripe has finished billing up to that date. */
  advanceClock(clockId: string, date: string): Promise<void>;
  /** Throws on a bad signature. */
  parseEvent(rawBody: Buffer, signature: string): Stripe.Event;
}

/** The app must never touch real money. */
export function assertTestKey(key: string) {
  if (!key.startsWith('sk_test_')) throw new Error('STRIPE_SECRET_KEY must be a test key (sk_test_...)');
}

const seconds = (date: string) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function stripeGateway(secretKey: string, webhookSecret: string): StripeGateway {
  assertTestKey(secretKey);
  const stripe = new Stripe(secretKey);

  return {
    /** Fills in Stripe's test values: the farmer never sees Stripe (docs/08 §1b). */
    async createAccount({ id, name }) {
      const account = (await stripe.rawRequest(
        'POST',
        '/v2/core/accounts',
        {
          contact_email: `farmer-${id}@cropcash.test`,
          display_name: name,
          dashboard: 'none',
          identity: { country: 'ro', entity_type: 'individual' },
          configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
          defaults: { currency: 'ron', responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
        },
        V2,
      )) as unknown as { id: string };
      await stripe.rawRequest(
        'POST',
        `/v2/core/accounts/${account.id}`,
        {
          identity: {
            attestations: { terms_of_service: { account: { date: new Date().toISOString(), ip: '127.0.0.1' } } },
            individual: {
              given_name: 'Ion',
              surname: 'Test',
              date_of_birth: { day: 1, month: 1, year: 1901 },
              address: { line1: 'address_full_match', city: 'Alexandria', postal_code: '140001', country: 'ro' },
            },
          },
          defaults: { profile: { business_url: 'https://cropcash.example' } },
        },
        V2,
      );
      await stripe.accounts.createExternalAccount(account.id, {
        external_account: { object: 'bank_account', country: 'RO', currency: 'ron', account_number: TEST_IBAN },
      });
      // Without this Stripe would pay out the whole balance by itself.
      await stripe.accounts.update(account.id, { settings: { payouts: { schedule: { interval: 'manual' } } } });
      return account.id;
    },

    async createClock(date) {
      return (await stripe.testHelpers.testClocks.create({ frozen_time: seconds(date) })).id;
    },

    async createCustomer(farmerId, clockId) {
      const customer = await stripe.customers.create({
        test_clock: clockId,
        payment_method: 'pm_card_visa',
        invoice_settings: { default_payment_method: 'pm_card_visa' },
        metadata: { farmer_id: farmerId },
      });
      return customer.id;
    },

    async sendIncome({ accountId, farmerId, amount, kind, key, cropId }) {
      const intent = await stripe.paymentIntents.create(
        {
          amount,
          currency: 'ron',
          payment_method: 'pm_card_bypassPending',
          confirm: true,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          transfer_data: { destination: accountId },
          metadata: { farmer_id: farmerId, kind, ...(cropId ? { crop_id: cropId } : {}) },
        },
        { idempotencyKey: key },
      );
      return intent.id;
    },

    async payOut({ accountId, amount, month, key }) {
      try {
        const payout = await stripe.payouts.create(
          { amount, currency: 'ron', metadata: { month } },
          { stripeAccount: accountId, idempotencyKey: key },
        );
        return payout.id;
      } catch (err) {
        if (err instanceof Stripe.errors.StripeError && err.code === 'balance_insufficient') return null;
        throw err;
      }
    },

    async subscribe(customerId, monthly) {
      const product = await stripe.products.create({ name: 'CropCash pensie (simulat)' });
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price_data: { currency: 'ron', product: product.id, unit_amount: monthly, recurring: { interval: 'month' } } }],
      });
      return subscription.id;
    },

    async advanceClock(clockId, date) {
      await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: seconds(date) });
      for (let i = 0; i < CLOCK_POLLS; i++) {
        const { status } = await stripe.testHelpers.testClocks.retrieve(clockId);
        if (status === 'ready') return;
        if (status === 'internal_failure') throw new Error(`test clock ${clockId} failed`);
        await wait(CLOCK_POLL_MS);
      }
      throw new Error(`test clock ${clockId} timed out`);
    },

    parseEvent: (rawBody, signature) => stripe.webhooks.constructEvent(rawBody, signature, webhookSecret),
  };
}
