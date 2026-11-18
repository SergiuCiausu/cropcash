/* What a parcel's row and card say (docs/harta-plan.md, step 8). Pure, so the tests read the same words
   the farmer does. Sums are written in lei; the page passes them through useMoney().text for euro. */
import type { HarvestInfo, PlotRow, SowingInfo, StoredPlot, TodoItem } from '../../../packages/shared/src/plots/index';
import { date, daysLeft, exact, ha, MONTHS, zile } from '../../lib/cc/format';
import { kindLabel } from './filter-text';

/** "Bloc 286 · parcela 1a", the name the farmer gave it, or which crop's hectares are still unplaced. */
export function plotName(p: Pick<StoredPlot, 'name' | 'bloc_fizic' | 'parcel_no' | 'auto_crop_id'>, cropName: (id: string) => string): string {
  if (p.name) return p.name;
  if (p.bloc_fizic) return p.parcel_no ? `Bloc ${p.bloc_fizic} · parcela ${p.parcel_no}` : `Bloc ${p.bloc_fizic}`;
  if (p.parcel_no) return `Parcela ${p.parcel_no}`;
  if (p.auto_crop_id) return `${cropName(p.auto_crop_id)}, fără loc pe hartă`;
  return 'Parcelă fără nume';
}

const monthWord = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const luni = (n: number) => (n === 1 ? 'o lună' : `${n} ${n >= 20 ? 'de ' : ''}luni`);

/** "recoltă în ~8 luni", "recoltă luna asta", "recoltat pe 12 iul. 2027". */
export function harvestText(h: HarvestInfo | null): string | null {
  if (!h) return null;
  const guess = h.source === 'crop_usual' ? '~' : '';
  if (h.state === 'harvested') return h.date ? `recoltat pe ${date(h.date, true)}` : `recoltat în ${monthWord(h.month)}`;
  if (h.state === 'this_month') return 'recoltă luna asta';
  if (h.state === 'late') return `recolta era de așteptat în ${monthWord(h.month)}`;
  return h.monthsLeft === 1 ? 'recoltă luna viitoare' : `recoltă în ${guess}${luni(h.monthsLeft)}`;
}

/** "semănat pe 5 oct. 2026", "se seamănă de obicei în apr. 2027". */
export function sowingText(s: SowingInfo | null, today: string): string | null {
  if (!s) return null;
  if (s.date) return `${s.date <= today ? 'semănat' : 'de semănat'} pe ${date(s.date, true)}`;
  const past = s.month <= today.slice(0, 7);
  if (s.source === 'farm_plan') return `${past ? 'semănat' : 'de semănat'} în ${monthWord(s.month)}, după planul tău`;
  return `${past ? 'semănat de obicei' : 'se seamănă de obicei'} în ${monthWord(s.month)}`;
}

/** When a piece of work is due: "azi", "mâine", "în 5 zile", "pe 12 mar.", "acum 3 zile", or nothing known. */
export function dueText(item: Pick<TodoItem, 'due'>, today: string): string {
  if (!item.due) return 'fără zi';
  const d = daysLeft(item.due, today);
  if (d === 0) return 'azi';
  if (d === 1) return 'mâine';
  if (d === -1) return 'de ieri';
  if (d < 0) return `de acum ${zile(-d)}`;
  if (d <= 30) return `în ${zile(d)}`;
  return `pe ${date(item.due)}`;
}

/** The row's work line: what's late first, then the next thing. Null when there's nothing to do. */
export function nextWorkText(row: Pick<PlotRow, 'operations'>, today: string): { text: string; late: boolean } | null {
  const { overdue, next } = row.operations;
  if (overdue.length === 1) return { text: `${kindLabel(overdue[0]!.kind)}, întârziat ${dueText(overdue[0]!, today)}`, late: true };
  if (overdue.length > 1) return { text: `${overdue.length} lucrări întârziate`, late: true };
  if (next) return { text: `${kindLabel(next.kind)} ${dueText(next, today)}`, late: false };
  return null;
}

/** "+1.250 lei/ha", "−300 lei/ha", or null without money or area. */
export function perHaText(row: Pick<PlotRow, 'money'>): string | null {
  const r = row.money?.perHa?.result;
  if (r == null) return null;
  const hasMoney = (row.money!.expenses.total ?? 0) !== 0 || (row.money!.revenue.total ?? 0) !== 0;
  if (!hasMoney) return null;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${exact(Math.abs(r))} lei/ha`;
}

/** "8,54 ha", or the hectares still to place. */
export const areaText = (ari: number | undefined) => (ari == null ? null : `${ha(ari)} ha`);

/** "+12.500 lei", "−3.000 lei", "0 lei". */
export const signed = (bani: number) => `${bani > 0 ? '+' : bani < 0 ? '−' : ''}${exact(Math.abs(bani))} lei`;
