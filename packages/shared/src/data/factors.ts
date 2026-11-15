/*
 * Every input of the forecasts an admin may change (docs/admin-panel-plan.md). A path that matches
 * no pattern here can't be changed: the panel is built from this list, and data/overrides.ts refuses
 * anything else. Paths are written against docs/data as it's written (data/files.ts RAW_FILES):
 *
 *   crops.crops[id=grau].price_lei_per_kg.mean
 *   subsidies.schemes[code=PD-01].eligibility.rules[field=total_ha,op=>=].value
 *   history.schemes.PD-01.actual[year=2025].value
 *
 * A `[key=value]` picks the one array item with that value (never by position, so a reordered file
 * keeps every change in place). In a pattern, `*` stands for any key or any selected value.
 * Values are in the file's own unit: lei/kg stays lei/kg, so a change reads like the file it replaces.
 */

export type FactorGroup =
  | 'crops'
  | 'subsidies'
  | 'subsidy_history'
  | 'years'
  | 'horizons'
  | 'salary'
  | 'credit'
  | 'pension'
  | 'calendar'
  | 'weather';

/** The group headings in the panel, in this order. */
export const FACTOR_GROUPS: Record<FactorGroup, string> = {
  crops: 'Culturi',
  subsidies: 'Subvenții APIA',
  subsidy_history: 'Subvenții din anii trecuți',
  years: 'Anul slab, normal și bun',
  horizons: 'Cât de departe se uită planul',
  salary: 'Salariu',
  credit: 'Credit',
  pension: 'Pensie',
  calendar: 'Calendar',
  weather: 'Vreme',
};

interface FactorBase {
  pattern: string;
  group: FactorGroup;
  /** Romanian, plain. The panel adds what the path picks (the crop, the scheme, the year). */
  label: string;
}

export type Factor = FactorBase &
  (
    | {
        type: 'number';
        unit: string;
        min?: number;
        max?: number;
        /** Digits after the decimal point the value may have. 0 = whole numbers. */
        decimals: number;
        /** True when the file may hold null ("no figure yet", DE-VERIFICAT). */
        nullable?: boolean;
      }
    | { type: 'boolean' }
    | {
        type: 'choice';
        options: readonly string[];
        /** What each option means, for the panel. */
        optionLabels?: Readonly<Record<string, string>>;
      }
    | {
        /** One of the keys found at `keysAt` in the same file (e.g. a scheme with history). */
        type: 'key';
        keysAt: string;
      }
  );

const END = ['min', 'mean', 'max'] as const;
const END_LABELS = { min: 'cel mai mic', mean: 'mijlociu', max: 'cel mai mare' } as const;
const WINDOW_DAY_LABELS = { early: 'prima zi', mid: 'mijlocul', late: 'ultima zi' } as const;

const num = (
  pattern: string,
  group: FactorGroup,
  label: string,
  unit: string,
  decimals: number,
  extra: { min?: number; max?: number; nullable?: boolean } = {},
): Factor => ({ pattern, group, label, type: 'number', unit, decimals, min: 0, ...extra });

const whole = (pattern: string, group: FactorGroup, label: string, unit: string, min: number, max?: number): Factor =>
  num(pattern, group, label, unit, 0, { min, max });

const ends = (base: string, group: FactorGroup, what: string, unit: string, decimals: number): Factor[] =>
  END.map((e) => num(`${base}.${e}`, group, `${what}, ${END_LABELS[e]}`, unit, decimals));

const YEAR_KIND_LABEL = { bad: 'Anul slab', medium: 'Anul normal', good: 'Anul bun' } as const;
const YEAR_PART_LABEL = { yield: 'producția', price: 'prețul', cost: 'costurile', apia_balance: 'soldul APIA' } as const;

const yearKinds: Factor[] = (['bad', 'medium', 'good'] as const).flatMap((kind) =>
  (['yield', 'price', 'cost', 'apia_balance'] as const).map(
    (part): Factor => ({
      pattern: `params.forecast.years.${kind}.${part}`,
      group: 'years',
      label: `${YEAR_KIND_LABEL[kind]}: ${YEAR_PART_LABEL[part]}`,
      type: 'choice',
      options: END,
      optionLabels: END_LABELS,
    }),
  ),
);

