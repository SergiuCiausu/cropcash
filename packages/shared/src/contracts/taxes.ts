/* The taxes to the state a contract brings (docs/contracts-plan.md §4, docs/16-contracts-law.md §6,
   docs/data/contract-taxes-2026.json). Pure.

   Every rate, base and due day comes from the data files. A rate we haven't read is null, and then so is the
   amount: never 0. The app shows the calculation; the accountant confirms it.

   - Arendă: the tax the farm withholds on each rent payment (arenda/schedule.ts already computes it). On land given
     in arendă the lessee withholds it (shown, not counted). The landowner's CASS isn't computed (docs/15 §4).
   - A sale: VAT by the farm's VAT status (reverse charge on grain between VAT payers until 31.12.2026; nothing in
     the farmers' flat-rate scheme or when not registered); the micro tax of an SRL, per quarter. A PF/PFA/II on
     the income norm owes nothing per sale: its tax is per hectare, once a year.
   - Supply, service, leasing, other: the VAT on the invoices, deductible for a VAT payer, a cost otherwise.
   - Insurance, credit, comodat: nothing (VAT-exempt, art. 292 (2); comodat is free).
   - Land tax: only when the farmer typed the yearly amount from the decizia de impunere (rates are per locality). */
import { z } from 'zod';
import { addMonths, dayInMonth, monthKey, type IsoDate, type MonthKey } from '../cashflow/dates';
import type { CatalogueCrop } from '../data/catalogue';
import type { ArendaPrices } from '../arenda/prices';
import { rentTax } from '../arenda/prices';
import type { PlannedRent } from '../arenda/schedule';
import type { Bani } from '../money';
import type { ContractFlow } from './schedule';
import type { AnyContractKind } from './types';

// ── The data file ─────────────────────────────────────────────────────────────────

const Meta = { source: z.string().optional(), status: z.string().optional(), note: z.string().optional() };
const Bp = z.object({ value: z.number().int().min(0).max(10_000), ...Meta });
const Due = z.object({ day: z.number().int().min(1).max(28), month_offset: z.number().int().min(0).max(12) });

/** docs/data/contract-taxes-2026.json: only the parts the code reads. */
export const ContractTaxesSchema = z.object({
  vat: z.object({
    standard_bp: Bp,
    reduced_bp: Bp,
    reverse_charge_grain: z.object({
      applies_until: z.iso.date(),
      both_vat_registered: z.literal(true),
      source: z.string(),
      status: z.string(),
      goods_in_app: z.object({ apia_headings: z.array(z.string()), apia_codes: z.array(z.number().int()), ...Meta }),
    }),
    farmer_flat_rate: z.object({ compensation_bp: Bp, source: z.string(), status: z.string() }),
    exempt: z.object({ credit: z.object({ value: z.boolean(), ...Meta }), insurance: z.object({ value: z.boolean(), ...Meta }) }),
    leasing_rate: z.object({ value: z.enum(['standard', 'reduced']), ...Meta }),
    return: z.object({ form: z.string(), due_day: Due.shape.day, month_offset: Due.shape.month_offset, period: z.object({ value: z.enum(['month', 'quarter']), ...Meta }), source: z.string(), status: z.string() }),
  }),
  micro_tax: z.object({
    rate_bp: Bp,
    due: Due.extend({ period: z.literal('quarter'), source: z.string(), status: z.string() }),
    form: z.object({ value: z.string().nullable(), ...Meta }),
  }),
  land_tax: z.object({
    instalments: z.array(z.object({ due: z.string().regex(/^\d{2}-\d{2}$/), share_pct: z.number().int().min(1).max(100) })).min(1),
    small_amount_bani: z.object({ value: z.number().int().nonnegative(), ...Meta }),
    source: z.string(),
    status: z.string(),
  }),
});
export type ContractTaxes = z.infer<typeof ContractTaxesSchema>;

// ── The farm ──────────────────────────────────────────────────────────────────────

