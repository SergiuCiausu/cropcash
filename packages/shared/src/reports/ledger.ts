/* The sums behind the money reports: which records fall in a period, and their totals by month and
   by kind. No words here; web/lib/reports writes them. */
import { inPeriod, type Period } from './period';

/** A money record as the pages hold it (PageRecord in web/lib/live/farm.ts). */
export interface ReportRecord {
  id: string;
  date: string;
  kind: 'sale' | 'expense' | 'apia_advance' | 'apia_balance';
  /** Positive in, negative out. */
  amountBani: number;
  cropId?: string;
  category?: string;
  /** Arrived through Stripe. */
  fixed?: true;
  /** The invoice, receipt or contract number (migration 027). */
  docNo?: string;
  /** Who was paid, or who bought. */
  counterparty?: string;
  /** On a diesel expense: the litres, in hundredths. */
  fuelLitersCl?: number;
}

/** Oldest first; a record kept in two harvests counts once. */
function oldestFirst(rows: ReportRecord[]): ReportRecord[] {
  const seen = new Set<string>();
  const unique = rows.filter((r) => !r.id || (!seen.has(r.id) && !!seen.add(r.id)));
  return unique.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/**
 * The records of a period. A harvest takes the records the app put in that harvest (a crop cost from
 * October counts towards the next harvest, as on Recolte); any other period goes by date.
 */
export function recordsInPeriod(period: Period, harvests: readonly { year: number; records: readonly ReportRecord[] }[]): ReportRecord[] {
  if (period.kind === 'harvest') return oldestFirst(harvests.filter((h) => h.year === +period.key).flatMap((h) => h.records));
  return oldestFirst(harvests.flatMap((h) => h.records).filter((r) => inPeriod(r.date, period)));
}

export interface MoneyTotals {
  inBani: number;
  outBani: number;
}

const totals = (rows: readonly ReportRecord[]): MoneyTotals => ({
  inBani: rows.filter((r) => r.amountBani > 0).reduce((s, r) => s + r.amountBani, 0),
  outBani: rows.filter((r) => r.amountBani < 0).reduce((s, r) => s - r.amountBani, 0),
});

/** What a group of records is: sales of one crop, APIA money, or expenses of one category. */
export type GroupKey = { kind: 'sale'; cropId: string | null } | { kind: 'apia' } | { kind: 'expense'; category: string | null };

const keyOf = (r: ReportRecord): GroupKey =>
  r.kind === 'sale' ? { kind: 'sale', cropId: r.cropId ?? null } : r.kind === 'expense' ? { kind: 'expense', category: r.category ?? null } : { kind: 'apia' };
const ORDER = { sale: 0, apia: 1, expense: 2 } as const;

export interface Ledger extends MoneyTotals {
  rows: ReportRecord[];
  months: (MoneyTotals & { key: string; rows: ReportRecord[] })[];
  groups: (MoneyTotals & { key: GroupKey })[];
}

/** Records grouped by month (oldest first) and by kind (sales, APIA, then expenses, biggest first). */
export function ledgerOf(rows: readonly ReportRecord[]): Ledger {
  const sorted = oldestFirst([...rows]);
  const months = [...new Set(sorted.map((r) => r.date.slice(0, 7)))].map((key) => {
    const monthRows = sorted.filter((r) => r.date.startsWith(key));
    return { key, rows: monthRows, ...totals(monthRows) };
  });
  const byKey = new Map<string, { key: GroupKey; rows: ReportRecord[] }>();
  for (const r of sorted) {
    const key = keyOf(r);
    const id = JSON.stringify(key);
    (byKey.get(id) ?? byKey.set(id, { key, rows: [] }).get(id)!).rows.push(r);
  }
  const groups = [...byKey.values()]
    .map((g) => ({ key: g.key, ...totals(g.rows) }))
    .sort((a, b) => ORDER[a.key.kind] - ORDER[b.key.kind] || b.inBani + b.outBani - (a.inBani + a.outBani));
  return { rows: sorted, months, groups, ...totals(sorted) };
}

/** An APIA payment the plan still expects (a timeline entry of kind apia_*). */
export interface ExpectedSubsidy {
  kind: 'apia_advance' | 'apia_balance';
  date: string;
  window: { start: string; end: string } | null;
  /** The probable amount, in bani. */
  amountBani: number;
  estimated: boolean;
  unverified: boolean;
}

/** APIA money received in a period, and what the plan still expects in it from today on. */
export function subsidiesOf(rows: readonly ReportRecord[], expected: readonly ExpectedSubsidy[], period: Period, today: string) {
  const received = oldestFirst(rows.filter((r) => r.kind === 'apia_advance' || r.kind === 'apia_balance'));
  const upcoming = expected.filter((e) => e.date >= today && inPeriod(e.date, period)).sort((a, b) => a.date.localeCompare(b.date));
  return {
    received,
    upcoming,
    receivedBani: received.reduce((s, r) => s + r.amountBani, 0),
    upcomingBani: upcoming.reduce((s, e) => s + e.amountBani, 0),
  };
}
