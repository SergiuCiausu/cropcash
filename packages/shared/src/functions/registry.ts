import { z } from 'zod';
import {
  bridgeCreditNeeded,
  costsByCrop,
  creditAvailableFrom,
  creditCapacity,
  maxSafeSalary,
  springNeed,
  upcoming,
  type AmountScenario,
} from '../cashflow';
import { CurrencySchema, convertAmount, ratesAreOld } from '../currency';
import {
  CreditInputSchema,
  EnvelopesInputSchema,
  ExpenseInputSchema,
  MAX_FARM_HA,
  SaleInputSchema,
  TaskIdSchema,
  UpdateFarmInputSchema,
  ageFromBirthYear,
  farmInputFromStored,
  recordedTransactions,
  HarvestsInputSchema,
  HarvestYearSchema,
  SetCropCostInputSchema,
  isOwnCrop,
  storedHarvestCosts,
} from '../farm';
import { loadData } from '../data';
import { leiToBani } from '../money';
import { pensionMinimum, simulatePension, suggestPension } from '../pension';
import { ReadDocumentInputSchema } from '../documents';
import { ApiaDecisionSchema, checkEligibility, profileForScheme } from '../subsidies';
import { defineRead, defineWrite, type ReadContext, type ReadFunction, type WriteFunction } from './define';
import { explainSalary, explainSubsidy } from './explain';
import { afterBadHarvest, farmData, planView, proposeSplit } from './plan';
import { tasksForFarm } from './tasks';
import { checkPurchase, whatIfCredit, whatIfPension, whatIfSubsidy } from './whatIf';
import {
  closingSoonRows,
  filterOpportunities,
  matchOpportunityRows,
  opportunityChangeRows,
  opportunityRow,
  plainText,
  sourceChangeRows,
} from '../opportunities';

const Scenario = z.enum(['bad', 'medium', 'good']).default('medium');
const ScenarioInput = z.strictObject({ scenario: Scenario });
const NoInput = z.strictObject({});
const CodeInput = z.strictObject({ code: z.string().min(1).max(40) });

/** Bani, whole and positive, up to the same 10 million lei as a declared credit. */
const Amount = z.number().int().positive().max(1_000_000_000);

const timeline = (ctx: ReadContext, scenario: AmountScenario) => ctx.plan.timelines[scenario];

// ── Subsidies ───────────────────────────────────────────────────────────────

export const estimateSubsidy = defineRead({
  name: 'estimate_subsidy',
  description: 'The expected APIA subsidy for this farm: lowest, probable and highest amount, advance, balance and each scheme.',
  input: NoInput,
  run: (_input, { plan }) => plan.subsidies,
  sources: (subsidies, { data }) =>
    data.subsidies.schemes.flatMap((s) =>
      s.source_url && subsidies.schemes.some((r) => r.code === s.code) ? [{ title: s.name_ro, url: s.source_url }] : [],
    ),
});

export const checkScheme = defineRead({
  name: 'check_scheme',
  description: 'Whether this farm looks eligible for one subsidy scheme, and which conditions it misses. Null for an unknown code.',
  input: CodeInput,
  run: ({ code }, { farm, data }) => {
    const scheme = data.subsidies.schemes.find((s) => s.code === code);
    if (!scheme) return null;
    const year = data.subsidies.meta.campaign_year;
    const check = checkEligibility(scheme, profileForScheme(farmInputFromStored(farm, year), scheme));
    return {
      code: scheme.code,
      nameRo: scheme.name_ro,
      /** False for schemes outside the MVP (animals): the answer isn't meaningful yet. */
      inApp: scheme.enabled,
      eligible: scheme.enabled && check.eligible,
      failed: check.failed,
      unverifiedRules: check.unverified,
      sourceUrl: scheme.source_url,
    };
  },
  sources: (result) => (result?.sourceUrl ? [{ title: result.nameRo, url: result.sourceUrl }] : []),
});

export const listSchemes = defineRead({
  name: 'list_schemes',
  description: 'The subsidy schemes the app knows, with rate, unit and whether the rate is confirmed. The rate is null when unknown.',
  input: NoInput,
  run: (_input, { data }) =>
    data.subsidies.schemes
      .filter((s) => s.enabled)
      .map((s) => ({
        code: s.code,
        nameRo: s.name_ro,
        fund: s.fund,
        unit: s.unit,
        amountEur: s.amount_eur,
        status: s.status,
        sourceUrl: s.source_url,
      })),
});

export const explainSubsidyFn = defineRead({
  name: 'explain_subsidy',
  description: 'How one scheme adds up for this farm: units, rate, exchange rate and source, or why it does not count.',
  input: CodeInput,
  run: ({ code }, { plan, data }) => explainSubsidy(plan, data, code),
  sources: (r) => (r?.sourceUrl ? [{ title: r.nameRo, url: r.sourceUrl }] : []),
});

