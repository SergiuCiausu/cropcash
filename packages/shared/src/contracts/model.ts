/**
 * The farm's contracts other than arendă (docs/contracts-plan.md §2): the other side (`parties`), the contract
 * (`contracts`) and its money schedule (`contract_payments`). Migration 048 (step 4) checks the same rules.
 *
 * Inputs are in lei (two decimals at most) and hectares; rows are integer bani and ari. No CNP, no IBAN, ever
 * (as D4): a company's CUI is public, a person is a name.
 */
import { z } from 'zod';
import type { IsoDate } from '../cashflow/dates';
import { MAX_FARM_HA } from '../farm';
import { haToAri, leiToBani, type Ari, type Bani } from '../money';
import { CONTRACT_KINDS, type AnyContractKind, type ContractKind, type ContractTypes } from './types';

export const PARTY_KINDS = ['company', 'person'] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];
export const PAYMENT_DIRECTIONS = ['in', 'out'] as const;
export type PaymentDirection = (typeof PAYMENT_DIRECTIONS)[number];
export const PAYMENT_REPEATS = ['none', 'monthly', 'quarterly', 'yearly'] as const;
export type PaymentRepeat = (typeof PAYMENT_REPEATS)[number];
/** What the farmer decided about a contract's end (§3.2). */
export const CONTRACT_DECISIONS = ['renew', 'end', 'renegotiate', 'buy_out', 'return'] as const;
export type ContractDecision = (typeof CONTRACT_DECISIONS)[number];

/** Guards against typos, not market limits. */
const MAX_PAYMENT_LEI = 100_000_000;
const MAX_KG = 100_000_000;
export const MAX_PAYMENTS_PER_CONTRACT = 120;
export const MAX_REPEATS = 600;
export const MAX_NOTICE_DAYS = 730;

const Day = z.iso.date();
const Text = (max: number) => z.string().trim().min(1).max(max);
const twoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const Lei = z.number().positive().max(MAX_PAYMENT_LEI).refine(twoDecimals, 'max 2 decimals');
const Ha = z.number().positive().max(MAX_FARM_HA).refine(twoDecimals, 'max 2 decimals');
const Kg = z.number().int().positive().max(MAX_KG);
/** A Romanian CUI: 2–10 digits, optionally after RO. Spaces dropped, upper case. */
const Cui = z
  .string()
  .transform((s) => s.replace(/\s+/g, '').toUpperCase())
  .pipe(z.string().regex(/^(RO)?[0-9]{2,10}$/));

// ── The other side ────────────────────────────────────────────────────────────────

const PartyFields = {
  name: Text(80),
  kind: z.enum(PARTY_KINDS),
  cui: Cui.optional(),
  locality: Text(80).optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ]{6,20}$/).optional(),
  note: Text(200).optional(),
};

function checkParty(p: { kind: PartyKind; cui?: string }, ctx: z.core.$RefinementCtx) {
  if (p.kind === 'person' && p.cui) ctx.addIssue({ code: 'custom', message: 'a person has no CUI', path: ['cui'] });
}

export const PartyInputSchema = z.strictObject(PartyFields).superRefine(checkParty);
export type PartyInput = z.input<typeof PartyInputSchema>;
export const AddPartyInputSchema = z.strictObject({ ...PartyFields, clientId: z.uuid().optional() }).superRefine(checkParty);
export const UpdatePartyInputSchema = z.strictObject({ ...PartyFields, id: z.uuid() }).superRefine(checkParty);

// ── The money schedule ────────────────────────────────────────────────────────────

const PaymentFields = {
  direction: z.enum(PAYMENT_DIRECTIONS),
  /** „Avans”, „Rata”, „Prima”, „Livrarea 1”. */
  label: Text(40).optional(),
  firstOn: Day,
  repeat: z.enum(PAYMENT_REPEATS).default('none'),
  /** How many times in all. Left out with a repeat: until the contract ends. */
  times: z.number().int().min(1).max(MAX_REPEATS).optional(),
  /** Without VAT. */
  amountLei: Lei.optional(),
  /** The amount is per ha of the contract (services per ha, insurance per ha). */
  perHa: z.boolean().default(false),
  /** Paid or delivered in kind. */
  kg: Kg.optional(),
  cropId: Text(40).optional(),
};
type PaymentShape = z.output<z.ZodObject<typeof PaymentFields>>;

