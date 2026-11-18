/* Money per parcel in one harvest year. A record tied to a parcel counts there in full. A record
   tied only to a crop is shared over that crop's parcels by area, and one tied to nothing over all
   parcels: both kept apart, so the card can say they were shared. Integer bani throughout; what's
   left from rounding goes to the largest parcel, so the parts add up exactly. */
import { recordHarvestYear } from '../farm/harvests';
import type { StoredTransaction } from '../farm/plan-inputs';
import type { Bani } from '../money';
import type { StoredSeason } from './model';

export interface PlotMoney {
  expenses: { direct: Bani; sharedCrop: Bani; sharedFarm: Bani; total: Bani; byCategory: Record<string, Bani> };
  revenue: { direct: Bani; sharedCrop: Bani; total: Bani };
  result: Bani;
  /** Per hectare, rounded to whole bani. Null for a parcel with no area this year. */
  perHa: { expenses: Bani; revenue: Bani; result: Bani } | null;
}

type Tx = Pick<StoredTransaction, 'kind' | 'category' | 'crop_id' | 'amount_bani' | 'occurred_at' | 'harvest_year'> & {
  plot_id?: string | null;
};

const emptyMoney = (): PlotMoney => ({
  expenses: { direct: 0, sharedCrop: 0, sharedFarm: 0, total: 0, byCategory: {} },
  revenue: { direct: 0, sharedCrop: 0, total: 0 },
  result: 0,
  perHa: null,
});

/** `bani` split over the seasons by area. Largest first; the remainder lands on the first. */
export function splitByArea(bani: Bani, seasons: readonly Pick<StoredSeason, 'plot_id' | 'area_ari'>[]): Map<string, Bani> {
  const out = new Map<string, Bani>();
  const sorted = [...seasons].sort((a, b) => b.area_ari - a.area_ari || (a.plot_id < b.plot_id ? -1 : 1));
  const total = sorted.reduce((s, x) => s + x.area_ari, 0);
  if (total === 0) return out;
  let given = 0;
  for (const s of sorted) {
    const part = Math.floor((bani * s.area_ari) / total);
    out.set(s.plot_id, part);
    given += part;
  }
  out.set(sorted[0]!.plot_id, out.get(sorted[0]!.plot_id)! + bani - given);
  return out;
}

/** Bani per hectare: bani × 100 / ari, rounded. */
const perHa = (bani: Bani, ari: number) => Math.round((bani * 100) / ari);

/**
 * Every parcel's money in `year`. `seasons` are all the farm's seasons (any year); only `year`'s
 * count. Records from other harvest years are left out, by the same rule the rest of the app uses.
 */
export function plotsMoney(
  year: number,
  seasons: readonly StoredSeason[],
  transactions: readonly Tx[],
  crops: readonly { id: string; harvest_month: number }[],
): Map<string, PlotMoney> {
  const these = seasons.filter((s) => s.harvest_year === year);
  const money = new Map(these.map((s) => [s.plot_id, emptyMoney()]));
  const byCrop = new Map<string, StoredSeason[]>();
  for (const s of these) if (s.crop_id) byCrop.set(s.crop_id, [...(byCrop.get(s.crop_id) ?? []), s]);

  for (const t of transactions) {
    if (t.kind !== 'sale' && t.kind !== 'expense') continue;
    if (recordHarvestYear(t, crops) !== year) continue;
    const bani = Math.abs(t.amount_bani);
    const isExpense = t.kind === 'expense';
    const credit = (plotId: string, part: Bani, bucket: 'direct' | 'sharedCrop' | 'sharedFarm') => {
      const m = money.get(plotId);
      if (!m || part === 0) return;
      if (isExpense) {
        m.expenses[bucket] += part;
        const cat = t.category ?? 'other';
        m.expenses.byCategory[cat] = (m.expenses.byCategory[cat] ?? 0) + part;
      } else if (bucket !== 'sharedFarm') {
        m.revenue[bucket] += part;
      }
    };

    if (t.plot_id) {
      // A parcel with no season this year still keeps its own records out of other parcels.
      credit(t.plot_id, bani, 'direct');
    } else if (t.crop_id) {
      const group = byCrop.get(t.crop_id);
      if (group) for (const [id, part] of splitByArea(bani, group)) credit(id, part, 'sharedCrop');
    } else if (isExpense) {
      for (const [id, part] of splitByArea(bani, these)) credit(id, part, 'sharedFarm');
    }
  }

  for (const s of these) {
    const m = money.get(s.plot_id)!;
    m.expenses.total = m.expenses.direct + m.expenses.sharedCrop + m.expenses.sharedFarm;
    m.revenue.total = m.revenue.direct + m.revenue.sharedCrop;
    m.result = m.revenue.total - m.expenses.total;
    m.perHa = { expenses: perHa(m.expenses.total, s.area_ari), revenue: perHa(m.revenue.total, s.area_ari), result: perHa(m.result, s.area_ari) };
  }
  return money;
}
