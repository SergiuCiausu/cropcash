/* The diesel excise refund (docs/04-farmer-reports.md §1): the litres on diesel expenses, and what
   they bring back. The rate depends on the day the diesel was bought (docs/data/fuel-excise.json →
   rates): the excise changed in 2026, and in the fuel crisis it changes every two weeks. */
import { z } from 'zod';
import { StatusSchema } from '../data/schemas';
import type { ReportRecord } from './ledger';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const FuelRateSchema = z.object({
  from: IsoDate,
  to: IsoDate,
  /** Bani per 10 litres, so 2,697 lei/l stays a whole number (2697). Null: not known yet. */
  bani_per_10_l: z.number().int().positive().nullable(),
  status: StatusSchema,
  source_url: z.string().url().nullable(),
  note: z.string().optional(),
});
export type FuelRate = z.infer<typeof FuelRateSchema>;

const CapSchema = z.object({
  id: z.string(),
  label_ro: z.string(),
  /** APIA crop codes (apia-crop-codes.json). Checked first. */
  codes: z.array(z.number().int()).optional(),
  /** Group titles of the APIA crop table. */
  headings: z.array(z.string()).optional(),
  /** Table sections, by their start ("II."). */
  sections: z.array(z.string()).optional(),
  /** Litres per hectare. */
  value: z.number().int().positive(),
});
export type FuelCap = z.infer<typeof CapSchema>;

const Dated = z.object({ status: StatusSchema, source_url: z.string().url().nullable(), note: z.string().optional() });

/** docs/data/fuel-excise.json. */
export const FuelExciseSchema = z
  .object({
    legal_basis: z.array(z.object({ act: z.string(), url: z.string().url(), status: StatusSchema })),
    rates: z.array(FuelRateSchema).min(1),
    frequency: z.object({ value: z.literal('quarter'), status: StatusSchema, source: z.string().optional() }),
    scheme_end: Dated.extend({ value: IsoDate }),
    acord: z.object({
      title_ro: z.string(),
      rule_ro: z.string(),
      deadlines: z.array(Dated.extend({ for_year: z.number().int(), date: IsoDate.nullable() })),
      documents_ro: z.array(z.string()),
    }),
    claims: z.array(Dated.extend({ period: z.string().regex(/^\d{4}-Q[1-4]$/), deadline: IsoDate })),
    claim_documents_ro: z.array(z.string()),
    how_ro: z.string(),
    eligibility_ro: z.string(),
    payment_ro: z.string(),
    caps_l_per_ha: z.array(CapSchema),
    caps_status: StatusSchema,
    caps_source_url: z.string().url(),
    caps_l_per_uvm: z.array(z.object({ id: z.string(), label_ro: z.string(), value_cl: z.number().int().positive() })),
    watch_urls: z.array(z.string().url()),
  })
  .passthrough();
export type FuelExcise = z.infer<typeof FuelExciseSchema>;

/** Litres kept as hundredths, so no float carries them: 120,5 l → 12050. */
export const litresToCl = (litres: number) => Math.round(litres * 100);

/** The rate for diesel bought on `date` (YYYY-MM-DD…), or null when no rate is known for that day. */
export function rateOn(date: string, rates: readonly FuelRate[]): FuelRate | null {
  const day = date.slice(0, 10);
  const rate = rates.find((r) => r.from <= day && day <= r.to);
  return rate && rate.bani_per_10_l !== null ? rate : null;
}

/** What `cl` hundredths of a litre bring back at `baniPer10l`, in whole bani. */
export function fuelRefundBani(cl: number, baniPer10l: number): number {
  return Math.round((cl * baniPer10l) / 1000);
}

/** The diesel expenses of a period: those with litres count, the rest are listed to be completed. */
export function fuelLines(rows: readonly ReportRecord[], fuel: Pick<FuelExcise, 'rates'>) {
  const diesel = rows.filter((r) => r.kind === 'expense' && r.category === 'diesel');
  const withLitres = diesel.filter((r) => (r.fuelLitersCl ?? 0) > 0);
  const lines = withLitres.map((r) => {
    const rate = rateOn(r.date, fuel.rates);
    return { record: r, rate, refundBani: rate ? fuelRefundBani(r.fuelLitersCl!, rate.bani_per_10_l!) : null };
  });
  /* One rounding per rate, from its litres, so the total isn't off by the rounding of each line. */
  const byRate = new Map<FuelRate, number>();
  for (const l of lines) if (l.rate) byRate.set(l.rate, (byRate.get(l.rate) ?? 0) + l.record.fuelLitersCl!);
  const rates = [...byRate.keys()].sort((a, b) => a.from.localeCompare(b.from));
  return {
    lines,
    missing: diesel.filter((r) => !((r.fuelLitersCl ?? 0) > 0)),
    /** Litres noted on a day with no known rate: counted in the litres, not in the refund. */
    noRate: lines.filter((l) => !l.rate).map((l) => l.record),
    litresCl: withLitres.reduce((s, r) => s + r.fuelLitersCl!, 0),
    paidBani: withLitres.reduce((s, r) => s - r.amountBani, 0),
    refundBani: [...byRate].reduce((s, [rate, cl]) => s + fuelRefundBani(cl, rate.bani_per_10_l!), 0),
    /** The rates used, oldest first. */
    rates,
    unverified: rates.some((r) => r.status === 'DE-VERIFICAT'),
  };
}

/** A parcel as the cap needs it: its APIA crop line and its hectares. */
export interface CapParcel {
  code: number | null;
  heading: string | null;
  section: string | null;
  areaHa: number;
  /** The name shown when the crop has no cap. */
  name: string;
}

/** The cap that covers a crop: by its code first, then its APIA group, then its table section. */
export function capFor(p: Pick<CapParcel, 'code' | 'heading' | 'section'>, caps: readonly FuelCap[]): FuelCap | null {
  return (
    caps.find((c) => p.code !== null && c.codes?.includes(p.code)) ??
    caps.find((c) => p.heading !== null && c.headings?.includes(p.heading)) ??
    caps.find((c) => p.section !== null && c.sections?.some((s) => p.section!.startsWith(s))) ??
    null
  );
}

/**
 * The most litres (in hundredths) the farm can claim in a year. `acordMonth` (1–12): an acord asked
 * for during the year covers only the months after it. Crops with no cap are listed by name.
 */
export function fuelCapCl(parcels: readonly CapParcel[], caps: readonly FuelCap[], acordMonth?: number) {
  let capCl = 0;
  const uncapped: string[] = [];
  for (const p of parcels) {
    const cap = capFor(p, caps);
    if (!cap) {
      if (!uncapped.includes(p.name)) uncapped.push(p.name);
      continue;
    }
    capCl += Math.round(cap.value * 100 * p.areaHa);
  }
  const months = acordMonth ? 12 - acordMonth : 12;
  return { capCl: Math.round((capCl * months) / 12), uncapped };
}
