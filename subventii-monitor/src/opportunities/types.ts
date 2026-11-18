export type OpportunityKind = 'afir' | 'mipe' | 'ec';
export type OpportunityStatus = 'announced' | 'open' | 'closed' | 'unknown';
export type Relevance = 'direct' | 'conditional' | 'partnership' | 'not_relevant';

/** What a parser reads from a source. Dates are YYYY-MM-DD. */
export interface Draft {
  /** Identifies a call across runs, so an extended deadline isn't a new call. */
  stableKey: string;
  kind: OpportunityKind;
  programme: string;
  title: string;
  /** The source's own wording of its state, such as MIPE's IN_EDITARE. */
  sourceState: string | null;
  openDate: string | null;
  deadline: string | null;
  budgetEur: number | null;
  applicants: string | null;
  region: string | null;
  url: string;
  confidence: 'high' | 'low';
  /** The source text the values came from. */
  evidence: string;
}

export interface Opportunity extends Draft {
  status: OpportunityStatus;
  relevance: Relevance;
  relevanceNote: string | null;
}

export interface OpportunityEvent {
  stableKey: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

export type Parser = (html: string, url: string) => Draft[];

/** One comparable line per call. Used as the source's text, so diffs show calls. */
export function renderDraft(d: Draft): string {
  return [
    d.stableKey, d.title, d.sourceState ?? '-', `${d.openDate ?? '-'} / ${d.deadline ?? '-'}`,
    d.budgetEur === null ? '-' : `${d.budgetEur} EUR`, d.applicants ?? '-',
  ].join(' | ').replace(/\s+/g, ' ');
}

/** Days are compared as YYYY-MM-DD text, which sorts correctly. */
export function statusFor(openDate: string | null, deadline: string | null, today: string): OpportunityStatus {
  if (deadline && deadline < today) return 'closed';
  if (openDate && openDate > today) return 'announced';
  if (openDate || deadline) return 'open';
  return 'unknown';
}
