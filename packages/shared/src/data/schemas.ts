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
  /** Uncultivated land as a share of arable land. Rules give it in %, the profile keeps hundredths of a %. */
  'unproductive_pct',
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
  /**
   * When amount_eur is still null: a past year's amount to show as an estimate. It is shown apart
   * and never enters the totals, so the salary and pension don't plan on it.
   */
  estimate: z
    .object({
      amount_eur: z.number().positive(),
      basis_year: z.number().int(),
      status: StatusSchema,
      source_url: z.string().url().nullable(),
      note: z.string().optional(),
    })
    .optional(),
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
    unproductive_pct: z.number().optional(),
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
  /** The last date the event repeats on: past it, the yearly projection stops (a scheme that ends). */
  repeat_until: IsoDate.optional(),
  /** Something the farmer must report or file (the „De raportat” screen). */
  obligation: z.boolean().optional(),
  /** Who it's for. Missing: every farm. `fallow`: farms with teren necultivat. `livestock`: farms with animals. */
  applies_to: z.enum(['crops', 'fallow', 'livestock']).optional(),
  /** Where it's filed, when not at APIA's own deadline list (primărie, …). */
  authority: z.string().optional(),
  /** The quarter a quarterly claim is for, as in reports/period.ts: "2026-Q4". */
  period: z.string().regex(/^\d{4}-Q[1-4]$/).optional(),
  documents_ro: z.array(z.string()).optional(),
  how_ro: z.string().optional(),
  /** The report in /rapoarte that prepares it (web/lib/reports/build.ts ReportId). */
  report: z.string().optional(),
  /** Official pages whose change puts this event up for re-checking (subventii-monitor daily report). */
  watch_urls: z.array(z.string().url()).optional(),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export const RecordToKeepSchema = z.object({
  id: z.string(),
  title_ro: z.string(),
  detail_ro: z.string(),
  report: z.string().nullable(),
});

export const CalendarFileSchema = z.object({
  meta: z.object({ campaign_year: z.number().int() }).passthrough(),
  events: z.array(CalendarEventSchema),
  /** What the farmer keeps written all year (registers), for „De raportat”. */
  records: z
    .object({ note: z.string(), status: StatusSchema, source_url: z.string().url(), items: z.array(RecordToKeepSchema) })
    .optional(),
});
export type CalendarFile = z.infer<typeof CalendarFileSchema>;

const Param = z.object({ value: z.number().nullable() }).passthrough();
const PositiveParam = z.object({ value: z.number().positive() }).passthrough();
const MonthsParam = z.object({ value: z.number().int().min(1) }).passthrough();

/** Which end of a min / mean / max figure a kind of year takes. */
export const RangeEndSchema = z.enum(['min', 'mean', 'max']);
export type RangeEnd = z.infer<typeof RangeEndSchema>;

/** One kind of year (bad, normal, good): which end of each figure it uses (docs/11 P4). */
export const YearKindSchema = z.object({
  yield: RangeEndSchema,
  price: RangeEndSchema,
  cost: RangeEndSchema,
  apia_balance: RangeEndSchema,
});
export type YearKind = z.infer<typeof YearKindSchema>;

/** Which day of a payment window the plan uses. */
export const WindowDaySchema = z.enum(['early', 'mid', 'late']);

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
  /** „De raportat” (docs/04-farmer-reports.md): when a deadline shows on Acasă, and how far ahead the page lists. */
  obligation_due_days: PositiveParam,
  obligation_horizon_days: PositiveParam,
  /** The farmer's own events (docs/calendar-events-plan.md). */
  farmer_events: z.object({
    carry_days: PositiveParam,
    whole_harvest_window_months: PositiveParam,
    whole_harvest_match_pct: z.object({ value: z.number().min(0).max(100) }).passthrough(),
    remind_options_days: z.object({ values: z.array(z.number().int().min(0).max(60)).min(1) }).passthrough(),
    drivers_first_rows: PositiveParam,
    drivers_unsure_pct: z.object({ value: z.number().min(0).max(100) }).passthrough(),
    drivers_small_lei: z.object({ value: z.number().min(0) }).passthrough(),
  }),
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
  crop_loss: z.object({
    window_years: PositiveParam,
    min_years: PositiveParam,
  }),
  long_forecast: z.object({
    max_years: PositiveParam,
    subsidy_rules_until_year: PositiveParam,
  }),
  /** The plan's own shape: horizons, days and what each kind of year means (docs/admin-panel-plan.md step 1). */
  forecast: z.object({
    plan_months: MonthsParam,
    after_bad_harvest_months: MonthsParam,
    projection_years: MonthsParam,
    entry_day: z.object({ value: z.number().int().min(1).max(28) }).passthrough(),
    apia_day: z.object({ plan: WindowDaySchema, demo_clock: WindowDaySchema }).passthrough(),
    years: z.object({ bad: YearKindSchema, medium: YearKindSchema, good: YearKindSchema }).passthrough(),
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
  /**
   * 'fallow' = teren necultivat: arable land left unsown. It counts for the subsidies (as arable land,
   * as a crop and as uncultivated land for PD-28) but has no costs, harvest or sale.
   */
  kind: z.enum(['crop', 'fallow']).optional(),
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
  /** APIA crop codes (col. "Cod cultură" on the cerere de plată) that count as this crop. A farmer's own crop has none. */
  apia_codes: z.array(z.number().int().positive()).min(1).optional(),
  /**
   * Set on the crops made from one APIA line of a family (data/catalogue.ts): the family's id. The family's
   * figures, INS history and nitrogen limit are shared; the name is the APIA line's.
   */
  family: z.string().optional(),
  /** Genul botanic from APIA Tabel 1. APIA counts diversification by genus. */
  genus: z.string().nullable().optional(),
  /** The name exactly as printed in APIA Tabel 1. */
  apia_name: z.string().optional(),
  /** Other words farmers use for it, for search and the assistant: "grâu" for Grâu comun de toamnă. */
  aliases: z.array(z.string()).optional(),
});
export type Crop = z.infer<typeof CropSchema>;