export const WhatIfSubsidyInputSchema = z.strictObject({
  parcels: z
    .array(z.strictObject({ cropId: z.string().min(1), areaHa: z.number().positive().max(MAX_FARM_HA) }))
    .min(1)
    .optional(),
  age: z.number().int().min(16).max(100).optional(),
});

export const whatIfSubsidyFn = defineRead({
  name: 'what_if_subsidy',
  description: 'What the subsidy would be with other land or another age, and which schemes would be gained or lost. Saves nothing.',
  input: WhatIfSubsidyInputSchema,
  run: (change, { plan, farm, data }) => whatIfSubsidy(plan, farm, data, change),
});

export const getSubsidyPayments = defineRead({
  name: 'get_subsidy_payments',
  description: 'When APIA money should arrive: advance and balance, each with its window and the date the plan assumes.',
  input: ScenarioInput,
  run: ({ scenario }, ctx) =>
    timeline(ctx, scenario)
      .months.flatMap((m) => m.entries)
      .filter((e) => e.kind === 'apia_advance' || e.kind === 'apia_balance')
      .map((e) => ({
        kind: e.kind,
        amount: e.amount,
        planned: e.value,
        date: e.date,
        window: e.window,
        estimated: e.estimated,
        unverified: e.unverified,
      })),
});

// ── Salary and plan ─────────────────────────────────────────────────────────

/** The salary in the result stays the normal-year one, whichever scenario is picked. */
export const GetPlanInputSchema = ScenarioInput;

export const getPlan = defineRead({
  name: 'get_plan',
  description:
    'The farm plan for the next 12 months in a bad, normal or good year: money in and out by month, the safe monthly salary, the spring need and any suggested credit.',
  input: GetPlanInputSchema,
  run: ({ scenario }, { plan }) => planView(plan, scenario),
});

export const getSalary = defineRead({
  name: 'get_salary',
  description: 'The monthly salary this farm can safely take in a bad, normal or good year, and the month that limits it.',
  input: ScenarioInput,
  run: ({ scenario }, ctx) => maxSafeSalary(timeline(ctx, scenario), ctx.plan.smoothing, ctx.data),
});

export const explainSalaryFn = defineRead({
  name: 'explain_salary',
  description: 'Why the salary is this amount: the month that limits it and the money available by then.',
  input: ScenarioInput,
  run: ({ scenario }, { plan, data }) => explainSalary(plan, scenario, data),
});

export const getForecast = defineRead({
  name: 'get_forecast',
  description: 'The next 12 months in a bad, normal or good year: in, out and money left, plus where the money goes.',
  input: ScenarioInput,
  run: ({ scenario }, ctx) => {
    const t = timeline(ctx, scenario);
    return {
      scenario,
      startBalance: t.startBalance,
      months: t.months.map((m) => ({ key: m.key, in: m.in, out: m.out, balanceEnd: m.balanceEnd })),
      endBalance: t.months.at(-1)?.balanceEnd ?? t.startBalance,
      lowest: t.lowest,
      costsByCrop: costsByCrop(t),
    };
  },
});

export const getTightMonths = defineRead({
  name: 'get_tight_months',
  description: 'The hardest months of the plan, before any salary: the lowest point, how much is missing and the spring need.',
  input: ScenarioInput,
  run: ({ scenario }, ctx) => {
    const t = timeline(ctx, scenario);
    return { months: t.hardMonths, lowest: t.lowest, missing: Math.max(0, -t.lowest.balance), spring: springNeed(t) };
  },
});

export const ListUpcomingInputSchema = z.strictObject({
  scenario: Scenario,
  days: z.number().int().min(1).max(366).default(42),
});

export const getAfterBadHarvest = defineRead({
  name: 'get_after_bad_harvest',
  description:
    "What a bad harvest does to the money: the lowest point in the months before the next harvest, how much is missing, and the salary that would hold, against a normal year. Also what bad, normal and good mean in tonnes per hectare for this farm's crops, and the county and years they come from.",
  input: NoInput,
  run: (_input, { farm, data, plan }) => {
    const local = farmData(farm, data);
    const sown = new Set(plan.economics.map((c) => c.cropId));
    return {
      effect: afterBadHarvest(farm, data, { month: plan.timelines.medium.months[0]!.key, params: plan.subsidyParams }),
      yields: local.crops.crops
        .filter((c) => sown.has(c.id))
        .map((c) => ({ cropId: c.id, tonnesPerHa: c.yield_t_per_ha, basedOn: c.yield_basis ?? null })),
    };
  },
  sources: (_output, { data }) => [{ title: 'INS, producția medie la hectar pe județe (AGR110A)', url: data.crops.county_history.source_url }],
});

export const listUpcoming = defineRead({
  name: 'list_upcoming',
  description: 'What comes next from today: payments, deadlines and farm work, in date order.',
  input: ListUpcomingInputSchema,
  run: ({ scenario, days }, ctx) => upcoming(timeline(ctx, scenario), ctx.today, days),
});

