/* Arendă: the tax withheld when paying a landowner, and the county price at which rent in kind counts
   in lei (docs/15-arenda.md, docs/data/arenda-prices-2026.json). The contracts and the rent owed come
   with plan step 7; these are the figures they rest on. */
import { z } from 'zod';

const Figure = z.object({ value: z.number().int().nonnegative(), status: z.string(), source: z.string().optional(), note: z.string().optional() });
const Prices = z.record(z.string(), z.number().int().positive());

const CountyPrices = z.object({
  status: z.string(),
  prices_bani_per_kg: Prices.nullable(),
  decision: z.string().optional(),
  valid_from: z.iso.date().optional(),
  url: z.url().optional(),
  labels_ro: z.record(z.string(), z.string()).optional(),
  checked: z.iso.date().optional(),
  note: z.string().optional(),
});

/** docs/data/arenda-prices-2026.json. */
export const ArendaPricesSchema = z
  .object({
    tax: z.object({
      expense_quota_pct: Figure,
      withholding_rate_pct: Figure,
      due: z.object({ day: z.number().int().min(1).max(28), month_offset: z.number().int().positive(), status: z.string(), source: z.string() }),
    }),
    products: z.array(z.object({ key: z.string(), genus: z.string(), name_ro: z.string() })).min(1),
    county_prices: z.record(z.string(), CountyPrices),
  })
  .superRefine((file, ctx) => {
    const keys = new Set(file.products.map((p) => p.key));
    for (const [county, c] of Object.entries(file.county_prices)) {
      if (c.prices_bani_per_kg && !c.decision) ctx.addIssue({ code: 'custom', message: `${county} has prices but no decision` });
      for (const key of Object.keys(c.prices_bani_per_kg ?? {}))
        if (!keys.has(key)) ctx.addIssue({ code: 'custom', message: `${county}: unknown product ${key}` });
    }
  });
export type ArendaPrices = z.infer<typeof ArendaPricesSchema>;

export interface RentTax {
  /** Gross, in money and kind at the county price. */
  grossBani: number;
  /** The flat 20% deducted as expenses (art. 84 (7)). */
  expensesBani: number;
  netBani: number;
  /** 10% of the net, withheld by the farm and paid to the state (art. 84 (8)). */
  taxBani: number;
  /** What the landowner gets, in value. */
  paidBani: number;
  /** Last day to pay the tax: the 25th of the month after the payment (art. 84 (9)). */
  dueOn: string;
}

/**
 * The tax the farm withholds on one rent payment to a person. Whole bani, rounded at each step.
 * How ANAF rounds (to the leu or to the ban) is DE-VERIFICAT (docs/11).
 */
export function rentTax(grossBani: number, paidOn: string, tax: ArendaPrices['tax']): RentTax {
  const expensesBani = Math.round((grossBani * tax.expense_quota_pct.value) / 100);
  const netBani = grossBani - expensesBani;
  const taxBani = Math.round((netBani * tax.withholding_rate_pct.value) / 100);
  const [y, m] = paidOn.split('-').map(Number) as [number, number];
  const month = m - 1 + tax.due.month_offset;
  const due = new Date(Date.UTC(y + Math.floor(month / 12), month % 12, tax.due.day));
  return { grossBani, expensesBani, netBani, taxBani, paidBani: grossBani - taxBani, dueOn: due.toISOString().slice(0, 10) };
}

/**
 * The county price for a crop's genus on a day, in bani per kg; null when the county's decision
 * isn't in the file, doesn't list the crop, or isn't in force yet on that day.
 */
export function inKindPriceBani(file: ArendaPrices, county: string, genus: string, on: string): number | null {
  const c = file.county_prices[county];
  const key = file.products.find((p) => p.genus === genus)?.key;
  if (!c?.prices_bani_per_kg || !key) return null;
  if (c.valid_from && on < c.valid_from) return null;
  return c.prices_bani_per_kg[key] ?? null;
}