/** As `farm_fiscal_profiles` (041). */
export const LEGAL_FORMS = ['pf', 'pfa', 'ii', 'if', 'srl'] as const;
export type LegalForm = (typeof LEGAL_FORMS)[number];
export const VAT_STATUSES = ['payer', 'not_registered', 'special_agri'] as const;
export type VatStatus = (typeof VAT_STATUSES)[number];

/** What the farm told us about itself. Null: not told yet, so the lines that depend on it have no amount. */
export interface TaxProfile {
  legalForm: LegalForm | null;
  vatStatus: VatStatus | null;
  /** An SRL paying the micro tax (art. 47); null when not asked or not an SRL. */
  micro: boolean | null;
}
export const UNKNOWN_TAX_PROFILE: TaxProfile = { legalForm: null, vatStatus: null, micro: null };

/** The farm's three answers, as the `farmers` row keeps them (migration 049). */
export interface TaxProfileRow {
  legal_form?: LegalForm | null;
  vat_status?: VatStatus | null;
  micro_tax?: boolean | null;
}

export const taxProfileOf = (row: TaxProfileRow): TaxProfile => ({
  legalForm: row.legal_form ?? null,
  vatStatus: row.vat_status ?? null,
  micro: row.legal_form === 'srl' ? (row.micro_tax ?? null) : null,
});

/** „Ce fel de fermă ești?” on the Taxe tab. Null clears an answer. The micro tax is asked only of an SRL. */
export const SetTaxProfileInputSchema = z
  .strictObject({
    legalForm: z.enum(LEGAL_FORMS).nullable(),
    vatStatus: z.enum(VAT_STATUSES).nullable(),
    micro: z.boolean().nullable().default(null),
  })
  .refine((p) => p.micro === null || p.legalForm === 'srl', { message: 'only an SRL pays the micro tax', path: ['micro'] });
export type SetTaxProfileInput = z.input<typeof SetTaxProfileInputSchema>;

// ── A tax line ────────────────────────────────────────────────────────────────────

export type TaxKind = 'rent_income_tax' | 'land_tax' | 'vat' | 'micro_tax';
/**
 * owed: the farm pays it from its own money. withheld: the farm keeps it from what it pays someone and hands it
 * to the state. deductible: VAT the farm gets back through its D300. cost: VAT on an invoice it can't get back
 * (the supplier pays it to the state). other_side: the other side withholds or pays it; shown, not counted.
 */
export type TaxEffect = 'owed' | 'withheld' | 'deductible' | 'cost' | 'other_side';

export interface TaxLine {
  contractId: string;
  tax: TaxKind;
  effect: TaxEffect;
  to: 'ANAF' | 'primarie';
  /** "300", "decizia de impunere"; null when we haven't read which form. */
  form: string | null;
  /** The amount the rate applies to; null when unknown. */
  baseBani: Bani | null;
  rateBp: number | null;
  /** Null when the base, the rate or a fact about the farm isn't known. Never a guessed 0. */
  amountBani: Bani | null;
  dueOn: IsoDate | null;
  /** VAT only: the day the invoice money moves with it (the bucket's first flow). The plan puts the VAT there. */
  invoicedOn?: IsoDate;
  /** confirmed: the rule is read and the amount rests on it. DE-VERIFICAT: some part is unread or assumed. */
  status: 'confirmed' | 'DE-VERIFICAT';
  source: string;
  /** Why there's no amount, or what to check. Romanian, for the card. */
  note?: string;
}

export type TaxData = { contractTaxes: ContractTaxes; arenda: ArendaPrices; catalogue: readonly CatalogueCrop[] };

const confirmed = (...statuses: (string | undefined)[]) => statuses.every((s) => s === 'confirmat');
const ofRate = (base: Bani | null, bp: number | null): Bani | null => (base === null || bp === null ? null : Math.round((base * bp) / 10_000));
const dueAfter = (key: MonthKey, due: { day: number; month_offset: number }): IsoDate => dayInMonth(addMonths(key, due.month_offset), due.day);
const quarterEnd = (date: IsoDate): MonthKey => `${date.slice(0, 4)}-${String(Math.ceil(Number(date.slice(5, 7)) / 3) * 3).padStart(2, '0')}`;

