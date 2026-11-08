import { z } from 'zod';

export const StatusSchema = z.enum([
  'confirmat-2026',
  'confirmat',
  'din-2025',
  'din-2024',
  'din-2020',
  'din-brief',
  /** Typed in by the farmer for a crop of their own (P30). */
  'de-la-fermier',
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
  pension_suggest_min_lei: PositiveParam,
  calendar_reminder_days: PositiveParam,
  calendar_reminder_hour: PositiveParam,
  opportunities_closing_soon_days: PositiveParam,
  opportunities_changes_days: PositiveParam,
  documents: z.object({
    max_mb: PositiveParam,
    max_pages: PositiveParam,
    photo_long_side_px: PositiveParam,
    reads_per_day: PositiveParam,
  }),
  sources: z.object({
    page_size: PositiveParam,
    farmer_max: PositiveParam,
    adds_per_day: PositiveParam,
    ip_adds_per_day: PositiveParam,
    pages_max: PositiveParam,
    reads_at_once: PositiveParam,
    max_mb: PositiveParam,
    read_timeout_s: PositiveParam,
    add_deadline_s: PositiveParam,
    monitor_deadline_s: PositiveParam,
    preview_chars: PositiveParam,
    text_chars: PositiveParam,
  }),
  pension_round_lei: PositiveParam,
  pension_demo_lei: PositiveParam,
  pension_target_age: PositiveParam,
  pension_return_pct: z.object({ low: z.number().min(0), probable: z.number().min(0), high: z.number().min(0) }).passthrough(),
  credit: z.object({
    max_pct_of_subsidy: z.object({ value: z.number().min(0).max(100) }).passthrough(),
    bank_margin_over_robor_pct: Param,
    ifn_margin_over_robor_pct: Param,
    robor_6m_pct: Param,
  }),
  yield_history: z.object({
    window_years: PositiveParam,
    extreme_years: PositiveParam,
    min_years: PositiveParam,
  }),
  long_forecast: z.object({
    max_years: PositiveParam,
    subsidy_rules_until_year: PositiveParam,
  }),
  weather: z.object({
    forecast_days: z.object({ value: z.number().int().min(1).max(16) }).passthrough(),
    cache_hours: PositiveParam,
    retry_minutes: PositiveParam,
    timeout_seconds: PositiveParam,
    frost_min_c: z.object({ value: z.number() }).passthrough(),
    spray_wind_max_kmh: Param,
  }),
  /** How long the phone waits on the API, and how the outbox retries (docs/failure-handling-plan.md). */
  network: z.object({
    read_timeout_s: PositiveParam,
    write_timeout_s: PositiveParam,
    money_timeout_s: PositiveParam,
    setup_timeout_s: PositiveParam,
    long_timeout_s: PositiveParam,
    health_timeout_s: PositiveParam,
    ai_timeout_s: PositiveParam,
    upload_timeout_s: PositiveParam,
    slow_hint_s: PositiveParam,
    ping_retry_s: PositiveParam,
    outbox_retry_s: z.object({ values: z.array(z.number().positive()).min(1) }).passthrough(),
    outbox_jitter_pct: z.object({ value: z.number().min(0).max(100) }).passthrough(),
    outbox_max_tries: PositiveParam,
    outbox_give_up_hours: PositiveParam,
  }),
});
export type PlanParamsFile = z.infer<typeof PlanParamsFileSchema>;

export const PensionFundsFileSchema = z.object({
  funds: z
    .array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9-]+$/),
          name: z.string().min(1),
          administrator: z.string().min(1).nullable(),
          min_monthly_lei: z.number().positive().nullable(),
          status: z.enum(['confirmat-administrator', 'DE-VERIFICAT']),
          source_url: z.url(),
        })
        .passthrough(),
    )
    .min(1),
});
export type PensionFundsFile = z.infer<typeof PensionFundsFileSchema>;

/** A sourced figure: din-presă = from a dated article, DE-VERIFICAT = unconfirmed (docs/11). */
const SourcedStatus = z.enum(['din-presă', 'DE-VERIFICAT']);
const SourcedFigure = z.object({ value: z.number().positive(), status: SourcedStatus, source_url: z.url() }).passthrough();

export const PensionOptionsFileSchema = z.object({
  state: z.object({
    optional_contract_monthly_lei: SourcedFigure.extend({ from: z.iso.date() }),
    optional_declaration_yearly_lei: SourcedFigure,
    minimum_pension_monthly_lei: SourcedFigure,
    minimum_pension_years: SourcedFigure.extend({ value: z.number().int().positive() }),
  }),
  cei: z
    .object({ available_from: z.iso.date(), ceiling_yearly_lei: z.number().positive().nullable(), status: SourcedStatus, source_url: z.url() })
    .passthrough(),
  pilon3: z.object({ status: SourcedStatus, source_url: z.url() }).passthrough(),
});
export type PensionOptionsFile = z.infer<typeof PensionOptionsFileSchema>;
export type PensionFund = PensionFundsFile['funds'][number];

export const CountiesFileSchema = z.object({
  counties: z
    .array(
      z.object({
        code: z.string(),
        name_ro: z.string(),
        region_ro: z.string(),
        seat_ro: z.string(),
        lat: z.number().min(43).max(49),
        lon: z.number().min(20).max(30),
      }),
    )
    .min(42),
});
export type CountiesFile = z.infer<typeof CountiesFileSchema>;

const MinMeanMax = z.object({ min: z.number(), mean: z.number(), max: z.number() });

export const CropSchema = z.object({
  id: z.string(),
  name_ro: z.string(),
  /** With the article, for sentences: "Vinzi grâul". A farmer's own crop has none. */
  name_ro_art: z.string().optional(),
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
  /** The month it goes into the ground. Crops sown in autumn are harvested the next year. */
  sowing_month: z.number().int().min(1).max(12),
  harvest_month: z.number().int().min(1).max(12),
  sale_month_default: z.number().int().min(1).max(12),
  status: StatusSchema,
  /** Set when the yields come from the INS history: which area and harvests (cashflow/county-yields). */
  yield_basis: z.object({ area: z.string(), from: z.number().int(), to: z.number().int() }).optional(),
});
export type Crop = z.infer<typeof CropSchema>;

/** Yearly yields (INS AGR110A): area code → crop id → one value per year from first_year, in kg/ha. */
export const CountyHistorySchema = z
  .object({
    status: StatusSchema,
    source_url: z.string().url(),
    first_year: z.number().int(),
    data: z.record(z.string(), z.record(z.string(), z.array(z.number().int().positive().nullable()))),
  })
  .passthrough();

export const CropsFileSchema = z.object({
  meta: z.object({ source_url: z.string().url() }).passthrough(),
  crops: z.array(CropSchema),
  county_history: CountyHistorySchema,
});
export type CropsFile = z.infer<typeof CropsFileSchema>;

export const FundingGuidesFileSchema = z.object({
  guides: z.array(
    z.object({
      code: z.string().regex(/^DR-\d+$/),
      title: z.string().min(1),
      url: z.url(),
      /** From the guide: false when only a PFA, an individual or family business or a company can apply. */
      natural_persons_can_apply: z.boolean(),
      facts: z.array(z.object({ text: z.string().min(1), page: z.number().int().positive() })).min(1),
    }),
  ),
});
export type FundingGuidesFile = z.infer<typeof FundingGuidesFileSchema>;
