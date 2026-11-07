import { FARM_SELECT, RepoError, type FarmRow } from '../db/repo';
import type { SupabaseFactory } from '../db/supabase';

export interface StripeFarm extends FarmRow {
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
  test_clock_id: string | null;
}

export interface StripeIds {
  stripe_account_id: string;
  stripe_customer_id: string;
  test_clock_id: string;
}

export interface Income {
  farmerId: string;
  amountBani: number;
  at: string;
  category: string;
  cropId?: string;
  objectId: string;
}

/**
 * Writes money facts as the server, past RLS. Every caller has already tied the farmer to a
 * session or a signed Stripe event, and every write is safe to repeat.
 */
export interface Ledger {
  farmById(id: string): Promise<StripeFarm | null>;
  farmByCustomer(customerId: string): Promise<StripeFarm | null>;
  saveStripeIds(farmerId: string, ids: StripeIds): Promise<void>;
  setAppDate(farmerId: string, date: string): Promise<void>;
  applyIncome(income: Income): Promise<boolean>;
  applyPlannedCost(cost: { farmerId: string; amountBani: number; date: string; cropId?: string; note?: string; key: string }): Promise<boolean>;
  /** Null when that month's salary already exists. */
  claimPayout(farmerId: string, amountBani: number, day: string): Promise<string | null>;
  markPayout(id: string, stripePayoutId: string | null): Promise<void>;
  payoutPaid(stripePayoutId: string): Promise<boolean>;
  payoutFailed(stripePayoutId: string): Promise<void>;
  invoicePaid(farmerId: string, amountBani: number, at: string, invoiceId: string): Promise<boolean>;
  savePension(farmerId: string, monthlyBani: number, subscriptionId: string, startedAt: string): Promise<void>;
}

export function supabaseLedger(db: SupabaseFactory): Ledger {
  const admin = () => db.admin();
  const fail = (error: { message: string } | null) => {
    if (error) throw new RepoError('db_error', error.message);
  };
  const farmSelect = `${FARM_SELECT}, stripe_account_id, stripe_customer_id, test_clock_id`;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await admin().rpc(name, args);
    fail(error);
    return data === true;
  };

  return {
    async farmById(id) {
      const { data, error } = await admin().from('farmers').select(farmSelect).eq('id', id).maybeSingle();
      fail(error);
      return data as unknown as StripeFarm | null;
    },

    async farmByCustomer(customerId) {
      const { data, error } = await admin().from('farmers').select(farmSelect).eq('stripe_customer_id', customerId).maybeSingle();
      fail(error);
      return data as unknown as StripeFarm | null;
    },

    async saveStripeIds(farmerId, ids) {
      fail((await admin().from('farmers').update(ids).eq('id', farmerId)).error);
    },

    async setAppDate(farmerId, date) {
      fail((await admin().from('farmers').update({ app_date: date }).eq('id', farmerId)).error);
    },

    applyIncome: ({ farmerId, amountBani, at, category, cropId, objectId }) =>
      rpc('apply_income', {
        p_farmer: farmerId,
        p_amount_bani: amountBani,
        p_at: at,
        p_category: category,
        p_crop_id: cropId ?? null,
        p_object: objectId,
      }),

    applyPlannedCost: ({ farmerId, amountBani, date, cropId, note, key }) =>
      rpc('apply_planned_cost', {
        p_farmer: farmerId,
        p_amount_bani: amountBani,
        p_date: date,
        p_crop_id: cropId ?? null,
        p_note: note ?? null,
        p_key: key,
      }),

    async claimPayout(farmerId, amountBani, day) {
      const { data, error } = await admin()
        .from('payouts')
        .upsert(
          { farmer_id: farmerId, amount_bani: amountBani, scheduled_for: day },
          { onConflict: 'farmer_id,scheduled_for', ignoreDuplicates: true },
        )
        .select('id');
      fail(error);
      return (data?.[0]?.id as string | undefined) ?? null;
    },

    async markPayout(id, stripePayoutId) {
      const values = stripePayoutId ? { stripe_payout_id: stripePayoutId, status: 'pending' } : { status: 'failed' };
      fail((await admin().from('payouts').update(values).eq('id', id)).error);
    },

    payoutPaid: (stripePayoutId) => rpc('apply_payout_paid', { p_stripe_payout: stripePayoutId }),

    async payoutFailed(stripePayoutId) {
      fail((await admin().from('payouts').update({ status: 'failed' }).eq('stripe_payout_id', stripePayoutId).neq('status', 'paid')).error);
    },

    invoicePaid: (farmerId, amountBani, at, invoiceId) =>
      rpc('apply_invoice_paid', { p_farmer: farmerId, p_amount_bani: amountBani, p_at: at, p_invoice: invoiceId }),

    async savePension(farmerId, monthlyBani, subscriptionId, startedAt) {
      const { error } = await admin().from('pension_plans').upsert(
        {
          farmer_id: farmerId,
          monthly_bani: monthlyBani,
          vehicle: 'pilon3',
          stripe_subscription_id: subscriptionId,
          started_at: startedAt,
          status: 'active',
        },
        { onConflict: 'farmer_id' },
      );
      fail(error);
    },
  };
}