// ── Credit ──────────────────────────────────────────────────────────────────

export const SuggestCreditInputSchema = z.strictObject({ targetSalary: Amount.optional() });

export const suggestCreditFn = defineRead({
  name: 'suggest_credit',
  description:
    'Information only: the credit that would raise the monthly salary, or reach a target salary. Null when a credit would not help. Never names banks or offers.',
  input: SuggestCreditInputSchema,
  run: ({ targetSalary }, { plan, data }) => {
    if (targetSalary === undefined) {
      const s = plan.creditSuggestion;
      return s && { ...s, possible: true };
    }
    const t = plan.timelines.medium;
    const credit = bridgeCreditNeeded(t, plan.smoothing, targetSalary, data);
    if (credit.amount === 0) return null;
    const borrowed = plan.credits.reduce((sum, c) => sum + c.amount, 0);
    const capacity = creditCapacity(plan.subsidies.totals.lei.probable, data, borrowed);
    const from = creditAvailableFrom(t, data);
    // The certificate must exist by the month the money is needed.
    const inTime = from !== null && credit.takeMonth !== null && credit.takeMonth >= from;
    return { salary: targetSalary, credit, capacity, possible: inTime && credit.amount <= capacity };
  },
});

export const whatIfCreditFn = defineRead({
  name: 'what_if_credit',
  description: 'What the salary would be with a credit, and whether it fits the APIA certificate limit and date. Saves nothing.',
  input: CreditInputSchema,
  run: (credit, { plan, farm, data }) => whatIfCredit(plan, farm, data, credit),
});

/** The farm as the farmer entered it, so the AI can build a what-if from the real parcels. */
export const getFarm = defineRead({
  name: 'get_farm',
  description:
    "The farm: the farmer's age, each crop with its hectares (areaHa), and the money in the account at the start (bani). Use it before what_if_subsidy, which needs every parcel.",
  input: NoInput,
  run: (_input, { farm, data }) => {
    const { age, parcels } = farmInputFromStored(farm, data.subsidies.meta.campaign_year);
    const name = (id: string) => data.crops.crops.find((c) => c.id === id)?.name_ro ?? id;
    return {
      age,
      parcels: parcels.map((p) => ({ cropId: p.cropId, crop: name(p.cropId), areaHa: p.areaHa })),
      startBalance: farm.start_balance_bani,
    };
  },
});