/** The one fallow "crop" in docs/data: teren necultivat. Pure code needs the id without the data. */
export const FALLOW_CROP_ID = 'teren-necultivat';
/** Uncultivated land: no costs, harvest or sale, but it counts for the subsidies. */
export const isFallow = (crop: string | Pick<Crop, 'id'> & { kind?: Crop['kind'] }): boolean =>
  typeof crop === 'string' ? crop === FALLOW_CROP_ID : crop.kind === 'fallow' || crop.id === FALLOW_CROP_ID;

/** Yearly yields (INS AGR110A): area code → crop id → one value per year from first_year, in kg/ha. */
export const CountyHistorySchema = z
  .object({
    status: StatusSchema,
    source_url: z.string().url(),
    first_year: z.number().int(),
    data: z.record(z.string(), z.record(z.string(), z.array(z.number().int().positive().nullable()))),
  })
  .passthrough();

export const CropsFileSchema = z
  .object({
    meta: z.object({ source_url: z.string().url(), apia_codes_source_url: z.string().url() }).passthrough(),
    crops: z.array(CropSchema),
    county_history: CountyHistorySchema,
  })
  .superRefine((file, ctx) => {
    /* Fallow land is exactly one crop, with the shared id, and it costs and yields nothing. */
    const fallow = file.crops.filter((c) => c.kind === 'fallow');
    if (fallow.length > 1 || fallow.some((c) => c.id !== FALLOW_CROP_ID))
      ctx.addIssue({ code: 'custom', message: `The only fallow crop must be ${FALLOW_CROP_ID}` });
    for (const c of fallow) {
      const figures = [c.cost_lei_per_ha, c.yield_t_per_ha, c.price_lei_per_kg].flatMap((r) => [r.min, r.mean, r.max]);
      if (c.expense_months.length || figures.some((v) => v !== 0))
        ctx.addIssue({ code: 'custom', message: `${c.id} is fallow: no expense months, costs, yield or price` });
    }
    /* One APIA code read off a paper must lead to exactly one crop. */
    const owner = new Map<number, string>();
    for (const crop of file.crops)
      for (const code of crop.apia_codes ?? []) {
        const other = owner.get(code);
        if (other) ctx.addIssue({ code: 'custom', message: `APIA code ${code} belongs to both ${other} and ${crop.id}` });
        owner.set(code, crop.id);
      }
  });
export type CropsFile = z.infer<typeof CropsFileSchema>;

/** docs/data/apia-crop-codes.json: APIA Tabel 1, one row per crop code, names as printed. */
export const ApiaCropTableSchema = z
  .object({
    meta: z.object({ source_url: z.string().url(), status: StatusSchema }).passthrough(),
    rows: z.array(
      z.object({
        code: z.number().int().positive(),
        genus: z.string().nullable(),
        name: z.string().min(1),
        section: z.string().min(1),
        heading: z.string().nullable(),
      }),
    ),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<number>();
    for (const r of file.rows) {
      if (seen.has(r.code)) ctx.addIssue({ code: 'custom', message: `APIA code ${r.code} appears twice` });
      seen.add(r.code);
    }
  });
export type ApiaCropTable = z.infer<typeof ApiaCropTableSchema>;
export type ApiaCropRow = ApiaCropTable['rows'][number];

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
