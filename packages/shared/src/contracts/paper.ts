/* A contract read from its paper (docs/contracts-plan.md step 8). Claude copies what is printed (ContractPaperSchema);
   normalizeContractPaper checks every value and drops what doesn't parse, so the form gets only values the farmer can
   confirm one by one. Nothing here is saved: the farmer saves the contract from the form, as when typing it.
   The paper doesn't know which side is the farm, so both sides come back with their role, and so do the payments
   (who pays). No CNP, IBAN, address or phone ever leaves this function (as D4). */
import { z } from 'zod';
import type { AppData } from '../data';
import { parseAreaText, parseLeiText } from '../documents/index';
import type { Ari, Bani } from '../money';
import type { PartyKind, PaymentRepeat } from './model';
import { CONTRACT_KINDS, type AnyContractKind } from './types';

/** What the reader may answer for the kind: every kind, arendă included (it goes to the Arendă screen). */
export const PAPER_CONTRACT_KINDS = ['arenda', ...CONTRACT_KINDS] as const;

const Str = z.string().nullable();

/** The model's answer: values as printed, nothing computed. */
export const ContractPaperSchema = z.object({
  is_contract: z.boolean(),
  kind: z.enum(PAPER_CONTRACT_KINDS).nullable(),
  title: Str,
  number: Str,
  signed_on: Str,
  starts_on: Str,
  ends_on: Str,
  renews_itself: z.boolean().nullable(),
  notice_days: Str,
  renew_months: Str,
  sides: z.array(z.object({ role: z.string(), name: Str, cui: Str, is_company: z.boolean().nullable() })),
  crop_id: Str,
  quantity_tonnes: Str,
  area_ha: Str,
  vat_percent: Str,
  residual_value: Str,
  payments: z.array(
    z.object({
      label: Str,
      payer_role: Str,
      first_on: Str,
      repeat: z.enum(['none', 'monthly', 'quarterly', 'yearly']).nullable(),
      times: Str,
      amount: Str,
      per_ha: z.boolean().nullable(),
      kg: Str,
      crop_id: Str,
    }),
  ),
});
export type ContractPaper = z.infer<typeof ContractPaperSchema>;

export interface PaperSide {
  /** As printed: „vânzător”, „cumpărător”, „locatar”, „asigurat”. */
  role: string;
  name: string | null;
  /** A CUI that parses (2–10 digits, with RO when printed); null otherwise. */
  cui: string | null;
  kind: PartyKind;
}

export interface PaperPayment {
  label: string | null;
  /** The role of the side that pays, as one of `sides[].role`; null when the paper doesn't say. */
  payerRole: string | null;
  firstOn: string | null;
  repeat: PaymentRepeat;
  times: number | null;
  amountBani: Bani | null;
  perHa: boolean;
  kg: number | null;
  cropId: string | null;
}

/** A contract as read, every value checked. Null: not printed or not readable, so the farmer types it. */
export interface ContractPaperReading {
  /** Null when the paper isn't a contract at all. */
  kind: AnyContractKind | null;
  title: string | null;
  number: string | null;
  signedOn: string | null;
  startsOn: string | null;
  endsOn: string | null;
  autoRenews: boolean | null;
  noticeDays: number | null;
  renewMonths: number | null;
  sides: PaperSide[];
  cropId: string | null;
  quantityKg: number | null;
  areaAri: Ari | null;
  vatBp: number | null;
  residualBani: Bani | null;
  payments: PaperPayment[];
}

const MAX_SIDES = 4;
const MAX_PAYMENTS = 24;
const MAX_NOTICE = 730;
const MAX_TIMES = 600;

/** 13 digits in a row: a CNP. 15+ letters and digits starting with RO and two digits: an IBAN. */
const PERSONAL = /\d{13}|RO\d{2}[A-Z]{4}[0-9A-Z]{10,}/i;
/** A text that may go to the form: trimmed, short, and never a personal number. */
function text(s: string | null | undefined, max: number): string | null {
  const t = s?.replace(/\s+/g, ' ').trim() ?? '';
  if (!t || PERSONAL.test(t.replace(/\s/g, ''))) return null;
  return t.slice(0, max);
}

function day(s: string | null | undefined): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return z.iso.date().safeParse(s).success ? s : null;
}

