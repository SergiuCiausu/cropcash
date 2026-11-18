// Compares what a source says now with what is stored, and records the differences.
import type { Store } from '../store.ts';
import { classify } from './relevance.ts';
import { statusFor, type Draft, type Opportunity, type OpportunityEvent, type OpportunityKind } from './types.ts';

const TRACKED = ['deadline', 'openDate', 'budgetEur', 'title', 'sourceState'] as const;

const asText = (value: string | number | null): string | null => (value === null ? null : String(value));

function toOpportunity(draft: Draft, today: string): Opportunity {
  const { relevance, note } = classify(draft);
  return {
    ...draft,
    status: statusFor(draft.openDate, draft.deadline, today),
    relevance,
    relevanceNote: note,
  };
}

/**
 * `drafts` must be the source's complete list. A kind's first sync is a silent
 * baseline, like links, so the first report doesn't list every call as new.
 */
export async function syncOpportunities(
  store: Store,
  kind: OpportunityKind,
  drafts: Draft[],
  runId: number,
  today: string,
): Promise<void> {
  const existing = new Map((await store.opportunities(kind)).map((o) => [o.stableKey, o]));
  const isBaseline = existing.size === 0;
  const rows: Opportunity[] = [];
  const events: OpportunityEvent[] = [];

  for (const draft of drafts) {
    const next = toOpportunity(draft, today);
    const previous = existing.get(draft.stableKey);
    if (!previous) {
      if (next.status === 'closed') continue; // History the farmer can't act on.
      rows.push(next);
      if (!isBaseline) events.push({ stableKey: draft.stableKey, field: 'new', oldValue: null, newValue: draft.title });
      continue;
    }
    rows.push(next);
    for (const field of TRACKED) {
      if (asText(previous[field]) !== asText(next[field])) {
        events.push({ stableKey: draft.stableKey, field, oldValue: asText(previous[field]), newValue: asText(next[field]) });
      }
    }
  }

  // A call that left a complete list has ended, whatever its date said.
  const listed = new Set(drafts.map((d) => d.stableKey));
  for (const old of existing.values()) {
    if (old.status === 'closed' || listed.has(old.stableKey)) continue;
    rows.push({ ...old, status: 'closed' });
    events.push({ stableKey: old.stableKey, field: 'removed', oldValue: old.status, newValue: 'closed' });
  }

  await store.saveOpportunities(rows, runId, events);
}

/** Dates pass with no source changing, so statuses are refreshed on every run. */
export async function refreshStatuses(store: Store, runId: number, today: string): Promise<void> {
  const rows: Opportunity[] = [];
  const events: OpportunityEvent[] = [];
  for (const o of await store.opportunities()) {
    const status = statusFor(o.openDate, o.deadline, today);
    if (o.status === 'closed' || status === o.status) continue;
    rows.push({ ...o, status });
    events.push({ stableKey: o.stableKey, field: 'status', oldValue: o.status, newValue: status });
  }
  if (rows.length > 0) await store.saveOpportunities(rows, runId, events);
}