export const CheckPurchaseInputSchema = z.strictObject({
  amount: Amount,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export const checkPurchaseFn = defineRead({
  name: 'check_purchase',
  description:
    'Information only, for "Pot să-mi iau…?": the monthly salary and the lowest month before and after one purchase (amount in bani) paid in a month (YYYY-MM, default this month). Null for a month outside the next 12. Never a yes or no.',
  input: CheckPurchaseInputSchema,
  run: ({ amount, month }, { plan, farm, data }) => checkPurchase(plan, farm, data, amount, month),
});

export const listCredits = defineRead({
  name: 'list_credits',
  description: 'The credits the farmer declared, with amount, take date and repay date.',
  input: NoInput,
  run: (_input, { plan }) => plan.credits,
});

export const addCredit = defineWrite({
  name: 'add_credit',
  description: 'Adds a credit the farmer took or plans to take to the plan. It does not apply for a credit.',
  input: CreditInputSchema,
  request: (body) => ({ method: 'POST', path: '/api/credits', body }),
});

export const RemoveCreditInputSchema = z.strictObject({ groupId: z.uuid() });

export const removeCredit = defineWrite({
  name: 'remove_credit',
  description: 'Removes a declared credit and its repayment from the plan.',
  input: RemoveCreditInputSchema,
  request: ({ groupId }) => ({ method: 'DELETE', path: `/api/credits/${groupId}` }),
  repeatSafe: 'gone',
});

// ── Envelopes ───────────────────────────────────────────────────────────────

export const getEnvelopes = defineRead({
  name: 'get_envelopes',
  description: 'How the money is split now: salary, spring costs, debts and pension.',
  input: NoInput,
  run: (_input, { plan }) => ({ balances: plan.envelopes }),
});

export const ProposeSplitInputSchema = z.strictObject({ income: Amount.optional() });

export const proposeSplitFn = defineRead({
  name: 'propose_split',
  description: 'A suggested split for money coming in, or for the money on hand today when no income is given.',
  input: ProposeSplitInputSchema,
  run: ({ income }, { plan }) =>
    income === undefined
      ? { split: plan.proposal, monthsCovered: plan.monthsCovered }
      : proposeSplit(plan, income, true),
});

export const saveEnvelopes = defineWrite({
  name: 'save_envelopes',
  timeout: 'money',
  description: 'Saves a split of the money into envelopes. The parts cannot exceed the money the farmer has.',
  input: EnvelopesInputSchema,
  request: (body) => ({ method: 'PUT', path: '/api/envelopes', body }),
});

// ── Recorded money ──────────────────────────────────────────────────────────

export const recordSale = defineWrite({
  name: 'record_sale',
  description: 'Records a crop sale that already happened, from the total or from tonnes and price.',
  input: SaleInputSchema,
  request: (body) => ({ method: 'POST', path: '/api/sales', body }),
});

export const addExpense = defineWrite({
  name: 'add_expense',
  description: 'Records an expense that already happened, optionally out of one envelope.',
  input: ExpenseInputSchema,
  request: (body) => ({ method: 'POST', path: '/api/expenses', body }),
});

export const ListTransactionsInputSchema = z.strictObject({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  kind: z.enum(['sale', 'expense']).optional(),
});

export const listTransactions = defineRead({
  name: 'list_transactions',
  description: 'The sales and expenses the farmer recorded, newest first, by month or kind.',
  input: ListTransactionsInputSchema,
  run: ({ month, kind }, { farm }) =>
    recordedTransactions(farm.transactions ?? [])
      .filter((t) => (!month || t.occurred_at.startsWith(month)) && (!kind || t.kind === kind))
      .map((t) => ({
        id: t.id,
        kind: t.kind,
        category: t.category,
        cropId: t.crop_id,
        amount: t.amount_bani,
        date: t.occurred_at.slice(0, 10),
        note: t.note,
      })),
});

export const UndoTransactionInputSchema = z.strictObject({ id: z.uuid() });

export const undoTransaction = defineWrite({
  name: 'undo_transaction',
  description: 'Removes a recorded sale or expense and restores its envelope.',
  input: UndoTransactionInputSchema,
  access: 'user',
  request: ({ id }) => ({ method: 'DELETE', path: `/api/transactions/${id}` }),
  repeatSafe: 'gone',
});

// ── Tasks ───────────────────────────────────────────────────────────────────

export const ListTasksInputSchema = z.strictObject({ status: z.enum(['open', 'done', 'all']).default('open') });

export const listTasks = defineRead({
  name: 'list_tasks',
  description: 'Deadlines and paperwork in the next 12 months, soonest first, open or done.',
  input: ListTasksInputSchema,
  run: ({ status }, { plan, farm, data }) => tasksForFarm(plan, farm, data, status),
  sources: (tasks) => tasks.flatMap((t) => (t.sourceUrl ? [{ title: t.titleRo, url: t.sourceUrl }] : [])),
});

const TaskInput = z.strictObject({ id: TaskIdSchema });
const taskPath = (id: string) => `/api/tasks/${encodeURIComponent(id)}`;

export const completeTask = defineWrite({
  name: 'complete_task',
  description: 'Marks a task as done.',
  input: TaskInput,
  request: ({ id }) => ({ method: 'PUT', path: taskPath(id) }),
});

export const reopenTask = defineWrite({
  name: 'reopen_task',
  description: 'Marks a finished task as not done, after a mistaken tap.',
  input: TaskInput,
  request: ({ id }) => ({ method: 'DELETE', path: taskPath(id) }),
  repeatSafe: 'gone',
});

// ── Farm ────────────────────────────────────────────────────────────────────

export const updateFarm = defineWrite({
  name: 'update_farm',
  description: 'Changes the farm details, parcels or starting money. This changes the subsidy estimate.',
  input: UpdateFarmInputSchema,
  request: (body) => ({ method: 'PUT', path: '/api/farmers/me', body }),
});

export const saveHarvests = defineWrite({
  name: 'save_harvests',
  description: 'Saves the harvest years, closed crops and gathered grain. This replaces what was saved before.',
  input: HarvestsInputSchema,
  request: (body) => ({ method: 'PUT', path: '/api/farmers/me/harvests', body }),
});

// ── What a crop costs ───────────────────────────────────────────────────────

export const getCropCosts = defineRead({
  name: 'get_crop_costs',
  description:
    "What each crop costs in the plan for a whole season, per hectare and in total, whether that is the farmer's own figure or the average, and the usual range.",
  input: NoInput,
  run: (_input, { plan, farm, data }) =>
    plan.economics.map((e) => {
      const known = data.crops.crops.find((c) => c.id === e.cropId);
      const own = farm.harvests?.expected?.find((x) => x.cropId === e.cropId)?.costLeiPerHa;
      return {
        cropId: e.cropId,
        areaAri: e.areaAri,
        costPerHa: e.costPerHa,
        total: e.cost,
        source: isOwnCrop(e.cropId) ? 'farmer_added_crop' : own != null ? 'farmer' : 'average',
        usualPerHa: known ? { min: known.cost_lei_per_ha.min * 100, max: known.cost_lei_per_ha.max * 100 } : null,
      };
    }),
});

export const GetCostPerHectareInputSchema = z.strictObject({
  harvestYear: HarvestYearSchema.optional(),
  cropId: z.string().min(1).max(40).optional(),
});

export const getCostPerHectare = defineRead({
  name: 'get_cost_per_hectare',
  description:
    "What each crop really cost per hectare, added up from the expenses the farmer recorded: by category, recorded for the crop (direct) or its part of whole-farm costs by hectares (shared). perHa counts everything; planPerHa only what a plan cost stands for. seasonDone false means the figures are only so far.",
  input: GetCostPerHectareInputSchema,
  run: ({ harvestYear, cropId }, { farm, data, today }) =>
    storedHarvestCosts(farm, data, today)
      .filter((h) => harvestYear === undefined || h.year === harvestYear)
      .map((h) => ({ ...h, crops: h.crops.filter((c) => cropId === undefined || c.cropId === cropId) })),
});

export const setCropCost = defineWrite({
  name: 'set_crop_cost',
  description:
    "Changes what a crop costs per hectare for the whole season in the plan. Give costLeiPerHa (null goes back to the average), or fromHarvestYear to use what the farmer's recorded expenses add up to in that finished harvest.",
  input: SetCropCostInputSchema,
  request: (body) => ({ method: 'PUT', path: '/api/farmers/me/crop-cost', body }),
});

// ── Papers the farmer uploads ─────────────────────────────────────────────────

export const readDocument = defineWrite({
  name: 'read_document',
  timeout: 'upload',
  description: 'Reads an uploaded paper and returns the fields to confirm. It saves nothing, and the file is not kept.',
  input: ReadDocumentInputSchema,
  access: 'user',
  request: (body) => ({ method: 'POST', path: '/api/documents/read', body }),
});

export const saveApiaDecision = defineWrite({
  name: 'save_apia_decision',
  description: 'Saves the total from the APIA payment decision. It replaces the estimate in the plan and is not money received.',
  input: ApiaDecisionSchema,
  access: 'user',
  request: (body) => ({ method: 'PUT', path: '/api/farmers/me/apia-decision', body }),
});

export const clearApiaDecision = defineWrite({
  name: 'clear_apia_decision',
  description: 'Removes the saved payment decision, so the plan goes back to the estimate.',
  input: NoInput,
  access: 'user',
  request: () => ({ method: 'DELETE', path: '/api/farmers/me/apia-decision' }),
});

// ── Exchange rates ──────────────────────────────────────────────────────────

export const getExchangeRates = defineRead({
  name: 'get_exchange_rates',
  description: 'Daily rates for RON, USD and GBP against EUR, with their date. Null when no rates are available. Never used for subsidies.',
  input: NoInput,
  runs: 'api',
  usesRates: true,
  run: (_input, { rates = null, today }) => rates && { ...rates, base: 'EUR' as const, old: ratesAreOld(rates, today) },
});

export const ConvertCurrencyInputSchema = z.strictObject({
  /** Whole bani or cents. */
  amount: z.number().int(),
  from: CurrencySchema,
  to: CurrencySchema,
});

export const convertCurrency = defineRead({
  name: 'convert_currency',
  description: 'Converts an amount in whole bani or cents between RON, EUR, USD and GBP. Null when no rates are available.',
  input: ConvertCurrencyInputSchema,
  usesRates: true,
  run: ({ amount, from, to }, { rates = null }) =>
    rates && { amount: convertAmount(amount, from, to, rates), currency: to, ratesDate: rates.date },
});

// ── Pension ─────────────────────────────────────────────────────────────────

const PensionFundId = z.enum(loadData().pensionFunds.funds.map((f) => f.id) as [string, ...string[]]);

export const SimulatePensionInputSchema = z.strictObject({
  monthly: Amount,
  returnPct: z.number().min(0).max(20).optional(),
  /** Defaults to the fund the farmer saved. */
  fundId: PensionFundId.optional(),
});

export const simulatePensionFn = defineRead({
  name: 'simulate_pension',
  description: 'A simulation of monthly pension savings up to age 65, at the given return or at three illustrative ones. Also says if the amount is under the fund minimum. Not investment advice.',
  input: SimulatePensionInputSchema,
  run: ({ monthly, returnPct, fundId }, { farm, data }) => {
    const age = ageFromBirthYear(farm.birth_year, data.subsidies.meta.campaign_year);
    const targetAge = data.params.pension_target_age.value;
    if (age >= targetAge) return null;
    const { low, probable, high } = data.params.pension_return_pct;
    const results = (returnPct === undefined ? [low, probable, high] : [returnPct]).map((pct) => {
      const { total, monthlyEquivalent } = simulatePension({ age, monthly, annualPct: pct, targetAge });
      return { returnPct: pct, total, monthlyEquivalent };
    });
    const { months, paidIn } = simulatePension({ age, monthly, annualPct: 0, targetAge });
    const minimum = pensionMinimum(data, fundId ?? farm.pension_fund_id);
    return {
      age,
      targetAge,
      months,
      paidIn,
      results,
      illustrative: true,
      minimum: minimum.amount,
      minimumVerified: minimum.verified,
      belowMinimum: monthly < minimum.amount,
    };
  },
  unverified: (output) => (output && !output.minimumVerified ? ['pension_fund_minimum'] : []),
});

export const WhatIfPensionInputSchema = z.strictObject({
  /** Whole lei a month; 0 means no pension. */
  monthlyLei: z.number().int().min(0).max(1_000_000),
  fundId: PensionFundId.optional(),
});

export const whatIfPensionFn = defineRead({
  name: 'what_if_pension',
  description: 'What the salary would be with another monthly pension amount, or none, and whether the amount is under the fund minimum. Saves nothing.',
  input: WhatIfPensionInputSchema,
  run: ({ monthlyLei, fundId }, { plan, farm, data }) => whatIfPension(plan, farm, data, leiToBani(monthlyLei), fundId),
  unverified: (output) => (output && !output.minimumVerified ? ['pension_fund_minimum'] : []),
});

export const suggestPensionFn = defineRead({
  name: 'suggest_pension',
  description: "A monthly pension amount: the usual share of the salary, but never under the chosen fund's minimum. Says when that minimum goes above the usual share.",
  input: z.strictObject({ fundId: PensionFundId.optional() }),
  run: ({ fundId }, { plan, farm, data }) => {
    const salary = plan.salary.salary;
    const { monthly, amount, fund, verified, aboveShare } = suggestPension(salary, data, fundId ?? farm.pension_fund_id);
    return {
      monthly,
      salary,
      maxPctOfSalary: data.params.pension_suggest_max_pct_of_salary.value,
      aboveShare,
      minimum: amount,
      minimumVerified: verified,
      fundId: fund?.id ?? null,
      fundName: fund?.name ?? null,
    };
  },
  unverified: (output) => (output.minimumVerified ? [] : ['pension_fund_minimum']),
});

export const listPensionFunds = defineRead({
  name: 'list_pension_funds',
  description: 'The Pilon III funds in alphabetical order, each with its minimum monthly amount, and the one the farmer chose. Never recommend one: the farmer chooses.',
  input: NoInput,
  run: (_input, { farm, data }) => ({
    chosen: farm.pension_fund_id ?? null,
    funds: data.pensionFunds.funds.map((f) => ({
      id: f.id,
      name: f.name,
      administrator: f.administrator,
      /** Null when the sources are missing or disagree. */
      minimum: f.min_monthly_lei === null ? null : leiToBani(f.min_monthly_lei),
      verified: f.status !== 'DE-VERIFICAT',
      sourceUrl: f.source_url,
    })),
  }),
  sources: ({ funds }) => funds.map((f) => ({ title: f.name, url: f.sourceUrl })),
  unverified: ({ funds }) => (funds.some((f) => !f.verified) ? ['pension_fund_minimum'] : []),
});

export const SetPensionFundInputSchema = z.strictObject({ fundId: PensionFundId.nullable() });

export const setPensionFund = defineWrite({
  name: 'set_pension_fund',
  timeout: 'money',
  description: 'Saves the Pilon III fund the farmer chose, or null to clear it. No money moves.',
  input: SetPensionFundInputSchema,
  request: (body) => ({ method: 'PUT', path: '/api/pension/fund', body }),
});

export const StartPensionInputSchema = z.strictObject({
  /** Whole lei a month, inside the slider range the API checks. */
  monthlyLei: z.number().int().positive().max(1_000_000),
});

export const startPension = defineWrite({
  name: 'start_pension',
  timeout: 'money',
  description: "Starts the monthly pension payment. Simulated in test mode.",
  input: StartPensionInputSchema,
  request: (body) => ({ method: 'POST', path: '/api/pension', body }),
});

export const changePension = defineWrite({
  name: 'change_pension',
  timeout: 'money',
  description: 'Changes the monthly pension amount from the next payment on, and fixes the salary again. Simulated in test mode.',
  input: StartPensionInputSchema,
  request: (body) => ({ method: 'PUT', path: '/api/pension', body }),
});

export const stopPension = defineWrite({
  name: 'stop_pension',
  timeout: 'money',
  description: 'Stops the monthly pension payments. What was paid stays put away, and the salary is fixed again. Simulated in test mode.',
  input: z.strictObject({}),
  request: () => ({ method: 'DELETE', path: '/api/pension' }),
});

// ── Stripe money flow ───────────────────────────────────────────────────────

export const getPayouts = defineRead({
  name: 'get_payouts',
  description: 'Salaries scheduled and paid, and pension payments made, newest first.',
  input: NoInput,
  run: (_input, { farm }) => ({
    salaries: [...(farm.payouts ?? [])]
      .sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for))
      .map((p) => ({ month: p.scheduled_for.slice(0, 7), amount: p.amount_bani, status: p.status })),
    pension: (farm.transactions ?? [])
      .filter((t) => t.kind === 'pension' || t.source === 'subscription')
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .map((t) => ({ date: t.occurred_at.slice(0, 10), amount: Math.abs(t.amount_bani) })),
  }),
});