/** A whole number as printed („30”, „30 de zile”); null when it isn't one or is out of range. */
function whole(s: string | null | undefined, max: number): number | null {
  const m = /^\s*(\d{1,6})\b/.exec(s ?? '');
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

/** „200”, „200,5” tonnes → kg. */
function tonnesToKg(s: string | null | undefined): number | null {
  const m = /^\s*(\d+)(?:[.,](\d{1,3}))?\s*(t|tone)?\s*$/i.exec(s ?? '');
  if (!m) return null;
  const kg = Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0'));
  return kg > 0 ? kg : null;
}

/** „21”, „21%”, „9,5” → basis points. */
function percentToBp(s: string | null | undefined): number | null {
  const m = /^\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*%?\s*$/.exec(s ?? '');
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bp <= 10_000 ? bp : null;
}

/** A CUI as the schemas take it: digits, with RO in front when printed. */
function cuiOf(s: string | null | undefined): string | null {
  const c = s?.replace(/\s+/g, '').toUpperCase().replace(/^CUI:?|^CIF:?/, '') ?? '';
  return /^(RO)?[0-9]{2,10}$/.test(c) ? c : null;
}

export function normalizeContractPaper(raw: ContractPaper, data: Pick<AppData, 'crops'>): ContractPaperReading {
  const crops = new Set(data.crops.crops.map((c) => c.id));
  const crop = (id: string | null) => (id && crops.has(id) ? id : null);
  const sides: PaperSide[] = raw.sides.slice(0, MAX_SIDES).flatMap((s) => {
    const role = text(s.role, 40);
    if (!role) return [];
    const cui = cuiOf(s.cui);
    const kind: PartyKind = s.is_company === false ? 'person' : cui || s.is_company ? 'company' : 'person';
    // A person has no CUI on the form (the schema refuses it), and their name is all we keep.
    return [{ role, name: text(s.name, 80), cui: kind === 'company' ? cui : null, kind }];
  });
  const roles = new Set(sides.map((s) => s.role.toLowerCase()));
  const payments: PaperPayment[] = raw.payments.slice(0, MAX_PAYMENTS).map((p) => {
    const payer = text(p.payer_role, 40);
    const repeat = p.repeat ?? 'none';
    return {
      label: text(p.label, 40),
      payerRole: payer && roles.has(payer.toLowerCase()) ? sides.find((s) => s.role.toLowerCase() === payer.toLowerCase())!.role : null,
      firstOn: day(p.first_on),
      repeat,
      times: repeat === 'none' ? null : whole(p.times, MAX_TIMES),
      amountBani: parseLeiText(p.amount),
      perHa: p.per_ha === true,
      kg: whole(p.kg, 100_000_000),
      cropId: crop(p.crop_id),
    };
  });
  const startsOn = day(raw.starts_on);
  const printedEnd = day(raw.ends_on);
  const endsOn = printedEnd && startsOn && printedEnd < startsOn ? null : printedEnd;
  return {
    kind: raw.is_contract ? (raw.kind ?? 'other') : null,
    title: text(raw.title, 80),
    number: text(raw.number, 40),
    signedOn: day(raw.signed_on),
    startsOn,
    endsOn,
    autoRenews: endsOn ? raw.renews_itself : null,
    noticeDays: whole(raw.notice_days, MAX_NOTICE),
    renewMonths: endsOn ? whole(raw.renew_months, 120) : null,
    sides,
    cropId: crop(raw.crop_id),
    quantityKg: tonnesToKg(raw.quantity_tonnes),
    areaAri: parseAreaText(raw.area_ha),
    vatBp: percentToBp(raw.vat_percent),
    residualBani: parseLeiText(raw.residual_value),
    payments,
  };
}

/**
 * Which way a payment goes once the farmer says which side they are: the farm pays (out) or gets paid (in). Null when
 * the paper doesn't say who pays.
 */
export function paymentDirection(p: Pick<PaperPayment, 'payerRole'>, mine: string): 'in' | 'out' | null {
  if (!p.payerRole) return null;
  return p.payerRole === mine ? 'out' : 'in';
}

/** The other side, once the farmer says which side they are: the first side with another role. */
export const otherSide = (r: Pick<ContractPaperReading, 'sides'>, mine: string | null): PaperSide | null => r.sides.find((s) => s.role !== mine) ?? null;