/** Flows summed per bucket (a month, a quarter); a flow with kg and no lei makes its bucket's base unknown. */
function buckets(flows: readonly ContractFlow[], keyOf: (d: IsoDate) => MonthKey): Map<MonthKey, { base: Bani | null; first: IsoDate }> {
  const out = new Map<MonthKey, { base: Bani | null; first: IsoDate }>();
  for (const f of [...flows].sort((a, b) => a.date.localeCompare(b.date))) {
    const k = keyOf(f.date);
    const prev = out.get(k);
    const base = prev === undefined ? f.amountBani : prev.base === null || f.amountBani === null ? null : prev.base + f.amountBani;
    out.set(k, { base, first: prev?.first ?? f.date });
  }
  return out;
}

// ── VAT ───────────────────────────────────────────────────────────────────────────

/** A crop sold under reverse charge (cereals, oilseeds, sugar beet), from the app's provisional list (#47). */
export function reverseChargeGoods(cropId: string | null, d: Pick<TaxData, 'contractTaxes' | 'catalogue'>): boolean {
  if (!cropId) return false;
  const goods = d.contractTaxes.vat.reverse_charge_grain.goods_in_app;
  return d.catalogue.some((c) => c.id === cropId && ((c.heading !== null && goods.apia_headings.includes(c.heading)) || goods.apia_codes.includes(c.code)));
}

/** The rate a kind's invoices carry when the contract doesn't say one; null when it can't be told. */
export function defaultVatBp(kind: AnyContractKind, t: ContractTaxes): { bp: number | null; status: string | undefined } {
  if (kind === 'service') return { bp: t.vat.standard_bp.value, status: 'DE-VERIFICAT' }; // 11% only for the MF–MADR order's services (#46)
  if (kind === 'leasing') {
    const r = t.vat.leasing_rate.value === 'standard' ? t.vat.standard_bp : t.vat.reduced_bp;
    return { bp: r.value, status: t.vat.leasing_rate.status };
  }
  return { bp: null, status: undefined }; // supply: seeds and fertilizer 11%, the rest 21%; the contract says
}

const VAT_SOURCE = 'Codul fiscal art. 291, 323, 326';

function vatReturnDue(t: ContractTaxes, date: IsoDate): IsoDate {
  const r = t.vat.return;
  return dueAfter(r.period.value === 'quarter' ? quarterEnd(date) : monthKey(date), { day: r.due_day, month_offset: r.month_offset });
}

/** VAT on money the farm receives (a sale, or services it does for others). */
function vatOnIncome(id: string, kind: AnyContractKind, flows: readonly ContractFlow[], cropId: string | null, vatBp: number | null, otherSideVatPayer: boolean | null, p: TaxProfile, d: TaxData, out: TaxLine[]) {
  const t = d.contractTaxes;
  const vs = p.vatStatus;
  // A flat-rate farmer or one not registered collects no VAT (art. 315^1 (7), art. 310).
  if (vs === 'not_registered' || (vs === 'special_agri' && p.legalForm !== 'srl')) return;
  const rc = t.vat.reverse_charge_grain;
  const periodOk = confirmed(t.vat.return.period.status);
  for (const [key, { base, first }] of buckets(flows, monthKey)) {
    const date = dayInMonth(key, 1);
    const line: TaxLine = { contractId: id, tax: 'vat', effect: 'owed', to: 'ANAF', form: t.vat.return.form, baseBani: base, rateBp: null, amountBani: null, dueOn: vatReturnDue(t, date), invoicedOn: first, status: 'DE-VERIFICAT', source: VAT_SOURCE };
    if (vs === null || vs === 'special_agri') {
      out.push({ ...line, note: 'Spune în „Datele firmei” dacă ești plătitor de TVA.' });
      continue;
    }
    if (kind === 'sale' && reverseChargeGoods(cropId, d) && dayInMonth(key, 1) <= rc.applies_until) {
      if (otherSideVatPayer === null) {
        out.push({ ...line, source: rc.source, note: 'Cumpărătorul e plătitor de TVA? Dacă da, e taxare inversă și nu plătești TVA.' });
        continue;
      }
      if (otherSideVatPayer) {
        // Nothing moves: the buyer enters it as both collected and deductible (art. 331 (5)).
        out.push({ ...line, rateBp: null, amountBani: 0, status: confirmed(rc.status, rc.goods_in_app.status) ? 'confirmed' : 'DE-VERIFICAT', source: rc.source, note: 'Taxare inversă: TVA-ul îl trece cumpărătorul.' });
        continue;
      }
    }
    const amountBani = ofRate(base, vatBp);
    out.push({ ...line, rateBp: vatBp, amountBani, status: amountBani !== null && periodOk ? 'confirmed' : 'DE-VERIFICAT', note: vatBp === null ? 'Ce cotă de TVA scrie în contract?' : undefined });
  }
}

