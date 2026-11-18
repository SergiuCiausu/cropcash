/* The diesel excise refund (docs/04-farmer-reports.md §1): the litres on diesel expenses, and what
   they bring back at the rate in docs/data/fuel-excise.json. The rate is DE-VERIFICAT. */
import { z } from 'zod';
import type { ReportRecord } from './ledger';

const Figure = z.object({ value: z.number().int().positive(), status: z.string(), source: z.string().optional(), note: z.string().optional() });

/** docs/data/fuel-excise.json. */
export const FuelExciseSchema = z.object({
  refund_bani_per_10_l: Figure,
  frequency: z.object({ value: z.literal('quarter'), status: z.string(), source: z.string().optional() }),
});
export type FuelExcise = z.infer<typeof FuelExciseSchema>;

/** Litres kept as hundredths, so no float carries them: 120,5 l → 12050. */
export const litresToCl = (litres: number) => Math.round(litres * 100);

/** What `cl` hundredths of a litre bring back, in whole bani. */
export function fuelRefundBani(cl: number, rate: Pick<FuelExcise, 'refund_bani_per_10_l'>): number {
  return Math.round((cl * rate.refund_bani_per_10_l.value) / 1000);
}

/** The diesel expenses of a period: those with litres count, the rest are listed to be completed. */
export function fuelLines(rows: readonly ReportRecord[], rate: Pick<FuelExcise, 'refund_bani_per_10_l'>) {
  const diesel = rows.filter((r) => r.kind === 'expense' && r.category === 'diesel');
  const withLitres = diesel.filter((r) => (r.fuelLitersCl ?? 0) > 0);
  const litresCl = withLitres.reduce((s, r) => s + r.fuelLitersCl!, 0);
  return {
    lines: withLitres.map((r) => ({ record: r, refundBani: fuelRefundBani(r.fuelLitersCl!, rate) })),
    missing: diesel.filter((r) => !((r.fuelLitersCl ?? 0) > 0)),
    litresCl,
    paidBani: withLitres.reduce((s, r) => s - r.amountBani, 0),
    /* From the total, so the total isn't off by the rounding of each line. */
    refundBani: fuelRefundBani(litresCl, rate),
  };
}
