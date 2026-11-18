import { activePensionMonthly } from '../../../packages/shared/src/farm/plan-inputs';
import type { MeFarm } from './farm';

/**
 * A money move whose answer was lost: did it happen? The page fetches /api/me again and asks here,
 * so the farmer is never told "try again" for a pension that is already running
 * (docs/failure-handling-plan.md, FAIL-03). Pure, so the legacy pages and the React store agree.
 */
export type MoneyOutcome = 'done' | 'not_done';

/** The money moves this knows about: the registry's names, plus the Stripe setup call. */
export type MoneyMove =
  | 'start_pension'
  | 'change_pension'
  | 'stop_pension'
  | 'set_pension_fund'
  | 'save_envelopes'
  | 'simulate_apia_advance'
  | 'advance_clock'
  | 'stripe_setup';

export const MONEY_MOVES: readonly MoneyMove[] = [
  'start_pension',
  'change_pension',
  'stop_pension',
  'set_pension_fund',
  'save_envelopes',
  'simulate_apia_advance',
  'advance_clock',
  'stripe_setup',
];
export const isMoneyMove = (name: string): name is MoneyMove => (MONEY_MOVES as readonly string[]).includes(name);

type Farm = Pick<MeFarm, 'pension_plans' | 'pension_fund_id' | 'envelopes' | 'stripe_account_id' | 'transactions' | 'demo_now'>;

const pension = (me: Farm) => activePensionMonthly(me.pension_plans as Parameters<typeof activePensionMonthly>[0]);
const advances = (me: Farm) => (me.transactions ?? []).filter((t) => t.kind === 'apia_advance').length;

/** `before` is the copy the page had when the farmer tapped; `after` is a fresh /api/me. */
export function moneyOutcome(name: MoneyMove, input: Record<string, unknown>, before: Farm, after: Farm): MoneyOutcome {
  const yes = (done: boolean): MoneyOutcome => (done ? 'done' : 'not_done');
  switch (name) {
    case 'start_pension':
    case 'change_pension':
      return yes(pension(after) === Number(input.monthlyLei) * 100);
    case 'stop_pension':
      return yes(pension(after) === 0);
    case 'set_pension_fund':
      return yes((after.pension_fund_id ?? null) === (input.fundId ?? null));
    case 'save_envelopes': {
      const balances = new Map((after.envelopes ?? []).map((e) => [e.kind, e.balance_bani]));
      return yes(Object.entries(input).every(([kind, bani]) => balances.get(kind) === bani));
    }
    case 'simulate_apia_advance':
      return yes(advances(after) > advances(before));
    case 'advance_clock':
      /* A clock that moved at all ran: the server resumes or refuses a second run (IDEM-01). */
      return yes((after.demo_now ?? null) !== (before.demo_now ?? null));
    case 'stripe_setup':
      return yes(!!after.stripe_account_id);
  }
}