/** VAT on the invoices the farm pays. */
function vatOnCosts(id: string, flows: readonly ContractFlow[], vatBp: number | null, rateStatus: string | undefined, p: TaxProfile, d: TaxData, out: TaxLine[]) {
  const t = d.contractTaxes;
  const payer = p.vatStatus === 'payer';
  for (const [key, { base, first }] of buckets(flows, monthKey)) {
    const invoicedOn = first;
    const amountBani = ofRate(base, vatBp);
    const known = amountBani !== null && (rateStatus === undefined || confirmed(rateStatus));
    if (p.vatStatus === null) {
      out.push({ contractId: id, tax: 'vat', effect: 'cost', to: 'ANAF', form: null, baseBani: base, rateBp: vatBp, amountBani, dueOn: null, invoicedOn, status: 'DE-VERIFICAT', source: VAT_SOURCE, note: 'Spune în „Datele firmei” dacă ești plătitor de TVA: dacă da, TVA-ul ăsta îl recuperezi.' });
    } else if (payer) {
      out.push({ contractId: id, tax: 'vat', effect: 'deductible', to: 'ANAF', form: t.vat.return.form, baseBani: base, rateBp: vatBp, amountBani, dueOn: vatReturnDue(t, dayInMonth(key, 1)), invoicedOn, status: known && confirmed(t.vat.return.period.status) ? 'confirmed' : 'DE-VERIFICAT', source: VAT_SOURCE, note: vatBp === null ? 'Ce cotă de TVA scrie pe factură?' : 'Îl scazi din TVA-ul de plată, în decontul 300.' });
    } else {
      // Paid with the invoice; the supplier hands it to the state.
      out.push({ contractId: id, tax: 'vat', effect: 'cost', to: 'ANAF', form: null, baseBani: base, rateBp: vatBp, amountBani, dueOn: null, invoicedOn, status: known ? 'confirmed' : 'DE-VERIFICAT', source: 'Codul fiscal art. 291, 315^1 (7)', note: vatBp === null ? 'Ce cotă de TVA scrie pe factură?' : 'TVA-ul de pe factură e un cost: nu îl recuperezi.' });
    }
  }
}

// ── Income tax ────────────────────────────────────────────────────────────────────

/** An SRL's micro tax on what the contract brings in, per quarter (art. 51, 56). A PF/PFA/II/IF owes none per contract. */
function microTax(id: string, flows: readonly ContractFlow[], p: TaxProfile, t: ContractTaxes, out: TaxLine[]) {
  if (p.legalForm !== null && p.legalForm !== 'srl') return;
  const m = t.micro_tax;
  for (const [key, { base }] of buckets(flows, quarterEnd)) {
    const dueOn = dueAfter(key, m.due);
    const line: TaxLine = { contractId: id, tax: 'micro_tax', effect: 'owed', to: 'ANAF', form: m.form.value, baseBani: base, rateBp: null, amountBani: null, dueOn, status: 'DE-VERIFICAT', source: m.rate_bp.source ?? 'Codul fiscal art. 51, 56' };
    if (p.legalForm === null) out.push({ ...line, note: 'Spune în „Datele firmei” ce formă are ferma (PF, PFA, II, SRL).' });
    else if (p.micro === null) out.push({ ...line, note: 'Firma plătește impozit pe venitul microîntreprinderii?' });
    else if (!p.micro) out.push({ ...line, note: 'Impozitul pe profit nu îl socotim: întreabă contabilul.' });
    else {
      const amountBani = ofRate(base, m.rate_bp.value);
      out.push({ ...line, rateBp: m.rate_bp.value, amountBani, status: amountBani !== null && confirmed(m.rate_bp.status, m.due.status) ? 'confirmed' : 'DE-VERIFICAT', note: m.form.value === null ? 'Formularul îl confirmă contabilul.' : undefined });
    }
  }
}