export const simulateApiaAdvance = defineWrite({
  name: 'simulate_apia_advance',
  timeout: 'long',
  description: 'Demo only: sends the farm its APIA advance through Stripe test mode.',
  input: NoInput,
  access: 'user',
  request: () => ({ method: 'POST', path: '/api/demo/income', body: { kind: 'apia_advance' } }),
});

export const AdvanceClockInputSchema = z.strictObject({
  months: z.number().int().min(1).max(12),
  /** The demo date the phone saw: the same tap sent twice moves the clock once. */
  from: z.string().max(40).optional(),
});

export const advanceClock = defineWrite({
  name: 'advance_clock',
  timeout: 'long',
  description: 'Demo only: moves the clock forward, paying each salary and pension on the way.',
  input: AdvanceClockInputSchema,
  access: 'user',
  request: (body) => ({ method: 'POST', path: '/api/demo/advance', body }),
});

// ── Funding opportunities and official sources ───────────────────────────────

const OPPORTUNITY_SOURCE_LIMIT = 5;
const linksTo = (rows: { title: string; url: string }[]) =>
  rows.slice(0, OPPORTUNITY_SOURCE_LIMIT).map((r) => ({ title: r.title, url: r.url }));

const IsoDateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const OpportunityKeySchema = z.strictObject({ key: z.string().min(1).max(300) });

