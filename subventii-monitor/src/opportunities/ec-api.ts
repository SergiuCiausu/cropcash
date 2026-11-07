// The Commission's public Search API for the Funding & Tenders Portal.
import type { Draft } from './types.ts';

const ENDPOINT = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';
const API_KEY = 'SEDIA';
const SEARCH_TERMS = ['farmers', 'agriculture', 'livestock', 'rural'];
const PAGE_SIZE = 100;
const DELAY_MS = 2000;

// Status codes, read from the API's own results: forthcoming and open.
const QUERY = { bool: { must: [{ terms: { type: ['1', '2'] } }, { terms: { status: ['31094501', '31094502'] } }] } };

interface Metadata {
  identifier?: string[];
  title?: string[];
  status?: string[];
  startDate?: string[];
  deadlineDate?: string[];
  budgetOverview?: string[];
  url?: string[];
}

const day = (iso: string) => iso.slice(0, 10);

/** The EC's budget block lists a whole call. This finds the one topic's share. */
export function topicBudget(overview: string | undefined, identifier: string): number | null {
  if (!overview) return null;
  try {
    const parsed = JSON.parse(overview) as {
      budgetTopicActionMap?: Record<string, { action?: string; budgetYearMap?: Record<string, string> }[]>;
    };
    const actions = Object.values(parsed.budgetTopicActionMap ?? {}).flat()
      .filter((a) => a.action?.startsWith(`${identifier} `));
    if (actions.length === 0) return null;
    return actions.flatMap((a) => Object.values(a.budgetYearMap ?? {})).reduce((sum, n) => sum + Number(n), 0);
  } catch {
    return null;
  }
}

/** Expired calls can carry a live status, so the deadline decides. */
export function toDraft(metadata: Metadata, today: string): Draft | null {
  const identifier = metadata.identifier?.[0];
  const title = metadata.title?.[0];
  if (!identifier || !title) return null;
  const upcoming = (metadata.deadlineDate ?? []).map(day).filter((d) => d >= today).sort();
  const deadline = upcoming[0];
  if (!deadline) return null;

  const status = metadata.status?.[0] ?? '';
  return {
    stableKey: `ec:${identifier}`,
    kind: 'ec',
    programme: identifier.split('-')[0] ?? 'EU',
    title: title.trim(),
    sourceState: status === '31094501' ? 'forthcoming' : 'open',
    openDate: metadata.startDate?.[0] ? day(metadata.startDate[0]) : null,
    deadline,
    budgetEur: topicBudget(metadata.budgetOverview?.[0], identifier),
    applicants: null,
    region: 'UE',
    url: metadata.url?.[0] ?? `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${identifier}`,
    confidence: 'high',
    evidence: identifier,
  };
}

type FetchLike = typeof fetch;

/** Throws on any failure: an outage must never look like "no calls". */
export async function fetchEcCalls(
  userAgent: string,
  today: string,
  fetchImpl: FetchLike = fetch,
  delayMs: number = DELAY_MS,
): Promise<Draft[]> {
  const drafts = new Map<string, Draft>();
  for (const term of SEARCH_TERMS) {
    for (let page = 1; ; page++) {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      const form = new FormData();
      form.append('query', new Blob([JSON.stringify(QUERY)], { type: 'application/json' }));
      form.append('languages', new Blob(['["en"]'], { type: 'application/json' }));
      const url = `${ENDPOINT}?apiKey=${API_KEY}&text=${encodeURIComponent(term)}&pageSize=${PAGE_SIZE}&pageNumber=${page}`;

      const res = await fetchImpl(url, {
        method: 'POST',
        body: form,
        headers: { 'user-agent': userAgent },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`EC API returned ${res.status} for "${term}"`);
      const body = await res.json() as { results?: { metadata?: Metadata }[] };
      if (!Array.isArray(body.results)) throw new Error(`EC API sent no results list for "${term}"`);

      for (const result of body.results) {
        const draft = result.metadata ? toDraft(result.metadata, today) : null;
        if (draft) drafts.set(draft.stableKey, draft);
      }
      if (body.results.length < PAGE_SIZE) break;
    }
  }
  return [...drafts.values()];
}