// ── Per contract ──────────────────────────────────────────────────────────────────

export interface ContractTaxInput {
  id: string;
  kind: AnyContractKind;
  /** The contract's flows (schedule.ts), already cut to the window and to the days it runs. */
  flows: readonly ContractFlow[];
  /** VAT on the amounts, from the contract; null: the kind's default, or unknown. */
  vatBp: number | null;
  cropId: string | null;
  /** The other side is registered for VAT (a CUI with RO); null when we can't tell. */
  otherSideVatPayer: boolean | null;
}

/** The tax lines of a contract from the `contracts` table, by due day. */
export function contractTaxes(c: ContractTaxInput, p: TaxProfile, d: TaxData): TaxLine[] {
  const out: TaxLine[] = [];
  const t = d.contractTaxes;
  if (c.kind === 'insurance' && t.vat.exempt.insurance.value) return out;
  if (c.kind === 'credit' && t.vat.exempt.credit.value) return out;
  if (c.kind === 'comodat' || c.kind === 'employment' || c.kind === 'arenda') return out; // employment: C3
  const def = c.vatBp === null ? defaultVatBp(c.kind, t) : { bp: c.vatBp, status: undefined };
  const income = c.flows.filter((f) => f.direction === 'in');
  const costs = c.flows.filter((f) => f.direction === 'out');
  if (income.length && (c.kind === 'sale' || def.bp !== null)) vatOnIncome(c.id, c.kind, income, c.cropId, def.bp, c.otherSideVatPayer, p, d, out);
  if (income.length && c.kind === 'sale') microTax(c.id, income, p, t, out);
  if (costs.length && c.kind !== 'sale' && (c.kind !== 'other' || def.bp !== null)) vatOnCosts(c.id, costs, def.bp, def.status, p, d, out);
  return out.sort(byDue);
}

const byDue = (a: TaxLine, b: TaxLine) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || a.tax.localeCompare(b.tax);

/**
 * An arendă's lines: the tax withheld on each rent payment (art. 84). Taken: the farm withholds and pays it.
 * Given: the lessee withholds it from the farm, unless the farm is an SRL (then rent is company income, #SRL).
 * `landTaxBani`: the yearly land tax the farm pays on these hectares, typed from the decizia de impunere.
 */
export function leaseTaxes(contractId: string, rents: readonly PlannedRent[], p: TaxProfile, d: Pick<TaxData, 'arenda' | 'contractTaxes'>, landTax?: { yearlyBani: Bani; years: readonly number[] }): TaxLine[] {
  const tax = d.arenda.tax;
  const rate = tax.withholding_rate_pct.value * 100;
  const ruleOk = confirmed(tax.expense_quota_pct.status, tax.withholding_rate_pct.status, tax.due.status);
  const out: TaxLine[] = [];
  for (const r of rents) {
    if (r.contractId !== contractId) continue;
    const given = r.direction === 'given';
    if (given && p.legalForm === 'srl') continue;
    const net = r.grossValueBani === null ? null : rentTax(r.grossValueBani, r.date, tax).netBani;
    out.push({
      contractId,
      tax: 'rent_income_tax',
      effect: given ? 'other_side' : 'withheld',
      to: 'ANAF',
      form: null, // docs/11 #21
      baseBani: net,
      rateBp: rate,
      amountBani: r.taxBani,
      dueOn: rentTax(0, r.date, tax).dueOn,
      status: r.taxBani !== null && ruleOk && !(given && p.legalForm === null) ? 'confirmed' : 'DE-VERIFICAT',
      source: tax.withholding_rate_pct.source ?? 'Codul fiscal art. 84',
      note:
        r.taxBani === null
          ? 'Nu știm prețul județului pentru produs, deci nici impozitul.'
          : given
            ? 'Îl reține arendașul din arenda ta și îl plătește el.'
            : 'Îl reții din arenda proprietarului și îl plătești tu la ANAF.',
    });
  }
  if (landTax) out.push(...landTaxLines(contractId, landTax.yearlyBani, landTax.years, d.contractTaxes));
  return out.sort(byDue);
}