export const PaymentInputSchema = z.strictObject(PaymentFields).superRefine((p, ctx) => {
  const fail = (message: string, path: keyof PaymentShape) => ctx.addIssue({ code: 'custom', message, path: [path] });
  if (p.amountLei === undefined && p.kg === undefined) fail('lei or kg', 'amountLei');
  if ((p.kg === undefined) !== (p.cropId === undefined)) fail('kg go with a crop', 'cropId');
  if (p.times !== undefined && p.repeat === 'none') fail('times need a repeat', 'times');
  if (p.perHa && p.amountLei === undefined) fail('per ha needs lei', 'perHa');
});
export type PaymentInput = z.input<typeof PaymentInputSchema>;

// ── The contract ──────────────────────────────────────────────────────────────────

const ContractFields = {
  partyId: z.uuid(),
  kind: z.enum(CONTRACT_KINDS),
  /** „Grâu 2027 la Cargill”. */
  title: Text(80).optional(),
  number: Text(40).optional(),
  signedOn: Day.optional(),
  startsOn: Day,
  /** Left out: no end (Codul civil art. 1277: either side may end it with reasonable notice). */
  endsOn: Day.optional(),
  /** Left out: the kind's default (contract-types.json). */
  autoRenews: z.boolean().optional(),
  /** Days before the end to say no or announce the choice. Left out: the kind's default, maybe none. */
  noticeDays: z.number().int().min(0).max(MAX_NOTICE_DAYS).optional(),
  /** Length of a renewal in months. Left out: the same as the first term. */
  renewMonths: z.number().int().min(1).max(120).optional(),
  plotIds: z.array(z.uuid()).max(500).default([]),
  /** The hectares a per-ha payment counts (the parcels' area, or typed). */
  areaHa: Ha.optional(),
  /** The crop sold or bought, and how much. */
  cropId: Text(40).optional(),
  quantityKg: Kg.optional(),
  employeeId: z.uuid().optional(),
  creditGroupId: z.uuid().optional(),
  /** VAT on the amounts, basis points (2100 = 21%). Left out: none or not known. */
  vatBp: z.number().int().min(0).max(10_000).optional(),
  /** Leasing: the buy-out value (OG 51/1997 art. 2 lit. c). */
  residualLei: Lei.optional(),
  payments: z.array(PaymentInputSchema).max(MAX_PAYMENTS_PER_CONTRACT).default([]),
};
export type FarmContractShape = z.output<z.ZodObject<typeof ContractFields>>;

/** The rules between fields. Migration 048 checks the ones on a single row. */
function checkContract(c: FarmContractShape, ctx: z.core.$RefinementCtx) {
  const fail = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path });
  if (c.endsOn && c.endsOn < c.startsOn) fail('ends before it starts', ['endsOn']);
  if (c.signedOn && c.endsOn && c.signedOn > c.endsOn) fail('signed after it ends', ['signedOn']);
  if (c.autoRenews && !c.endsOn) fail('renews only with an end', ['autoRenews']);
  if (c.renewMonths !== undefined && !c.endsOn) fail('renews only with an end', ['renewMonths']);
  if (new Set(c.plotIds).size !== c.plotIds.length) fail('a parcel twice', ['plotIds']);
  if (c.quantityKg !== undefined && c.cropId === undefined) fail('kg go with a crop', ['cropId']);
  if (c.kind === 'sale' && c.cropId === undefined) fail('a sale names its crop', ['cropId']);
  if (c.residualLei !== undefined && c.kind !== 'leasing') fail('only a leasing has a residual value', ['residualLei']);
  if (c.employeeId !== undefined && c.kind !== 'employment') fail('only an employment contract names a person', ['employeeId']);
  if (c.creditGroupId !== undefined && c.kind !== 'credit') fail('only a credit links repayments', ['creditGroupId']);
  // Codul civil art. 2146: a comodat is free.
  if (c.kind === 'comodat' && c.payments.length) fail('a comodat is free', ['payments']);
  const earliest = c.signedOn && c.signedOn < c.startsOn ? c.signedOn : c.startsOn;
  c.payments.forEach((p, i) => {
    // An advance may be paid at signing, before the contract starts; nothing before that.
    if (p.firstOn < earliest) fail('paid before the contract was signed', ['payments', i, 'firstOn']);
    if (c.endsOn && !c.autoRenews && p.firstOn > c.endsOn) fail('paid after the contract ends', ['payments', i, 'firstOn']);
    if (p.perHa && c.areaHa === undefined) fail('per ha needs the hectares', ['payments', i, 'perHa']);
  });
}