const CROP = 'crops.crops[id=*]';
const SCHEME = 'subsidies.schemes[code=*]';

export const EDITABLE_FACTORS: readonly Factor[] = [
  // ── Crops (crops-reference.json) ────────────────────────────────────────────
  ...ends(`${CROP}.cost_lei_per_ha`, 'crops', 'Cost pe hectar', 'lei/ha', 0),
  ...ends(`${CROP}.yield_t_per_ha`, 'crops', 'Producție la hectar', 't/ha', 2),
  ...ends(`${CROP}.price_lei_per_kg`, 'crops', 'Preț', 'lei/kg', 2),
  num(`${CROP}.expense_months[month=*].share_pct`, 'crops', 'Partea din cheltuieli în luna asta', '%', 0, { max: 100 }),
  whole(`${CROP}.sale_month_default`, 'crops', 'Luna în care se vinde', 'luna', 1, 12),

  // ── Subsidies (subsidies-2026.json) ─────────────────────────────────────────
  num(`${SCHEME}.amount_eur`, 'subsidies', 'Suma pe hectar', '€/ha', 2, { nullable: true }),
  num(`${SCHEME}.advance_pct`, 'subsidies', 'Cât vine ca avans', '%', 0, { max: 100, nullable: true }),
  num(`${SCHEME}.max_ha`, 'subsidies', 'Cel mult atâtea hectare', 'ha', 2, { nullable: true }),
  { pattern: `${SCHEME}.enabled`, group: 'subsidies', label: 'Intră în calcul', type: 'boolean' },
  num(`${SCHEME}.eligibility.rules[field=*,op=*].value`, 'subsidies', 'Condiție', '', 2, { min: undefined }),
  num(`${SCHEME}.eligibility.rules[if.field=*,if.op=*].if.value`, 'subsidies', 'Condiție (pragul)', '', 2, { min: undefined }),
  num(`${SCHEME}.eligibility.parcel_min_ha.value`, 'subsidies', 'Parcela cea mai mică', 'ha', 2),
  num('subsidies.exchange_rates[campaign=*,fund=*].value', 'subsidies', 'Cursul euro', 'lei/€', 4, { nullable: true }),

  // ── Past subsidies, for the low / high range (subsidies-history.json) ───────
  num('history.schemes.*.actual[year=*].value', 'subsidy_history', 'Suma plătită', '€/ha', 2),
  num('history.schemes.*.planned_pns[year=*].value', 'subsidy_history', 'Suma plănuită', '€/ha', 2),
  { pattern: 'history.range_policy.fallback_scheme', group: 'subsidy_history', label: 'Schema după care se iau celelalte', type: 'key', keysAt: 'history.schemes' },

  // ── Kinds of year (plan-params.json forecast.years) ─────────────────────────
  ...yearKinds,
  whole('params.yield_history.window_years.value', 'years', 'Câte recolte din județ intră în calcul', 'ani', 1),
  whole('params.yield_history.extreme_years.value', 'years', 'Câți ani slabi (și buni) se iau în medie', 'ani', 1),
  whole('params.yield_history.min_years.value', 'years', 'Cu mai puține recolte, se ia media pe țară', 'ani', 1),
  whole('params.crop_loss.window_years.value', 'years', 'Câte recolte ale fermei intră în pierderi', 'ani', 1),
  whole('params.crop_loss.min_years.value', 'years', 'Pierderile contează de la atâtea recolte', 'ani', 1),

  // ── Horizons and days (plan-params.json forecast, long_forecast) ────────────
  whole('params.forecast.plan_months.value', 'horizons', 'Planul ține', 'luni', 1, 36),
  whole('params.forecast.after_bad_harvest_months.value', 'horizons', '„An slab” ține', 'luni', 1, 48),
  whole('params.forecast.projection_years.value', 'horizons', 'Proiecția pe trimestre ține', 'ani', 1, 10),
  whole('params.forecast.entry_day.value', 'horizons', 'Ziua din lună a cheltuielilor și vânzărilor', 'ziua', 1, 28),
  {
    pattern: 'params.forecast.apia_day.plan',
    group: 'horizons',
    label: 'Ziua din fereastra APIA pe care o ia planul',
    type: 'choice',
    options: ['early', 'mid', 'late'],
    optionLabels: WINDOW_DAY_LABELS,
  },
  {
    pattern: 'params.forecast.apia_day.demo_clock',
    group: 'horizons',
    label: 'Ziua din fereastra APIA pe care o ia ceasul demo',
    type: 'choice',
    options: ['early', 'mid', 'late'],
    optionLabels: WINDOW_DAY_LABELS,
  },
  whole('params.long_forecast.max_years.value', 'horizons', '„Următorii ani” merge până la', 'ani', 1, 30),
  whole('params.long_forecast.subsidy_rules_until_year.value', 'horizons', 'Regulile subvențiilor sunt știute până în', 'anul', 2020, 2100),

  // ── Salary and credit ───────────────────────────────────────────────────────
  whole('params.salary_round_lei.value', 'salary', 'Salariul se rotunjește în jos la', 'lei', 1),
  whole('params.credit_round_lei.value', 'credit', 'Creditul se rotunjește în sus la', 'lei', 1),
  num('params.credit.max_pct_of_subsidy.value', 'credit', 'Credit cel mult din subvenție', '%', 0, { max: 100 }),
  num('params.credit.robor_6m_pct.value', 'credit', 'ROBOR la 6 luni', '%', 2, { nullable: true }),
  num('params.credit.bank_margin_over_robor_pct.value', 'credit', 'Banca cere peste ROBOR', '%', 2, { nullable: true }),
  num('params.credit.ifn_margin_over_robor_pct.value', 'credit', 'IFN-ul cere peste ROBOR', '%', 2, { nullable: true }),

  // ── Pension. The screens read `pension.*`, the assistant the older top-level keys. ──
  whole('params.pension.target_age.value', 'pension', 'Vârsta până la care strânge (ecrane)', 'ani', 1, 100),
  num('params.pension.annual_return_pct.low', 'pension', 'Creștere pe an, cea mai mică (ecrane)', '%', 1, { max: 50 }),
  num('params.pension.annual_return_pct.probable', 'pension', 'Creștere pe an, probabilă (ecrane)', '%', 1, { max: 50 }),
  num('params.pension.annual_return_pct.high', 'pension', 'Creștere pe an, cea mai mare (ecrane)', '%', 1, { max: 50 }),
  whole('params.pension.payout_years.value', 'pension', 'Pe câți ani se împarte suma strânsă', 'ani', 1, 50),
  whole('params.pension.round_lei.value', 'pension', 'Contribuția sugerată se rotunjește la', 'lei', 1),
  num('params.pension_suggest_max_pct_of_salary.value', 'pension', 'Contribuția sugerată, cel mult din salariu', '%', 0, { max: 100 }),
  whole('params.pension_target_age.value', 'pension', 'Vârsta până la care strânge (asistent)', 'ani', 1, 100),
  num('params.pension_return_pct.low', 'pension', 'Creștere pe an, cea mai mică (asistent)', '%', 1, { max: 50 }),
  num('params.pension_return_pct.probable', 'pension', 'Creștere pe an, probabilă (asistent)', '%', 1, { max: 50 }),
  num('params.pension_return_pct.high', 'pension', 'Creștere pe an, cea mai mare (asistent)', '%', 1, { max: 50 }),

  // ── Calendar and the farmer's own sums ──────────────────────────────────────
  whole('params.farmer_events.carry_days.value', 'calendar', 'O sumă fără răspuns rămâne în plan', 'zile', 1, 365),
  whole('params.farmer_events.whole_harvest_window_months.value', 'calendar', 'Fereastra unei recolte întregi', 'luni', 1, 24),
  whole('params.calendar_reminder_days.value', 'calendar', 'Alarma sună cu atâtea zile înainte', 'zile', 1, 60),
  whole('params.calendar_reminder_hour.value', 'calendar', 'Alarma sună la ora', 'ora', 1, 23),

  // ── Weather (alerts only, no money figure) ──────────────────────────────────
  num('params.weather.frost_min_c.value', 'weather', 'Îngheț de la', '°C', 1, { min: -30, max: 10 }),
];