/** The land tax in its instalments (art. 467): 31 March and 30 September; a small sum all at the first. */
export function landTaxLines(contractId: string, yearlyBani: Bani, years: readonly number[], t: ContractTaxes): TaxLine[] {
  const lt = t.land_tax;
  const parts = yearlyBani <= lt.small_amount_bani.value ? [{ due: lt.instalments[0]!.due, share_pct: 100 }] : lt.instalments;
  return years.flatMap((y) => {
    let left = yearlyBani;
    return parts.map((part, i) => {
      const amountBani = i === parts.length - 1 ? left : Math.round((yearlyBani * part.share_pct) / 100);
      left -= amountBani;
      return { contractId, tax: 'land_tax', effect: 'owed', to: 'primarie', form: 'decizia de impunere', baseBani: null, rateBp: null, amountBani, dueOn: `${y}-${part.due}`, status: confirmed(lt.status) ? 'confirmed' : 'DE-VERIFICAT', source: lt.source } satisfies TaxLine;
    });
  });
}

/** The flat-rate compensation a farmer in the special scheme gets from a buyer that's a business (art. 315^1 (2)). Money in, not a tax. */
export function flatRateCompensation(priceBani: Bani, t: ContractTaxes): Bani {
  return Math.round((priceBani * t.vat.farmer_flat_rate.compensation_bp.value) / 10_000);
}

// ── Totals ────────────────────────────────────────────────────────────────────────

export interface TaxTotals {
  /** What leaves the farm for the state: owed + withheld − deductible. Lines without an amount aren't in it. */
  toStateBani: Bani;
  /** Of which, kept from what the farm pays others. */
  withheldBani: Bani;
  /** VAT the farm gets back. */
  deductibleBani: Bani;
  /** VAT paid with invoices, not recoverable: a cost, not a payment to the state. */
  costBani: Bani;
  /** Lines the farm pays (or gets back) whose amount we don't know yet. */
  unknown: number;
}

export function taxTotals(lines: readonly TaxLine[]): TaxTotals {
  const t: TaxTotals = { toStateBani: 0, withheldBani: 0, deductibleBani: 0, costBani: 0, unknown: 0 };
  for (const l of lines) {
    if (l.effect === 'other_side') continue;
    if (l.amountBani === null) {
      if (l.effect !== 'cost') t.unknown++;
      continue;
    }
    if (l.effect === 'owed') t.toStateBani += l.amountBani;
    if (l.effect === 'withheld') {
      t.toStateBani += l.amountBani;
      t.withheldBani += l.amountBani;
    }
    if (l.effect === 'deductible') {
      t.toStateBani -= l.amountBani;
      t.deductibleBani += l.amountBani;
    }
    if (l.effect === 'cost') t.costBani += l.amountBani;
  }
  return t;
}

/** The Taxe tab (§4.3): lines grouped by the month they fall due, with that month's totals. Undated lines last. */
export function taxMonths(lines: readonly TaxLine[]): { month: MonthKey | null; lines: TaxLine[]; totals: TaxTotals }[] {
  const by = new Map<MonthKey | null, TaxLine[]>();
  for (const l of [...lines].sort(byDue)) {
    const k = l.dueOn ? monthKey(l.dueOn) : null;
    by.set(k, [...(by.get(k) ?? []), l]);
  }
  return [...by].map(([month, ls]) => ({ month, lines: ls, totals: taxTotals(ls) }));
}
