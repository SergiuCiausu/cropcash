/* The span of time a report covers. A harvest year is the APIA campaign year: it starts in November
   of the year before (harvestYear in farm/harvests.ts), and its records are the ones the app puts in
   that harvest, so a crop cost from October counts towards the next harvest exactly as on Recolte. */
import { harvestYear } from '../farm/harvests';

export type PeriodKind = 'month' | 'quarter' | 'year' | 'harvest';

export interface Period {
  kind: PeriodKind;
  /** "2026-03", "2026-Q3", "2026" (calendar year) or "2026" (harvest year). */
  key: string;
  /** First and last day, inclusive. */
  start: string;
  end: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const span = (y1: number, m1: number, y2: number, m2: number) => ({ start: `${y1}-${pad(m1)}-01`, end: `${y2}-${pad(m2)}-${pad(lastDay(y2, m2))}` });

export function periodOf(kind: PeriodKind, key: string): Period {
  if (kind === 'month') {
    const [, y, mo] = /^(\d{4})-(\d{2})$/.exec(key) ?? [];
    if (!y || !mo || +mo < 1 || +mo > 12) throw new Error(`Bad month: ${key}`);
    return { kind, key, ...span(+y, +mo, +y, +mo) };
  }
  if (kind === 'quarter') {
    const [, y, q] = /^(\d{4})-Q([1-4])$/.exec(key) ?? [];
    if (!y || !q) throw new Error(`Bad quarter: ${key}`);
    const first = (+q - 1) * 3 + 1;
    return { kind, key, ...span(+y, first, +y, first + 2) };
  }
  if (!/^\d{4}$/.test(key)) throw new Error(`Bad year: ${key}`);
  const y = +key;
  return { kind, key, ...(kind === 'year' ? span(y, 1, y, 12) : span(y - 1, 11, y, 10)) };
}

/** The period of this kind that holds `today`. */
export function currentPeriod(kind: PeriodKind, today: string): Period {
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7);
  if (kind === 'month') return periodOf(kind, today.slice(0, 7));
  if (kind === 'quarter') return periodOf(kind, `${y}-Q${Math.ceil(m / 3)}`);
  return periodOf(kind, String(kind === 'year' ? y : harvestYear(today)));
}

/** The period just before this one. */
export function previousPeriod(p: Period): Period {
  const y = +p.key.slice(0, 4);
  if (p.kind === 'month') {
    const m = +p.key.slice(5, 7);
    return periodOf('month', m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`);
  }
  if (p.kind === 'quarter') {
    const q = +p.key.slice(6);
    return periodOf('quarter', q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`);
  }
  return periodOf(p.kind, String(y - 1));
}

/** The latest `count` periods of a kind, newest first, starting with the one under way. */
export function recentPeriods(kind: PeriodKind, today: string, count: number): Period[] {
  const out = [currentPeriod(kind, today)];
  while (out.length < count) out.push(previousPeriod(out.at(-1)!));
  return out;
}

export const inPeriod = (isoDate: string, p: Pick<Period, 'start' | 'end'>) => isoDate.slice(0, 10) >= p.start && isoDate.slice(0, 10) <= p.end;