export const SearchOpportunitiesInputSchema = z.strictObject({
  text: z.string().max(200).optional(),
  programme: z.string().max(200).optional(),
  status: z.enum(['announced', 'open', 'closed', 'unknown']).optional(),
  closesBy: IsoDateInput.optional(),
  minBudgetEur: z.number().nonnegative().optional(),
  includeNotRelevant: z.boolean().optional(),
});

export const searchOpportunities = defineRead({
  name: 'search_opportunities',
  description: 'Funding calls by text, programme, status, deadline and money allocated, with source links.',
  input: SearchOpportunitiesInputSchema,
  runs: 'api',
  needs: ['opportunities'],
  run: (input, { monitor, today }) => filterOpportunities(monitor?.opportunities ?? [], input, today),
  sources: (rows) => linksTo(rows),
});

export const getOpportunity = defineRead({
  name: 'get_opportunity',
  description: 'One funding call in full, with its relevance note, the source text and how it fits this farm.',
  input: OpportunityKeySchema,
  runs: 'api',
  needs: ['opportunities'],
  run: ({ key }, { monitor, today, farm, data }) => {
    const rows = monitor?.opportunities ?? [];
    const found = rows.find((o) => o.stable_key === key);
    if (!found) return null;
    const { forYou, check, notForYou } = matchOpportunityRows([found], farm, data, today);
    const match = forYou[0] ?? check[0] ?? notForYou[0];
    return {
      ...opportunityRow(found, today),
      evidence: found.evidence,
      good: match?.good ?? [],
      doubts: match?.doubts ?? [],
      following: (farm.opportunity_follows ?? []).some((f) => f.stable_key === key),
    };
  },
  sources: (row) => (row ? linksTo([row]) : []),
});

