import type { RobotsCache, RobotsCacheEntry } from '../src/fetcher.ts';
import type { SeedSource } from '../src/seed.ts';
import { PROBLEM_STATES } from '../src/store.ts';
import type { PageLink } from '../src/links.ts';
import type { Opportunity, OpportunityEvent, OpportunityKind } from '../src/opportunities/types.ts';
import type {
  FinishedRun, KnownLink, NewEvent, NewSnapshot, PendingLink, ProblemSource, ProblemState, RunEvent, RunStats, Source,
  SourcePatch, Store,
} from '../src/store.ts';

/** A plain in-memory Store, for testing the cascade without Supabase. */
export class MemoryStore implements Store {
  sources: (Source & SourcePatch)[] = [];
  snapshots: (NewSnapshot & { id: number })[] = [];
  events: NewEvent[] = [];
  runs: ({ id: number } & Partial<FinishedRun>)[] = [];
  saved = new Map<string, Opportunity>();
  opportunityEvents: (OpportunityEvent & { runId: number })[] = [];
  links: (PageLink & { id: number; indexSourceId: number; isBaseline: boolean; added: boolean })[] = [];
  private robots = new Map<string, RobotsCacheEntry>();

  add(url: string, type: Source['type'] = 'pagina'): Source {
    const source: Source = {
      id: this.sources.length + 1, url, title: url, institution: 'TEST', type, frequency: 'daily', state: 'new',
      etag: null, last_modified: null, content_length: null, content_hash: null, file_hash: null,
      text_chars: null, failure_count: 0,
    };
    this.sources.push(source);
    return source;
  }

  get(id: number): Source & SourcePatch {
    return this.sources.find((s) => s.id === id)!;
  }

  kinds(): string[] {
    return this.events.map((e) => e.kind);
  }

  async upsertSources(_: SeedSource[]): Promise<void> {}
  async countSources(): Promise<number> {
    return this.sources.length;
  }
  async dueSources(now: Date): Promise<Source[]> {
    return this.sources.filter((s) => !s.next_due || Date.parse(s.next_due) <= now.getTime());
  }
  async updateSource(id: number, patch: SourcePatch): Promise<void> {
    Object.assign(this.get(id), patch);
  }
  async saveSnapshot(s: NewSnapshot): Promise<number> {
    const id = this.snapshots.length + 1;
    this.snapshots.push({ ...s, id });
    return id;
  }
  async latestText(sourceId: number): Promise<string | null> {
    return this.snapshots.filter((s) => s.sourceId === sourceId).at(-1)?.text ?? null;
  }
  async addEvent(e: NewEvent): Promise<void> {
    this.events.push(e);
  }
  async knownLinks(indexSourceId: number): Promise<KnownLink[]> {
    return this.links.filter((l) => l.indexSourceId === indexSourceId).map(({ url, versionKey }) => ({ url, versionKey }));
  }
  async addLinks(indexSourceId: number, links: PageLink[], isBaseline: boolean): Promise<void> {
    for (const l of links) {
      this.links.push({ ...l, id: this.links.length + 1, indexSourceId, isBaseline, added: false });
    }
  }
  private pending() {
    return this.links.filter((l) => !l.isBaseline && !l.added).sort((a, b) => b.score - a.score);
  }
  async pendingLinks(limit: number): Promise<PendingLink[]> {
    return this.pending().slice(0, limit);
  }
  async pendingLinkCount(): Promise<number> {
    return this.pending().length;
  }
  async addDiscoveredSource(link: PendingLink): Promise<void> {
    if (!this.sources.some((s) => s.url === link.url)) {
      const parent = this.get(link.indexSourceId);
      Object.assign(this.add(link.url, link.isDocument ? 'pdf' : 'pagina'), {
        title: link.text || link.url, institution: parent.institution, frequency: parent.frequency,
      });
    }
    this.links.find((l) => l.id === link.id)!.added = true;
  }
  async problemSources(): Promise<ProblemSource[]> {
    return this.sources.flatMap((s) => {
      const state = PROBLEM_STATES.find((p) => p === s.state);
      if (!state) return [];
      const event = this.events.filter((e) => e.sourceId === s.id && e.kind === state).at(-1);
      return [{
        institution: s.institution, title: s.title, url: s.url, state,
        failureCount: s.failure_count ?? 0, reason: event?.detail ?? null,
      }];
    });
  }
  async runEvents(runId: number): Promise<RunEvent[]> {
    return this.events.filter((e) => e.runId === runId).map((e) => {
      const s = this.get(e.sourceId);
      return {
        kind: e.kind, detail: e.detail ?? null, title: s.title, url: s.url, institution: s.institution,
        diff: this.snapshots.find((x) => x.id === e.snapshotId)?.diff ?? null,
      };
    });
  }
  async runStats(runId?: number): Promise<RunStats | null> {
    const run = runId === undefined ? this.runs.at(-1) : this.runs.find((r) => r.id === runId);
    if (!run) return null;
    return {
      id: run.id, started: '2026-11-07T10:00:00.000Z', requests: run.requests ?? 0, bytes: run.bytes ?? 0,
      checked: Object.values(run.stops ?? {}).reduce((sum, n) => sum + n, 0),
      errors: run.errors ?? [],
    };
  }
  async startRun(): Promise<number> {
    const id = this.runs.length + 1;
    this.runs.push({ id });
    return id;
  }
  async finishRun(id: number, stats: FinishedRun): Promise<void> {
    Object.assign(this.runs.find((r) => r.id === id)!, stats);
  }
  async opportunities(kind?: OpportunityKind): Promise<Opportunity[]> {
    return [...this.saved.values()].filter((o) => !kind || o.kind === kind);
  }
  async saveOpportunities(rows: Opportunity[], runId: number, events: OpportunityEvent[]): Promise<void> {
    for (const row of rows) this.saved.set(row.stableKey, row);
    this.opportunityEvents.push(...events.map((e) => ({ ...e, runId })));
  }
  async runOpportunityEvents(runId: number): Promise<OpportunityEvent[]> {
    return this.opportunityEvents.filter((e) => e.runId === runId);
  }
  robotsCache(): RobotsCache {
    return {
      get: async (origin) => this.robots.get(origin),
      set: async (origin, entry) => void this.robots.set(origin, entry),
    };
  }
}
