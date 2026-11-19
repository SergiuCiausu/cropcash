/* What each kind of contract does at its end (docs/contracts-plan.md §3.1, docs/16-contracts-law.md,
   docs/data/contract-types.json). The file holds the defaults and the reminder days; a contract can change
   the defaults to what its own paper says. */
import { z } from 'zod';

/** Kinds kept in the `contracts` table. Arendă stays in `lease_contracts` (C2). */
export const CONTRACT_KINDS = ['comodat', 'sale', 'supply', 'service', 'leasing', 'insurance', 'credit', 'employment', 'other'] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];
/** Every kind the Contracte screen shows, arendă included. */
export type AnyContractKind = 'arenda' | ContractKind;
export const ALL_CONTRACT_KINDS: readonly AnyContractKind[] = ['arenda', ...CONTRACT_KINDS];

/** The buttons a contract can show around its end or its due days, in the order shown. */
export const END_ACTIONS = [
  'let_renew',
  'refuse',
  'renegotiate',
  'deliver',
  'delivered',
  'postpone',
  'pay',
  'pay_in_kind',
  'let_continue',
  'announce_end',
  'buy_out',
  'extend',
  'return',
  'renew',
  'look_for_offer',
  'stop',
  'new_contract',
  'hand_back',
] as const;
export type EndAction = (typeof END_ACTIONS)[number];

/** Which day is the last one to act on. */
export const ACT_BY_RULES = ['refuse_renewal', 'end', 'end_minus_notice', 'each_delivery', 'each_payment', 'last_repayment'] as const;
export type ActByRule = (typeof ACT_BY_RULES)[number];

/** What happens when nobody decides. */
export const WITHOUT_DECISION = ['renews', 'late_delivery_warning', 'keeps_payment', 'renews_if_auto', 'as_contract_says', 'uninsured', 'ends'] as const;
export type WithoutDecision = (typeof WITHOUT_DECISION)[number];

const Note = { source: z.string().optional(), status: z.string().optional(), note: z.string().optional() };
const BoolFigure = z.object({ value: z.boolean(), ...Note });
const DaysFigure = z.object({ value: z.number().int().min(0).max(730).nullable(), ...Note });
const MonthsFigure = z.object({ value: z.number().int().positive().max(120), ...Note });

const TypeRuleSchema = z
  .object({
    name_ro: z.string().min(1),
    first_version: z.boolean(),
    auto_renews: BoolFigure.optional(),
    notice_days: DaysFigure.optional(),
    early_buy_out_min_months: MonthsFigure.optional(),
    act_by: z.enum(ACT_BY_RULES).optional(),
    remind_days_before: z.number().int().positive().max(365).optional(),
    remind_months_before_act_by: z.number().int().positive().max(24).optional(),
    actions: z.array(z.enum(END_ACTIONS)).optional(),
    without_decision: z.enum(WITHOUT_DECISION).optional(),
    ...Note,
  })
  .superRefine((t, ctx) => {
    // A kind the app offers must say how it ends; the later ones may still be blank.
    if (!t.first_version) return;
    const missing = (['auto_renews', 'act_by', 'actions', 'without_decision'] as const).filter((k) => t[k] === undefined);
    if (t.remind_days_before === undefined && t.remind_months_before_act_by === undefined) missing.push('remind_days_before' as never);
    for (const k of missing) ctx.addIssue({ code: 'custom', message: `${t.name_ro}: ${k} is required for a first-version kind`, path: [k] });
  });
export type ContractTypeRule = z.infer<typeof TypeRuleSchema>;

/** docs/data/contract-types.json. */
export const ContractTypesSchema = z.object({
  types: z.object(Object.fromEntries(ALL_CONTRACT_KINDS.map((k) => [k, TypeRuleSchema])) as Record<AnyContractKind, typeof TypeRuleSchema>),
});
export type ContractTypes = z.infer<typeof ContractTypesSchema>;

/** The kinds the farmer can add today (C1), in the file's order. */
export const offeredKinds = (types: ContractTypes): AnyContractKind[] => ALL_CONTRACT_KINDS.filter((k) => types.types[k].first_version);
