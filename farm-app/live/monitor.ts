import type { AppData } from '../../packages/shared/src/data/index';
import {
  matchOpportunityRows,
  type MatchLevel,
  type MatchReason,
  type OpportunityRow,
  type StoredOpportunity,
  type StoredSource,
} from '../../packages/shared/src/opportunities/index';

/**
 * Funding calls and official sources, shaped the way the pages already read them. The snapshot
 * files use the same shape, so a signed-out visitor and a signed-in farmer see the same page.
 */
export interface PageCall {
  key: string;
  kind: string;
  programme: string;
  title: string;
  status: string;
  openDate: string | null;
  deadline: string | null;
  budgetEur: number | null;
  applicants: string | null;
  region: string | null;
  url: string;
  relevance: string;
  note: string | null;
  confidence: string;
  /** Only in the snapshot: AFIR's count of applications filed. */
  filed?: number | null;
  filedEur?: number | null;
}

export const callsFromServer = (rows: OpportunityRow[]): PageCall[] =>
  rows.map((o) => ({
    key: o.key,
    kind: o.kind,
    programme: o.programme,
    title: o.title,
    status: o.status,
    openDate: o.openDate,
    deadline: o.deadline,
    budgetEur: o.budgetEurCents === null ? null : o.budgetEurCents / 100,
    applicants: o.applicants,
    region: o.region,
    url: o.url,
    relevance: o.relevance,
    note: o.relevanceNote,
    confidence: o.lowConfidence ? 'low' : 'high',
  }));

const storedCall = (c: PageCall): StoredOpportunity => ({
  stable_key: c.key,
  kind: c.kind,
  programme: c.programme,
  title: c.title,
  status: c.status as StoredOpportunity['status'],
  open_date: c.openDate,
  deadline: c.deadline,
  budget_eur: c.budgetEur,
  applicants: c.applicants,
  region: c.region,
  url: c.url,
  relevance: c.relevance,
  relevance_note: c.note,
  confidence: c.confidence,
  evidence: null,
});

export interface ServerCallEvent {
  key: string;
  title: string;
  kind: string;
  field: string;
  from: string | null;
  to: string | null;
  date: string;
  url: string;
}

export const eventsFromServer = (rows: ServerCallEvent[]) =>
  rows.map((e) => ({ key: e.key, field: e.field, title: e.title, kind: e.kind, url: e.url, oldValue: e.from, newValue: e.to, date: e.date }));

export const sourcesFromServer = (rows: StoredSource[]) =>
  rows.map((s) => ({ id: s.id, inst: s.institution, title: s.title, url: s.url, type: s.type, state: s.state, checked: s.last_checked?.slice(0, 10) ?? null }));
export type PageSource = ReturnType<typeof sourcesFromServer>[number];

const PROBLEMS = new Set(['needs_manual', 'error', 'blocked', 'gone']);
/** Sources the monitor can't read right now, as the "Probleme" tab lists them. */
export const problemsOf = (sources: PageSource[]) =>
  sources.filter((s) => PROBLEMS.has(s.state)).map((s) => ({ sourceId: s.id, kind: s.state, date: s.checked }));

export interface PageFarm {
  age: number;
  /** The county's name, as the pages show it, or its code. */
  county: string;
  parcels: { cropId: string }[];
}
export interface PageFit {
  level: MatchLevel;
  good: MatchReason[];
  doubts: MatchReason[];
}

/**
 * How each call fits this farm, with the same rules the API uses, so it works for any farm and
 * offline. A call missing from the result is closed or not for farmers at all.
 */
export function pageFits(calls: PageCall[], farm: PageFarm, data: AppData, today: string): Record<string, PageFit> {
  const county = data.counties.counties.find((c) => c.name_ro === farm.county || c.code === farm.county)?.code ?? null;
  const match = matchOpportunityRows(
    calls.map(storedCall),
    { birth_year: Number(today.slice(0, 4)) - farm.age, county, parcels: farm.parcels.map((p) => ({ crop_id: p.cropId })) },
    data,
    today,
  );
  const fits: Record<string, PageFit> = {};
  for (const m of [...match.forYou, ...match.check, ...match.notForYou]) fits[m.key] = { level: m.level, good: m.good, doubts: m.doubts };
  return fits;
}
