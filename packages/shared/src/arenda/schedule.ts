/* The rent payments a farm's contracts bring over a stretch of months, with the tax withheld on each
   (docs/employees-arenda-plan.md §3.3–3.4, docs/15-arenda.md §1, §3). Pure: the plan (cashflow/timeline.ts)
   turns them into entries, and the Arendă screen lists them per landowner.

   - A contract pays once a year, in its pay month. Without one, rent in kind is given in the month its crop is
     harvested; money rent with no month isn't planned (the screen asks for the month).
   - A contract past its end still pays: it renews itself unless refused in writing (Codul civil art. 1848). It stops
     only when it's marked as ended (`archived_at`).
   - The tax is computed on each payment (Codul fiscal art. 84 (7)), on money plus kind at the county price, and
     falls due on the 25th of the next month. It's split between the money and the kind in proportion: the landowner
     gets 92% of each, the farm pays the 8% to the state in lei. How the accountant really withholds tax on rent paid
     only in kind is DE-VERIFICAT (docs/15 §3).
   - On a `given` contract the farm receives: what the lessee should pay after withholding. Nothing to pay the state. */
import { addMonths, dayInMonth, monthKey, monthOf, type IsoDate, type MonthKey } from '../cashflow/dates';
import type { AppData } from '../data';
import { rentDue, type LeaseDirection, type StoredContract } from './contracts';
import { inKindPriceBani, rentTax } from './prices';

export interface PlannedRent {
  contractId: string;
  landownerId: string;
  direction: LeaseDirection;
  /** The pay day: the plan's day in the pay month. */
  date: IsoDate;
  /** Money rent: the whole sum, the tax on it, and what the landowner gets. */
  grossBani: number;
  cashTaxBani: number;
  paidBani: number;
  /** Rent in kind: the crop, the kg the contract says, and the kg the landowner gets after the tax. */
  cropId: string | null;
  grossKg: number;
  paidKg: number;
  /** The county price for the crop, bani per kg; null when it isn't known (then the tax isn't either). */
  priceBaniPerKg: number | null;
  /** Money plus kind at the county price; null without a price for the kind. */
  grossValueBani: number | null;
  /** The whole tax on this payment (withheld by whoever pays); null without a county price for the kind. */
  taxBani: number | null;
  /** The day the tax is due (25th of the next month). */
  taxDueOn: IsoDate | null;
  /** The pay month came from the crop's harvest, not from the contract. */
  guessedMonth: boolean;
}

/** The botanical genus of a crop id, which picks the county price (docs/15-arenda.md §5). */
export function genusOf(data: Pick<AppData, 'crops' | 'catalogue'>, cropId: string): string | null {
  return data.crops.crops.find((c) => c.id === cropId)?.genus ?? data.catalogue.find((c) => c.id === cropId)?.genus ?? null;
}

/** The county price for a crop on a day, bani per kg, or null. */
export function arendaPrice(data: Pick<AppData, 'crops' | 'catalogue' | 'arenda'>, county: string | null | undefined, cropId: string | null, on: IsoDate): number | null {
  const genus = cropId ? genusOf(data, cropId) : null;
  return genus && county ? inKindPriceBani(data.arenda, county, genus, on) : null;
}

/** The month a contract pays in: its own, or its crop's harvest for rent in kind; null when neither is known. */
export function payMonthOf(c: Pick<StoredContract, 'pay_month' | 'rent_kg_per_ha' | 'rent_crop_id'>, data: Pick<AppData, 'crops'>): { month: number; guessed: boolean } | null {
  if (c.pay_month) return { month: c.pay_month, guessed: false };
  const harvest = c.rent_kg_per_ha && c.rent_crop_id ? data.crops.crops.find((x) => x.id === c.rent_crop_id)?.harvest_month : undefined;
  return harvest ? { month: harvest, guessed: true } : null;
}

