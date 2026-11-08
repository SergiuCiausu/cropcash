/* "Contul tău" on Ion's farm (/ferma-lui-ion/bani). There's no Stripe account behind it, so the
   page shows what an account would hold, built only from Ion's plan: the split the app proposes
   as the money pots, and his next salaries as scheduled. No figure is invented here. */
import { addMonths } from '../../packages/shared/src/cashflow/dates';
import { paydaysBetween } from '../../packages/shared/src/cashflow/simulate';

type Pots = { salary: number; spring_inputs: number; debts: number; pension: number };

export interface DemoAccountPlan {
  proposal: Pots;
  monthlySalary: number;
  smoothing: { pensionMonthly: number };
}

export interface DemoPayout {
  scheduled_for: string;
  amount_bani: number;
  status: 'scheduled';
}

/** payoutsShown: how many salaries to list (docs/data/demo-ion.json, demo_account). */
export function demoAccount(plan: DemoAccountPlan, today: string, payoutsShown: number) {
  if (!Number.isInteger(payoutsShown) || payoutsShown < 0) throw new Error(`payoutsShown must be a whole number ≥ 0, got ${payoutsShown}`);
  const last = `${addMonths(today.slice(0, 7) as Parameters<typeof addMonths>[0], payoutsShown)}-01`;
  const payouts: DemoPayout[] = plan.monthlySalary > 0
    ? paydaysBetween(today, last).map((day) => ({ scheduled_for: day, amount_bani: plan.monthlySalary, status: 'scheduled' }))
    : [];
  return { envelopes: plan.proposal, payouts, pensionMonthly: plan.smoothing.pensionMonthly };
}