export const FarmContractInputSchema = z.strictObject(ContractFields).superRefine(checkContract);
export type FarmContractInput = z.input<typeof FarmContractInputSchema>;
export const AddFarmContractInputSchema = z.strictObject({ ...ContractFields, clientId: z.uuid().optional() }).superRefine(checkContract);
/** Every field again, so leaving one out clears it (and the payments are replaced). */
export const UpdateFarmContractInputSchema = z.strictObject({ ...ContractFields, id: z.uuid() }).superRefine(checkContract);
/** Archived, never deleted. */
export const ArchiveFarmContractInputSchema = z.strictObject({ id: z.uuid() });

/** „Am hotărât” (§3.2), for a contract or an arendă. Null takes the decision back. */
export const DecideContractInputSchema = z.strictObject({
  id: z.uuid(),
  source: z.enum(['contract', 'arenda']),
  decision: z.enum(CONTRACT_DECISIONS).nullable(),
  decidedOn: Day,
});
export type DecideContractInput = z.input<typeof DecideContractInputSchema>;

/** The decisions that make sense for a kind: buying out or giving back only on a leasing. */
export function decisionsFor(kind: AnyContractKind): ContractDecision[] {
  if (kind === 'leasing') return ['buy_out', 'return', 'renew', 'renegotiate'];
  if (kind === 'sale' || kind === 'supply' || kind === 'credit') return [];
  return ['renew', 'end', 'renegotiate'];
}

// ── Rows ──────────────────────────────────────────────────────────────────────────

/** A `parties` row. */
export interface StoredParty {
  id: string;
  name: string;
  kind: PartyKind;
  cui: string | null;
  locality: string | null;
  phone: string | null;
  note: string | null;
  archived_at: string | null;
}

/** A `contracts` row. */
export interface StoredFarmContract {
  id: string;
  party_id: string;
  kind: ContractKind;
  title: string | null;
  number: string | null;
  signed_on: IsoDate | null;
  starts_on: IsoDate;
  ends_on: IsoDate | null;
  auto_renews: boolean;
  notice_days: number | null;
  renew_months: number | null;
  plot_ids: string[];
  area_ari: Ari | null;
  crop_id: string | null;
  quantity_kg: number | null;
  employee_id: string | null;
  credit_group_id: string | null;
  vat_bp: number | null;
  residual_bani: Bani | null;
  decision: ContractDecision | null;
  decided_on: IsoDate | null;
  archived_at: string | null;
}

/** A `contract_payments` row. */
export interface StoredContractPayment {
  id: string;
  contract_id: string;
  direction: PaymentDirection;
  label: string | null;
  first_on: IsoDate;
  repeat: PaymentRepeat;
  times: number | null;
  amount_bani: Bani | null;
  per_ha: boolean;
  kg: number | null;
  crop_id: string | null;
}

export function partyRow(p: z.output<typeof PartyInputSchema>): Omit<StoredParty, 'id' | 'archived_at'> {
  return { name: p.name, kind: p.kind, cui: p.cui ?? null, locality: p.locality ?? null, phone: p.phone ?? null, note: p.note ?? null };
}

/** The contract's row; what the farmer left out comes from the kind's defaults. The decision is kept apart. */
export function farmContractRow(c: FarmContractShape, types: ContractTypes): Omit<StoredFarmContract, 'id' | 'archived_at' | 'decision' | 'decided_on'> {
  const rule = types.types[c.kind];
  return {
    party_id: c.partyId,
    kind: c.kind,
    title: c.title ?? null,
    number: c.number ?? null,
    signed_on: c.signedOn ?? null,
    starts_on: c.startsOn,
    ends_on: c.endsOn ?? null,
    // A contract without an end can't renew.
    auto_renews: c.endsOn ? (c.autoRenews ?? rule.auto_renews?.value ?? false) : false,
    notice_days: c.noticeDays ?? rule.notice_days?.value ?? null,
    renew_months: c.renewMonths ?? null,
    plot_ids: c.plotIds,
    area_ari: c.areaHa === undefined ? null : haToAri(c.areaHa),
    crop_id: c.cropId ?? null,
    quantity_kg: c.quantityKg ?? null,
    employee_id: c.employeeId ?? null,
    credit_group_id: c.creditGroupId ?? null,
    vat_bp: c.vatBp ?? null,
    residual_bani: c.residualLei === undefined ? null : leiToBani(c.residualLei),
  };
}

export function contractPaymentRow(p: PaymentShape): Omit<StoredContractPayment, 'id' | 'contract_id'> {
  return {
    direction: p.direction,
    label: p.label ?? null,
    first_on: p.firstOn,
    repeat: p.repeat,
    times: p.times ?? null,
    amount_bani: p.amountLei === undefined ? null : leiToBani(p.amountLei),
    per_ha: p.perHa,
    kg: p.kg ?? null,
    crop_id: p.cropId ?? null,
  };
}
