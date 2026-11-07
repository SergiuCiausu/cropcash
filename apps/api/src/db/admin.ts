import type { SupabaseClient } from '@supabase/supabase-js';
import type { FarmRow } from './repo';

/** A farm with everything the money flows need (read with the service key). */
export interface MoneyFarm extends FarmRow {
  user_id: string;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
  test_clock_id: string | null;
  demo_now: string | null;
}

export interface NewTransaction {
  farmer_id: string;
  amount_bani: number;
  kind: 'apia_advance' | 'apia_balance' | 'crop_sale' | 'salary' | 'pension' | 'expense' | 'credit' | 'loan_repayment';
  occurred_at: string;
  source: 'stripe_transfer' | 'payout' | 'subscription' | 'manual';
  stripe_object_id: string;
  crop_id?: string | null;
  expected_payment_id?: string | null;
}

export const MONEY_FARM_SELECT = [
  'id, user_id, name, county, birth_year, start_balance_bani, demo_now, salary_bani, harvests, apia_decision',
  'stripe_account_id, stripe_customer_id, test_clock_id',
  'parcels (crop_id, area_ari, is_arable, planted_month)',
  'envelopes (kind, balance_bani)',
  'expected_payments (id, group_id, kind, direction, amount_probable_bani, window_start, status)',
  'transactions (amount_bani, kind, category, occurred_at, crop_id, source, expected_payment_id)',
  'pension_plans (monthly_bani, status, stripe_subscription_id)',
].join(', ');

/**
 * Writes that only the server may do (money records, Stripe ids, the demo clock).
 * Uses the service key: callers must have checked who the farm belongs to.
 */
export interface AdminRepo {
  farmByUser(userId: string): Promise<MoneyFarm | null>;
  farmBy(field: 'stripe_account_id' | 'stripe_customer_id' | 'id', value: string): Promise<MoneyFarm | null>;
  setStripeIds(farmerId: string, ids: Partial<Pick<MoneyFarm, 'stripe_account_id' | 'stripe_customer_id' | 'test_clock_id' | 'demo_now'>>): Promise<void>;
  /** Idempotent on stripe_object_id: a webhook and the API can both record the same payment. */
  recordTransaction(tx: NewTransaction): Promise<void>;
  recordPayout(p: { farmer_id: string; amount_bani: number; scheduled_for: string; stripe_payout_id: string | null; status: string }): Promise<void>;
  /** Returns how many rows were updated (0 when the payout isn't recorded yet). */
  setPayoutStatus(stripePayoutId: string, status: 'paid' | 'failed'): Promise<number>;
  /** Takes back a salary that never reached the farmer, so the money counts as theirs again. */
  removePayoutTransaction(stripePayoutId: string): Promise<void>;
  upsertPension(p: { farmer_id: string; monthly_bani: number; stripe_subscription_id: string; started_at: string }): Promise<void>;
  /** A new monthly amount, or 'stopped'. A stopped plan can be started again with upsertPension. */
  updatePension(farmerId: string, patch: { monthly_bani?: number; status?: 'active' | 'stopped' }): Promise<void>;
  /** Fixes the salary paid each month (docs/08 §1c). */
  setSalary(farmerId: string, salaryBani: number): Promise<void>;
}

export function supabaseAdminRepo(admin: SupabaseClient): AdminRepo {
  const one = async (field: string, value: string) => {
    const { data, error } = await admin.from('farmers').select(MONEY_FARM_SELECT).eq(field, value).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as unknown as MoneyFarm | null) ?? null;
  };
  return {
    farmByUser: (userId) => one('user_id', userId),
    farmBy: (field, value) => one(field, value),

    async setStripeIds(farmerId, ids) {
      const { error } = await admin.from('farmers').update(ids).eq('id', farmerId);
      if (error) throw new Error(error.message);
    },

    async recordTransaction(tx) {
      const { error } = await admin
        .from('transactions')
        .upsert(tx, { onConflict: 'stripe_object_id', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },

    async recordPayout(p) {
      const { error } = await admin
        .from('payouts')
        .upsert(p, { onConflict: 'farmer_id,scheduled_for', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },

    async setPayoutStatus(stripePayoutId, status) {
      const { data, error } = await admin
        .from('payouts')
        .update({ status })
        .eq('stripe_payout_id', stripePayoutId)
        .select('id');
      if (error) throw new Error(error.message);
      return data?.length ?? 0;
    },

    async removePayoutTransaction(stripePayoutId) {
      const { error } = await admin
        .from('transactions')
        .delete()
        .eq('stripe_object_id', stripePayoutId)
        .eq('source', 'payout');
      if (error) throw new Error(error.message);
    },

    async upsertPension(p) {
      const { error } = await admin
        .from('pension_plans')
        .upsert({ ...p, vehicle: 'pilon3', status: 'active' }, { onConflict: 'farmer_id' });
      if (error) throw new Error(error.message);
    },

    async updatePension(farmerId, patch) {
      const { error } = await admin.from('pension_plans').update(patch).eq('farmer_id', farmerId);
      if (error) throw new Error(error.message);
    },

    async setSalary(farmerId, salaryBani) {
      const { error } = await admin.from('farmers').update({ salary_bani: salaryBani }).eq('id', farmerId);
      if (error) throw new Error(error.message);
    },
  };
}
