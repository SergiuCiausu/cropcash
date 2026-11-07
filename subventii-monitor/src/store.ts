// The database as the rest of the code sees it. detect.ts depends only on this,
// so the cascade can be tested without a Supabase project.
import type { RobotsCache } from './fetcher.ts';
import type { PageLink } from './links.ts';
import type { Opportunity, OpportunityEvent, OpportunityKind } from './opportunities/types.ts';
import type { SeedSource } from './seed.ts';

export type SourceState = 'new' | 'active' | 'needs_manual' | 'suspicious' | 'gone' | 'blocked' | 'error';

export type EventKind =
  | 'baseline' | 'changed' | 'gone' | 'returned' | 'blocked' | 'error' | 'suspicious' | 'needs_manual' | 'new_link';

export interface Source {
  id: number;
  url: string;
  title: string;
  institution: string;
  type: 'index' | 'pagina' | 'pdf';
  frequency: 'daily' | 'weekly';
  state: SourceState;
  etag: string | null;
  last_modified: string | null;
  content_length: string | null;
  content_hash: string | null;
  file_hash: string | null;
  text_chars: number | null;
  failure_count: number;
}

export type SourcePatch = Partial<Pick<Source,
  'state' | 'etag' | 'last_modified' | 'content_length' | 'content_hash' | 'file_hash' | 'text_chars' | 'failure_count'
>> & {
  resolved_url?: string | null;
  last_checked?: string;
  next_due?: string;
};

export interface NewSnapshot {
  sourceId: number;
  runId: number;
  httpStatus: number | null;
  contentHash: string;
  fileHash: string;
  text: string | null;
  diff: string | null;
}

export interface NewEvent {
  sourceId: number;
  runId: number;
  kind: EventKind;
  snapshotId?: number;
  detail?: string;
}

export interface KnownLink {
  url: string;
  versionKey: string | null;
}

/** A new link waiting to become a monitored source. */
export interface PendingLink {
  id: number;
  indexSourceId: number;
  url: string;
  text: string;
  isDocument: boolean;
}

/** An event with what the report needs to show it. */
export interface RunEvent {
  kind: EventKind;
  detail: string | null;
  title: string;
  url: string;
  institution: string;
  diff: string | null;
}

export interface RunStats {
  id: number;
  started: string;
  checked: number;
  requests: number;
  bytes: number;
  errors: string[];
}

export interface FinishedRun {
  requests: number;
  bytes: number;
  stops: Record<string, number>;
  errors: string[];
}

export interface Store {
  upsertSources(sources: SeedSource[]): Promise<void>;
  countSources(): Promise<number>;
  dueSources(now: Date): Promise<Source[]>;
  updateSource(id: number, patch: SourcePatch): Promise<void>;
  saveSnapshot(snapshot: NewSnapshot): Promise<number>;
  latestText(sourceId: number): Promise<string | null>;
  addEvent(event: NewEvent): Promise<void>;
  knownLinks(indexSourceId: number): Promise<KnownLink[]>;
  addLinks(indexSourceId: number, links: PageLink[], isBaseline: boolean): Promise<void>;
  pendingLinks(limit: number): Promise<PendingLink[]>;
  pendingLinkCount(): Promise<number>;
  /** Starts monitoring a link. Harmless if the URL is already a source. */
  addDiscoveredSource(link: PendingLink): Promise<void>;
  runEvents(runId: number): Promise<RunEvent[]>;
  runStats(runId?: number): Promise<RunStats | null>;
  startRun(kind: string): Promise<number>;
  finishRun(id: number, stats: FinishedRun): Promise<void>;
  /** All stored opportunities, or one kind's. */
  opportunities(kind?: OpportunityKind): Promise<Opportunity[]>;
  saveOpportunities(rows: Opportunity[], runId: number, events: OpportunityEvent[]): Promise<void>;
  runOpportunityEvents(runId: number): Promise<OpportunityEvent[]>;
  robotsCache(): RobotsCache;
}
