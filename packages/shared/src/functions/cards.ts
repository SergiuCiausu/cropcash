import { z } from 'zod';

/**
 * Cards the "Întreabă" assistant can show under its answer (docs/web-react-port-plan.md, Assistant).
 * The model only picks a card and the read function's input; the API runs that read function and
 * the card shows its result. So every figure on a card comes from the registry, never from the model.
 * Each schema is the part of the function's output the card needs; extra fields are dropped.
 * Money is whole bani, months are YYYY-MM, dates YYYY-MM-DD, areas ari.
 */

const Bani = z.number().int();
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Range = z.object({ min: Bani, probable: Bani, max: Bani });
const Lowest = z.object({ key: Month, balance: Bani });

export const PurchaseCardSchema = z.object({
  amount: Bani,
  month: Month,
  salaryBefore: Bani,
  salaryAfter: Bani,
  limitingMonth: Month,
  lowestBefore: Lowest,
  lowestAfter: Lowest,
  goesShort: z.boolean(),
});

export const SalaryCardSchema = z.object({
  salary: Bani,
  reason: z.enum(['money_runs_out', 'end_of_plan', 'tight_month']),
  limitingMonth: Month,
  monthsUntilLimit: z.number().int().positive(),
  availableByThen: Bani,
  setAside: z.object({ pensionMonthly: Bani }),
});

export const MonthsCardSchema = z.object({
  scenario: z.enum(['bad', 'medium', 'good']),
  startBalance: Bani,
  months: z.array(z.object({ key: Month, in: Bani, out: Bani, balanceEnd: Bani })).min(1),
  endBalance: Bani,
  lowest: Lowest,
});

export const TightMonthsCardSchema = z.object({
  months: z.array(Month),
  lowest: Lowest,
  missing: Bani,
  spring: z.object({ need: Bani, available: Bani, firstMonth: Month.nullable(), lastMonth: Month.nullable() }),
});

export const SubsidyCardSchema = z.object({
  totals: z.object({ lei: Range, advanceLei: Bani, balanceLei: Range }),
  schemes: z.array(z.object({ code: z.string(), nameRo: z.string(), units: z.number().int(), leiIndicative: Range })),
  /** Set when the farmer saved the APIA payment decision: the figures are then the real ones. */
  decision: z.object({ campaignYear: z.number().int(), totalBani: Bani }).optional(),
});

export const CreditCardSchema = z.object({
  amount: Bani,
  salaryBefore: Bani,
  salaryAfter: Bani,
  limitingMonth: Month,
  capacity: Bani,
  withinLimit: z.boolean(),
  availableFrom: Month.nullable(),
  inTime: z.boolean(),
});

export const UpcomingCardSchema = z
  .array(
    z.object({
      id: z.string(),
      kind: z.string(),
      direction: z.enum(['in', 'out', 'none']),
      amount: Range.nullable(),
      value: Bani,
      date: Day,
      window: z.object({ start: Day, end: Day }).nullable(),
      cropId: z.string().optional(),
      schemeCode: z.string().optional(),
      eventId: z.string().optional(),
      what: z.string().optional(),
      estimated: z.boolean(),
      unverified: z.boolean(),
    }),
  )
  .min(1);

export const PensionCardSchema = z.object({
  age: z.number().int(),
  targetAge: z.number().int(),
  months: z.number().int().positive(),
  paidIn: Bani,
  results: z.array(z.object({ returnPct: z.number(), total: Bani, monthlyEquivalent: Bani })).min(1),
  illustrative: z.literal(true),
  minimum: Bani,
  minimumVerified: z.boolean(),
  belowMinimum: z.boolean(),
});

export const PensionChangeCardSchema = z.object({
  monthly: Bani,
  pensionBefore: Bani,
  salaryBefore: Bani,
  paidBefore: Bani,
  salaryAfter: Bani,
  limitingMonth: Month,
  minimum: Bani,
  minimumVerified: z.boolean(),
  underMinimum: z.boolean(),
});

/** Card type → the read function that fills it, its data and when the model should pick it. */
export const ASSISTANT_CARDS = {
  purchase: {
    fn: 'check_purchase',
    data: PurchaseCardSchema,
    description: 'For "Pot să-mi iau…?": the salary and the lowest month before and after one purchase.',
  },
  salary: {
    fn: 'explain_salary',
    data: SalaryCardSchema,
    description: 'The safe monthly salary and the month that limits it.',
  },
  months: {
    fn: 'get_forecast',
    data: MonthsCardSchema,
    description: 'A chart of the next 12 months: money in, money out and what is left. For questions about the whole year.',
  },
  tight_months: {
    fn: 'get_tight_months',
    data: TightMonthsCardSchema,
    description: 'The hardest months, how much is missing and the spring need. For "când îmi lipsesc bani?".',
  },
  subsidy: {
    fn: 'estimate_subsidy',
    data: SubsidyCardSchema,
    description: 'The APIA subsidy as a range, with advance, balance and each scheme.',
  },
  credit: {
    fn: 'what_if_credit',
    data: CreditCardSchema,
    description: 'The salary before and after a credit, and whether it fits the APIA certificate limit and date.',
  },
  upcoming: {
    fn: 'list_upcoming',
    data: UpcomingCardSchema,
    description: 'What comes next: payments, deadlines and farm work, in date order.',
  },
  pension: {
    fn: 'simulate_pension',
    data: PensionCardSchema,
    description: 'How a monthly pension amount could grow until 65. A simulation, never advice.',
  },
  pension_change: {
    fn: 'what_if_pension',
    data: PensionChangeCardSchema,
    description: 'The salary before and after starting, changing or stopping the pension.',
  },
} as const satisfies Record<string, { fn: string; data: z.ZodType; description: string }>;

export type CardType = keyof typeof ASSISTANT_CARDS;
export type CardData<T extends CardType> = z.output<(typeof ASSISTANT_CARDS)[T]['data']>;

/** A card as the API sends it and the browser stores it. */
export type AssistantCard = { [T in CardType]: { type: T; data: CardData<T> } }[CardType];

export const CARD_TYPES = Object.keys(ASSISTANT_CARDS) as CardType[];

export const isCardType = (type: unknown): type is CardType => typeof type === 'string' && Object.hasOwn(ASSISTANT_CARDS, type);

/**
 * Checks a card before it is sent or drawn. The browser runs it again on stored cards,
 * because a saved conversation can be older than the app. Null means: show the fallback.
 */
export function parseCard(type: unknown, data: unknown): AssistantCard | null {
  if (!isCardType(type)) return null;
  const parsed = ASSISTANT_CARDS[type].data.safeParse(data);
  return parsed.success ? ({ type, data: parsed.data } as AssistantCard) : null;
}
