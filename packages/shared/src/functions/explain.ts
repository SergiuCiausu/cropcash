import {
  cumulativeAvailable,
  maxSafeSalary,
  monthIncome,
  monthlyFixed,
  type AmountScenario,
  type EntryKind,
  type MonthKey,
  type Timeline,
  type TimelineEntry,
} from '../cashflow';
import type { AppData } from '../data';
import { leiToBani, type Bani } from '../money';
import type { FarmPlan } from './plan';

const sum = (values: Bani[]) => values.reduce((total, v) => total + v, 0);

/** Why the salary is what it is. Structured, so the screen and the AI word it themselves. */
export function explainSalary(plan: FarmPlan, scenario: AmountScenario, data: AppData) {
  const t = plan.timelines[scenario];
  const result = maxSafeSalary(t, plan.smoothing, data);
  const limit = t.months.findIndex((m) => m.key === result.bindingMonth);
  const reason = result.deficit ? 'money_runs_out' : limit === t.months.length - 1 ? 'end_of_plan' : 'tight_month';
  return {
    salary: result.salary,
    reason,
    limitingMonth: result.bindingMonth,
    monthsUntilLimit: limit + 1,
    /** Money available by the limiting month, before any salary. */
    availableByThen: cumulativeAvailable(t, plan.smoothing)[limit]!,
    setAside: {
      pensionMonthly: plan.smoothing.pensionMonthly ?? 0,
    },
    roundedDownTo: leiToBani(data.params.salary_round_lei.value),
  };
}

/** Money of one kind, for one crop, across the months it moved. */
export interface MoneyLine {
  kind: EntryKind;
  cropId: string | null;
  what: string | null;
  amount: Bani;
  firstMonth: MonthKey;
  lastMonth: MonthKey;
}

/** Joins entries of the same kind and crop, and of the same work when `byWork` is set. */
function moneyLines(entries: TimelineEntry[], byWork = false): MoneyLine[] {
  const lines = new Map<string, MoneyLine>();
  for (const e of entries.filter((x) => x.value > 0)) {
    const what = byWork ? (e.what ?? null) : null;
    const key = [e.kind, e.cropId, what].join('|');
    const month = e.date.slice(0, 7);
    const line = lines.get(key);
    if (line) {
      line.amount += e.value;
      line.lastMonth = month;
    } else {
      lines.set(key, { kind: e.kind, cropId: e.cropId ?? null, what, amount: e.value, firstMonth: month, lastMonth: month });
    }
  }
  return [...lines.values()];
}

const moneyIn = (entries: TimelineEntry[]) => entries.filter((e) => e.direction === 'in');
const moneyOut = (entries: TimelineEntry[]) => entries.filter((e) => e.direction === 'out');
const entriesOf = (months: Timeline['months']) => months.flatMap((m) => m.entries);

/** Every step from the money on hand to the salary, with its real sources. Adds up to the ban. */
export function salaryBreakdown(plan: FarmPlan, scenario: AmountScenario, data: AppData) {
  const t = plan.timelines[scenario];
  const result = maxSafeSalary(t, plan.smoothing, data);
  const limit = t.months.findIndex((m) => m.key === result.bindingMonth);
  const months = t.months.slice(0, limit + 1);
  const fixed = monthlyFixed(t, plan.smoothing).slice(0, limit + 1);
  const next = t.months.slice(limit + 1).find((m) => monthIncome(m) > 0);
  return {
    salary: result.salary,
    limitingMonth: result.bindingMonth,
    deficit: result.deficit,
    months: limit + 1,
    /** Unrounded salary, before the step down to a round amount. */
    exact: Math.max(0, Math.floor(result.exact)),
    opening: t.startBalance,
    income: moneyLines(moneyIn(entriesOf(months))),
    costs: moneyLines(moneyOut(entriesOf(months))),
    pension: sum(fixed.map((f) => f.pension)),
    /** What is left to share out as salary. Negative when the money runs out. */
    available: cumulativeAvailable(t, plan.smoothing)[limit]!,
    /** The balance in the limiting month if nothing at all were set aside or taken out. */
    withoutSetAsides: t.months[limit]!.balanceEnd,
    /** The first income after the limiting month: what ends the squeeze. */
    nextIncome: next
      ? {
          month: next.key,
          amount: monthIncome(next),
          lines: moneyLines(moneyIn(next.entries).filter((e) => e.kind !== 'credit')),
        }
      : null,
  };
}

/**
 * The plan month by month, with what is left after salary and set-asides. A normal year pays the
 * plan's salary, the other years their own safe salary, unless `salary` tests another amount.
 */
export function salaryMonths(plan: FarmPlan, scenario: AmountScenario, data: AppData, salary?: Bani) {
  const t = plan.timelines[scenario];
  const result = maxSafeSalary(t, plan.smoothing, data);
  const paid = salary ?? (scenario === 'medium' ? plan.monthlySalary : result.salary);
  const fixed = monthlyFixed(t, plan.smoothing);
  let left = t.startBalance;
  const months = t.months.map((m, i) => {
    const { pension } = fixed[i]!;
    left += m.in - m.out - pension - paid;
    return { key: m.key, income: moneyLines(moneyIn(m.entries)), costs: moneyLines(moneyOut(m.entries), true), pension, left };
  });
  return { salary: paid, limitingMonth: result.bindingMonth, months };
}

/** How one scheme adds up for this farm, or why it doesn't count. Null for an unknown code. */
export function explainSubsidy(plan: FarmPlan, data: AppData, code: string) {
  const scheme = data.subsidies.schemes.find((s) => s.code === code);
  if (!scheme) return null;
  const rate = plan.subsidies.rates[scheme.fund];
  const base = {
    code: scheme.code,
    nameRo: scheme.name_ro,
    fund: scheme.fund,
    unit: scheme.unit,
    amountEurPerUnit: scheme.amount_eur,
    exchangeRate: rate.value,
    exchangeRateConfirmed: rate.confirmed,
    status: scheme.status,
    sourceUrl: scheme.source_url,
  };
  const paid = plan.subsidies.schemes.find((s) => s.code === code);
  if (paid) {
    return {
      ...base,
      counted: true as const,
      units: paid.units,
      eur: paid.eur,
      leiIndicative: paid.leiIndicative,
      advanceEur: paid.advanceEur,
      balanceEur: paid.balanceEur,
    };
  }
  const refused = plan.subsidies.notEligible.find((n) => n.code === code);
  const reason = !scheme.enabled ? 'not_in_app' : refused ? 'not_eligible' : 'amount_unknown';
  return { ...base, counted: false as const, reason, failed: refused?.failed ?? [] };
}
