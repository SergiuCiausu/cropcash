import { z } from 'zod';

export const StatusSchema = z.enum([
  'confirmat-2026',
  'confirmat',
  'din-2025',
  'din-2024',
  'din-2020',
  'din-brief',
  'DE-VERIFICAT',
]);
export type Status = z.infer<typeof StatusSchema>;

export const ProfileFieldSchema = z.enum([
  'total_ha',
  'arable_ha',
  'distinct_crops',
  'age',
  'dairy_cows',
  'beef_cattle',
  'unproductive_ha',
]);
export type ProfileField = z.infer<typeof ProfileFieldSchema>;

export const OpSchema = z.enum(['<', '<=', '>', '>=', '==', '!=']);
export type Op = z.infer<typeof OpSchema>;

export const ConditionSchema = z.object({
  field: ProfileFieldSchema,
  op: OpSchema,
  value: z.number(),
  status: StatusSchema.optional(),
  note: z.string().optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const ConditionalRuleSchema = z.object({
  if: ConditionSchema,
  then: z.array(ConditionSchema),
  status: StatusSchema.optional(),
  note: z.string().optional(),
});
export type ConditionalRule = z.infer<typeof ConditionalRuleSchema>;

export const RuleSchema = z.union([ConditionalRuleSchema, ConditionSchema]);
export type Rule = z.infer<typeof RuleSchema>;

export const FundSchema = z.enum(['FEGA', 'FEADR']);
export type Fund = z.infer<typeof FundSchema>;

export const SchemeSchema = z.object({
  code: z.string(),
  name_ro: z.string(),
  /** Disabled schemes are kept in data but ignored by the engine (e.g. animals: future plan). */
  enabled: z.boolean().default(true),
  disabled_reason: z.string().optional(),
  unit: z.enum(['ha', 'cap']),
  units_field: ProfileFieldSchema,
  amount_eur: z.number().positive().nullable(),
  advance_pct: z.number().min(0).max(100).nullable(),
  advance_amount_eur: z.number().nullable(),
  fund: FundSchema,
  max_ha: z.number().positive().nullable(),
  eligibility: z.object({
    rules: z.array(RuleSchema),
    parcel_min_ha: z.object({ value: z.number().positive(), status: StatusSchema }).optional(),
  }),
  combinable_with: z.array(z.string()),
  source_url: z.string().url().nullable(),
  year: z.number().int(),
  status: StatusSchema,
});
export type Scheme = z.infer<typeof SchemeSchema>;

export const ExchangeRateSchema = z.object({
  campaign: z.number().int(),
  fund: FundSchema,
  value: z.number().positive().nullable(),
  default_param: z.number().positive().optional(),
  unit: z.literal('lei/EUR'),
  source_url: z.string().url().nullable(),
  status: StatusSchema,
});
export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;

export const SubsidyTestCaseSchema = z.object({
  id: z.string(),
  input: z.object({
    total_ha: z.number(),
    arable_ha: z.number(),
    distinct_crops: z.number().int(),
    age: z.number().int(),
    dairy_cows: z.number().int(),
    beef_cattle: z.number().int(),
    unproductive_ha: z.number(),
  }),
  expected_schemes: z.array(z.string()),
  expected_total_eur: z.number(),
  expected_by_scheme_eur: z.record(z.string(), z.number()),
  exchange_rate_param: z.number(),
  expected_total_lei: z.number(),
  expected_advance_lei: z.number(),
});

export const SubsidiesFileSchema = z.object({
  meta: z.object({ campaign_year: z.number().int() }).passthrough(),
  exchange_rates: z.array(ExchangeRateSchema),
  schemes: z.array(SchemeSchema),
  test_cases: z.array(SubsidyTestCaseSchema),
});
export type SubsidiesFile = z.infer<typeof SubsidiesFileSchema>;

const YearValueSchema = z.object({
  year: z.number().int(),
  value: z.number(),
  status: StatusSchema.optional(),
  note: z.string().optional(),
  is_reference: z.boolean().optional(),
});

export const SchemeHistorySchema = z
  .object({
    actual: z.array(YearValueSchema).optional(),
    planned_pns: z.array(YearValueSchema).optional(),
  })
  .passthrough();

export const HistoryFileSchema = z.object({
  schemes: z.record(z.string(), SchemeHistorySchema),
  range_policy: z
    .object({
      fallback_scheme: z.string(),
    })
    .passthrough(),
});
export type HistoryFile = z.infer<typeof HistoryFileSchema>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const CalendarEventSchema = z.object({
  id: z.string(),
  type: z.enum(['income', 'admin', 'deadline']),
  title_ro: z.string(),
  start: IsoDate.nullable(),
  end: IsoDate.nullable(),
  share_pct: z.number().optional(),
  relative_days: z.number().optional(),
  note: z.string().optional(),
  status: StatusSchema,
  source_url: z.string().url().nullable(),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export const CalendarFileSchema = z.object({
  meta: z.object({ campaign_year: z.number().int() }).passthrough(),
  events: z.array(CalendarEventSchema),
});
export type CalendarFile = z.infer<typeof CalendarFileSchema>;

const Param = z.object({ value: z.number().nullable() }).passthrough();
const PositiveParam = z.object({ value: z.number().positive() }).passthrough();

export const PlanParamsFileSchema = z.object({
  salary_round_lei: PositiveParam,
  credit_round_lei: PositiveParam,
  risk_fund_pct_of_inflow: z.object({ value: z.number().min(0).max(100) }).passthrough(),
  pension_suggest_max_pct_of_salary: z.object({ value: z.number().min(0).max(100) }).passthrough(),
  pension: z.object({
    target_age: PositiveParam,
    annual_return_pct: z
      .object({ low: z.number().min(0), probable: z.number().min(0), high: z.number().min(0) })
      .passthrough(),
    payout_years: PositiveParam,
    round_lei: PositiveParam,
    slider_min_lei: PositiveParam,
    slider_max_lei: PositiveParam,
    slider_step_lei: PositiveParam,
  }),
  bad_year: z.object({
    threshold_pct_of_mean: z.object({ value: z.number().min(0).max(100) }).passthrough(),
    window_years: PositiveParam,
  }),
  credit: z.object({
    max_pct_of_subsidy: z.object({ value: z.number().min(0).max(100) }).passthrough(),
    bank_margin_over_robor_pct: Param,
    ifn_margin_over_robor_pct: Param,
    robor_6m_pct: Param,
  }),
});
export type PlanParamsFile = z.infer<typeof PlanParamsFileSchema>;

export const CountiesFileSchema = z.object({
  counties: z.array(z.object({ code: z.string(), name_ro: z.string() })).min(42),
});
export type CountiesFile = z.infer<typeof CountiesFileSchema>;

const MinMeanMax = z.object({ min: z.number(), mean: z.number(), max: z.number() });

export const CropSchema = z.object({
  id: z.string(),
  name_ro: z.string(),
  cost_lei_per_ha: MinMeanMax,
  yield_t_per_ha: MinMeanMax,
  price_lei_per_kg: MinMeanMax,
  expense_months: z.array(
    z.object({
      month: z.number().int().min(1).max(12),
      share_pct: z.number().min(0).max(100),
      what_ro: z.string(),
    }),
  ),
  harvest_month: z.number().int().min(1).max(12),
  sale_month_default: z.number().int().min(1).max(12),
  status: StatusSchema,
});
export type Crop = z.infer<typeof CropSchema>;

/** One year of county-level yield for a crop (INS). Empty until the data is downloaded. */
export const CountyYieldSchema = z.object({
  county: z.string(),
  crop_id: z.string(),
  year: z.number().int(),
  yield_t_per_ha: z.number().nonnegative(),
});
export type CountyYield = z.infer<typeof CountyYieldSchema>;

export const CropsFileSchema = z.object({
  meta: z.object({ source_url: z.string().url() }).passthrough(),
  crops: z.array(CropSchema),
  county_history: z.object({ status: StatusSchema, data: z.array(CountyYieldSchema) }).passthrough(),
});
export type CropsFile = z.infer<typeof CropsFileSchema>;
