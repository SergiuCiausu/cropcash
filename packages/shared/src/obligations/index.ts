/* „De raportat”: what the farmer must report or file, and by when. Pure: the deadlines come from
   docs/data/calendar-2026.json (events with `obligation: true`), the diesel facts from
   docs/data/fuel-excise.json, and the litres from the farm's records. */
import { addDays, daysBetween } from '../calendar/events';
import type { CalendarEvent, CalendarFile, Status } from '../data/schemas';
import { fuelLines, type FuelExcise } from '../reports/fuel';
import type { ReportRecord } from '../reports/ledger';
import { currentPeriod, inPeriod, periodOf, type Period } from '../reports/period';

function addYears(iso: string, k: number): string {
  const y = +iso.slice(0, 4) + k;
  const md = iso.slice(5, 10);
  // 29 February in a year without it: the 28th.
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return `${y}-${md === '02-29' && !leap ? '02-28' : md}`;
}

export interface ObligationItem {
  id: string;
  /** The event id plus the year of its deadline, so a projected year is a different item. */
  key: string;
  titleRo: string;
  start: string | null;
  end: string;
  daysLeft: number;
  /** Today is inside the window (start ≤ today ≤ end). */
  open: boolean;
  /** Projected from this year's dates to a later year. */
  estimated: boolean;
  unverified: boolean;
  status: Status;
  note: string | null;
  sourceUrl: string | null;
  authority: string;
  documentsRo: string[];
  howRo: string | null;
  report: string | null;
  period: string | null;
}

export interface ObligationRule {
  id: string;
  titleRo: string;
  days: number;
  note: string | null;
  sourceUrl: string | null;
  status: Status;
}

export interface ObligationsInput {
  calendar: CalendarFile;
  fuel: FuelExcise;
  today: string;
  hasFallow: boolean;
  /** How far ahead to list (days). */
  horizonDays: number;
}

/** Diesel events take what to bring and where from fuel-excise.json, so it's written once. */
function details(ev: CalendarEvent, fuel: FuelExcise): Pick<ObligationItem, 'documentsRo' | 'howRo' | 'authority'> {
  if (ev.report === 'fuel-excise') {
    return {
      documentsRo: ev.id === 'acciza-acord-prealabil' ? fuel.acord.documents_ro : fuel.claim_documents_ro,
      howRo: fuel.how_ro,
      authority: 'APIA',
    };
  }
  return { documentsRo: ev.documents_ro ?? [], howRo: ev.how_ro ?? null, authority: ev.authority ?? 'APIA' };
}

function itemsOf(ev: CalendarEvent, input: ObligationsInput): ObligationItem[] {
  if (!ev.end) return [];
  const out: ObligationItem[] = [];
  const until = addDays(input.today, input.horizonDays);
  for (let k = 0; ; k++) {
    const end = addYears(ev.end, k);
    if (end > until) break;
    const start = ev.start ? addYears(ev.start, k) : null;
    if (ev.repeat_until && (start ?? end) > ev.repeat_until) break;
    if (end < input.today) continue;
    out.push({
      id: ev.id,
      key: `${ev.id}:${end.slice(0, 4)}`,
      titleRo: ev.title_ro,
      start,
      end,
      daysLeft: daysBetween(input.today, end),
      open: !start || start <= input.today,
      estimated: k > 0,
      unverified: ev.status === 'DE-VERIFICAT',
      status: ev.status,
      note: ev.note ?? null,
      sourceUrl: ev.source_url,
      ...details(ev, input.fuel),
      report: ev.report ?? null,
      period: ev.period ?? null,
    });
  }
  return out;
}

const byEnd = (a: ObligationItem, b: ObligationItem) => a.end.localeCompare(b.end) || a.id.localeCompare(b.id);

/**
 * The obligations ahead, for this farm. `upcoming`: dated, sorted by deadline. `livestock`: only for
 * farms with animals, which the app doesn't record, so they're listed apart. `rules`: „within N days
 * of …” obligations, with no date of their own.
 */
export function upcomingObligations(input: ObligationsInput) {
  const events = input.calendar.events.filter((e) => e.obligation);
  const applies = (e: CalendarEvent) => !e.applies_to || e.applies_to === 'crops' || (e.applies_to === 'fallow' && input.hasFallow);
  return {
    upcoming: events.filter((e) => e.applies_to !== 'livestock' && applies(e)).flatMap((e) => itemsOf(e, input)).sort(byEnd),
    livestock: events.filter((e) => e.applies_to === 'livestock').flatMap((e) => itemsOf(e, input)).sort(byEnd),
    rules: events
      .filter((e) => !e.end && e.relative_days !== undefined)
      .map(
        (e): ObligationRule => ({
          id: e.id,
          titleRo: e.title_ro,
          days: e.relative_days!,
          note: e.note ?? null,
          sourceUrl: e.source_url,
          status: e.status,
        }),
      ),
  };
}

/** Deadlines close enough to show on Acasă: `days` or fewer away. */
export const dueSoon = (items: readonly ObligationItem[], days: number) => items.filter((i) => i.daysLeft <= days);

/**
 * The diesel quarter the farmer is collecting invoices for: today's quarter, its claim deadline, the
 * litres and refund so far, the expenses still missing litres, and how much of the yearly cap is used.
 */
export function fuelQuarterStatus(records: readonly ReportRecord[], fuel: FuelExcise, today: string, capCl: number | null) {
  const quarter: Period = currentPeriod('quarter', today);
  const year = periodOf('year', today.slice(0, 4));
  const inQuarter = records.filter((r) => inPeriod(r.date, quarter));
  const f = fuelLines(inQuarter, fuel);
  const yearCl = fuelLines(
    records.filter((r) => inPeriod(r.date, year)),
    fuel,
  ).litresCl;
  const claim = fuel.claims.find((c) => c.period === quarter.key) ?? null;
  const schemeEnded = today > fuel.scheme_end.value;
  const nextYear = +today.slice(0, 4) + 1;
  return {
    quarter,
    /** The claim for this quarter. Null: not in the file (the scheme may not run this quarter). */
    claim,
    litresCl: f.litresCl,
    refundBani: f.refundBani,
    missing: f.missing,
    noRate: f.noRate,
    rates: f.rates,
    unverified: f.unverified || (claim?.status ?? 'DE-VERIFICAT') === 'DE-VERIFICAT',
    yearLitresCl: yearCl,
    capCl,
    overCap: capCl !== null && yearCl > capCl,
    /** The scheme is past its last day: nothing to claim for new diesel. */
    schemeEnded,
    /** The acord for next year: null date = not announced. */
    nextAcord: fuel.acord.deadlines.find((d) => d.for_year === nextYear) ?? null,
  };
}