export const matchOpportunities = defineRead({
  name: 'match_opportunities',
  description: 'Funding calls ranked for this farm, with reasons and doubts. A first filter, not a decision on who can apply.',
  input: NoInput,
  runs: 'api',
  needs: ['opportunities'],
  run: (_input, { monitor, farm, data, today }) => matchOpportunityRows(monitor?.opportunities ?? [], farm, data, today),
  sources: ({ forYou, check }) => linksTo([...forYou, ...check]),
});

export const ListClosingSoonInputSchema = z.strictObject({ days: z.number().int().positive().max(365).optional() });

export const listClosingSoon = defineRead({
  name: 'list_closing_soon',
  description: 'Funding calls closing soon, by deadline.',
  input: ListClosingSoonInputSchema,
  runs: 'api',
  needs: ['opportunities'],
  run: ({ days }, { monitor, data, today }) =>
    closingSoonRows(monitor?.opportunities ?? [], days ?? data.params.opportunities_closing_soon_days.value, today),
  sources: (rows) => linksTo(rows),
});

const RecentInputSchema = z.strictObject({ days: z.number().int().positive().max(365).optional() });

export const listOpportunityChanges = defineRead({
  name: 'list_opportunity_changes',
  description: 'New funding calls, and deadlines or amounts that changed.',
  input: RecentInputSchema,
  runs: 'api',
  needs: ['opportunities', 'opportunityEvents'],
  run: ({ days }, { monitor, data, today }) =>
    opportunityChangeRows(
      monitor?.opportunityEvents ?? [],
      monitor?.opportunities ?? [],
      days ?? data.params.opportunities_changes_days.value,
      today,
    ),
  sources: (rows) => linksTo(rows),
});