/** One contract's payment on `date`. */
export function rentPayment(c: StoredContract, date: IsoDate, county: string | null | undefined, data: Pick<AppData, 'crops' | 'catalogue' | 'arenda'>, guessed = false): PlannedRent {
  const price = arendaPrice(data, county, c.rent_crop_id, date);
  const due = rentDue(c, price);
  // Withheld on both sides: by the farm when it pays, by the lessee when the farm is paid.
  const tax = due.leiEquivalentBani !== null ? rentTax(due.leiEquivalentBani, date, data.arenda.tax) : null;
  const total = tax?.taxBani ?? 0;
  // The tax is split between money and kind in proportion to their value.
  const cashTaxBani = tax && due.leiEquivalentBani ? Math.round((total * due.bani) / due.leiEquivalentBani) : 0;
  const kindTaxBani = total - cashTaxBani;
  const kgTax = price && kindTaxBani > 0 ? Math.round(kindTaxBani / price) : 0;
  return {
    contractId: c.id,
    landownerId: c.landowner_id,
    direction: c.direction,
    date,
    grossBani: due.bani,
    cashTaxBani,
    paidBani: due.bani - cashTaxBani,
    cropId: due.cropId,
    grossKg: due.kg,
    paidKg: due.kg - kgTax,
    priceBaniPerKg: due.kg ? price : null,
    grossValueBani: due.leiEquivalentBani,
    taxBani: tax ? tax.taxBani : null,
    taxDueOn: tax ? tax.dueOn : null,
    guessedMonth: guessed,
  };
}

/** Every payment of the farm's contracts from `from` to `to` (month keys, both included). */
export function rentPayments(
  contracts: readonly StoredContract[],
  from: MonthKey,
  to: MonthKey,
  county: string | null | undefined,
  data: Pick<AppData, 'crops' | 'catalogue' | 'arenda'>,
  day: number,
): PlannedRent[] {
  const out: PlannedRent[] = [];
  for (const c of contracts) {
    const when = payMonthOf(c, data);
    if (!when || (!c.rent_bani_per_ha && !c.rent_kg_per_ha)) continue;
    const ended = c.archived_at ? c.archived_at.slice(0, 10) : null;
    for (let key = from; key <= to; key = addMonths(key, 1)) {
      if (monthOf(key) !== when.month) continue;
      const date = dayInMonth(key, day);
      // Not before it starts; after its end only if it renewed (not marked as ended).
      if (monthKey(c.starts_on) > key || (ended && date > ended)) continue;
      out.push(rentPayment(c, date, county, data, when.guessed));
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.contractId.localeCompare(b.contractId));
}

/** Contracts the plan leaves out: money rent with no pay month. */
export const unplannedContracts = (contracts: readonly StoredContract[], data: Pick<AppData, 'crops'>) =>
  contracts.filter((c) => !c.archived_at && (c.rent_bani_per_ha || c.rent_kg_per_ha) && !payMonthOf(c, data));

export interface LandownerYear {
  landownerId: string;
  grossBani: number;
  /** Money plus kind at the county price; null when a crop has no price. */
  grossValueBani: number | null;
  taxBani: number | null;
  paidBani: number;
  kg: { cropId: string; grossKg: number; paidKg: number }[];
}

/**
 * Per landowner on `taken` contracts: the gross, the tax withheld and what they get, for the accountant's list
 * (§3.4: name, locality, gross, withheld, net; the CNP column stays empty, D4).
 */
export function landownerYears(payments: readonly PlannedRent[]): LandownerYear[] {
  const by = new Map<string, LandownerYear>();
  for (const p of payments) {
    if (p.direction !== 'taken') continue;
    const row = by.get(p.landownerId) ?? { landownerId: p.landownerId, grossBani: 0, grossValueBani: 0, taxBani: 0, paidBani: 0, kg: [] };
    row.grossBani += p.grossBani;
    row.paidBani += p.paidBani;
    row.grossValueBani = row.grossValueBani === null || p.grossValueBani === null ? null : row.grossValueBani + p.grossValueBani;
    row.taxBani = row.taxBani === null || p.taxBani === null ? null : row.taxBani + p.taxBani;
    if (p.cropId) {
      const k = row.kg.find((x) => x.cropId === p.cropId);
      if (k) {
        k.grossKg += p.grossKg;
        k.paidKg += p.paidKg;
      } else row.kg.push({ cropId: p.cropId, grossKg: p.grossKg, paidKg: p.paidKg });
    }
    by.set(p.landownerId, row);
  }
  return [...by.values()];
}