export const followOpportunity = defineWrite({
  name: 'follow_opportunity',
  description: "Puts a funding call's deadline in the farmer's calendar.",
  input: OpportunityKeySchema,
  request: (body) => ({ method: 'POST', path: '/api/opportunities/follow', body }),
});

export const unfollowOpportunity = defineWrite({
  name: 'unfollow_opportunity',
  description: "Takes a funding call out of the farmer's calendar.",
  input: OpportunityKeySchema,
  access: 'user',
  request: (body) => ({ method: 'POST', path: '/api/opportunities/unfollow', body }),
});

export const ListRecentChangesInputSchema = RecentInputSchema.extend({ institution: z.string().max(100).optional() });

export const listRecentChanges = defineRead({
  name: 'list_recent_changes',
  description: 'Official pages that changed recently.',
  input: ListRecentChangesInputSchema,
  runs: 'api',
  needs: ['sourceChanges'],
  run: ({ days, institution }, { monitor, data, today }) =>
    sourceChangeRows(monitor?.sourceChanges ?? [], { institution, days: days ?? data.params.opportunities_changes_days.value }, today),
  sources: (rows) => linksTo(rows),
});

export const getSourceChange = defineRead({
  name: 'get_source_change',
  description: 'What changed on one official page: a short diff and the source link.',
  input: z.strictObject({ id: z.number().int().positive() }),
  runs: 'api',
  needs: ['sourceChanges'],
  run: ({ id }, { monitor }) => monitor?.sourceChanges?.find((c) => c.id === id) ?? null,
  sources: (row) => (row ? linksTo([row]) : []),
});

export const SearchDocumentsInputSchema = z.strictObject({
  text: z.string().min(2).max(200),
  institution: z.string().max(100).optional(),
});

export const searchDocuments = defineRead({
  name: 'search_documents',
  description: 'Passages from official documents that match the text, with source links.',
  input: SearchDocumentsInputSchema,
  runs: 'api',
  needs: ['passages'],
  run: (_input, { monitor }) => monitor?.passages ?? [],
  sources: (rows) => linksTo(rows),
});

export const listSources = defineRead({
  name: 'list_sources',
  description: 'The official sources being watched: state and last check.',
  input: z.strictObject({ institution: z.string().max(100).optional() }),
  runs: 'api',
  needs: ['sources'],
  run: ({ institution }, { monitor }) =>
    (monitor?.sources ?? []).filter((s) => !institution || plainText(s.institution).includes(plainText(institution))),
});

// ── Registry ────────────────────────────────────────────────────────────────

/** Every function that buttons and AI tools share. The full list is in docs/functions.md. */
export const FUNCTIONS: readonly (ReadFunction | WriteFunction)[] = [
  estimateSubsidy,
  checkScheme,
  listSchemes,
  explainSubsidyFn,
  whatIfSubsidyFn,
  getSubsidyPayments,
  getPlan,
  getSalary,
  explainSalaryFn,
  getForecast,
  getTightMonths,
  getAfterBadHarvest,
  listUpcoming,
  suggestCreditFn,
  whatIfCreditFn,
  getFarm,
  checkPurchaseFn,
  whatIfPensionFn,
  listCredits,
  addCredit,
  removeCredit,
  getEnvelopes,
  proposeSplitFn,
  saveEnvelopes,
  simulatePensionFn,
  suggestPensionFn,
  listPensionFunds,
  setPensionFund,
  searchOpportunities,
  getOpportunity,
  matchOpportunities,
  listClosingSoon,
  listOpportunityChanges,
  followOpportunity,
  unfollowOpportunity,
  listRecentChanges,
  getSourceChange,
  searchDocuments,
  listSources,
  startPension,
  changePension,
  stopPension,
  getPayouts,
  simulateApiaAdvance,
  advanceClock,
  recordSale,
  addExpense,
  listTransactions,
  undoTransaction,
  listTasks,
  completeTask,
  reopenTask,
  updateFarm,
  saveHarvests,
  getCropCosts,
  getCostPerHectare,
  setCropCost,
  readDocument,
  saveApiaDecision,
  clearApiaDecision,
  getExchangeRates,
  convertCurrency,
];

export function findFunction(name: string): ReadFunction | WriteFunction | undefined {
  return FUNCTIONS.find((f) => f.name === name);
}

/** The functions that can run straight away, for the API route and the AI. */
export function findRead(name: string): ReadFunction | undefined {
  const fn = findFunction(name);
  return fn?.access === 'read' ? fn : undefined;
}
