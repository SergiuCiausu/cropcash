import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RobotsCache } from './fetcher.ts';
import type { PageLink } from './links.ts';
import type { Opportunity, OpportunityEvent, OpportunityKind } from './opportunities/types.ts';
import type { SeedSource } from './seed.ts';
import type {
  FinishedRun, KnownLink, NewEvent, NewSnapshot, PendingLink, RunEvent, RunStats, Source, SourcePatch, Store,
} from './store.ts';

const BUCKET = 'snapshots';
const PAGE_SIZE = 1000; // Supabase returns at most this many rows per request.
const WRITE_BATCH = 500;

interface OpportunityRow {
  stable_key: string;
  kind: Opportunity['kind'];
  programme: string;
  title: string;
  status: Opportunity['status'];
  source_state: string | null;
  open_date: string | null;
  deadline: string | null;
  budget_eur: number | null;
  applicants: string | null;
  region: string | null;
  url: string;
  relevance: Opportunity['relevance'];
  relevance_note: string | null;
  confidence: Opportunity['confidence'];
  evidence: string | null;
}

function fromRow(r: OpportunityRow): Opportunity {
  return {
    stableKey: r.stable_key,
    kind: r.kind,
    programme: r.programme,
    title: r.title,
    status: r.status,
    sourceState: r.source_state,
    openDate: r.open_date,
    deadline: r.deadline,
    budgetEur: r.budget_eur === null ? null : Number(r.budget_eur),
    applicants: r.applicants,
    region: r.region,
    url: r.url,
    relevance: r.relevance,
    relevanceNote: r.relevance_note,
    confidence: r.confidence,
    evidence: r.evidence ?? '',
  };
}

function toRow(o: Opportunity): OpportunityRow {
  return {
    stable_key: o.stableKey,
    kind: o.kind,
    programme: o.programme,
    title: o.title,
    status: o.status,
    source_state: o.sourceState,
    open_date: o.openDate,
    deadline: o.deadline,
    budget_eur: o.budgetEur,
    applicants: o.applicants,
    region: o.region,
    url: o.url,
    relevance: o.relevance,
    relevance_note: o.relevanceNote,
    confidence: o.confidence,
    evidence: o.evidence,
  };
}

function check<T>(result: { data: T; error: { message: string } | null }, action: string): T {
  if (result.error) throw new Error(`Supabase: ${action}: ${result.error.message}`);
  return result.data;
}

export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(url: string, secretKey: string) {
    this.db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async upsertSources(sources: SeedSource[]): Promise<void> {
    const rows = sources.map((s) => ({
      url: s.url,
      institution: s.institution,
      title: s.title,
      type: s.type,
      frequency: s.frequency,
      verified_in_spec: s.verified,
    }));
    check(await this.db.from('sources').upsert(rows, { onConflict: 'url' }), 'seed sources');
  }

  async countSources(): Promise<number> {
    const r = await this.db.from('sources').select('id', { count: 'exact', head: true });
    check(r, 'count sources');
    return r.count ?? 0;
  }

  async dueSources(now: Date): Promise<Source[]> {
    const all: Source[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const page = check(
        await this.db.from('sources').select('*').lte('next_due', now.toISOString())
          .order('id').range(from, from + PAGE_SIZE - 1),
        'read due sources',
      ) as Source[];
      all.push(...page);
      if (page.length < PAGE_SIZE) return all;
    }
  }

  async updateSource(id: number, patch: SourcePatch): Promise<void> {
    check(await this.db.from('sources').update(patch).eq('id', id), 'update source');
  }

  private async upload(path: string, content: string): Promise<void> {
    check(
      await this.db.storage.from(BUCKET).upload(path, content, {
        contentType: 'text/plain;charset=utf-8',
        upsert: true,
      }),
      `upload ${path}`,
    );
  }

  async saveSnapshot(s: NewSnapshot): Promise<number> {
    const stem = `${s.sourceId}/${new Date().toISOString().slice(0, 10)}-${s.contentHash.slice(0, 12)}`;
    const textPath = s.text === null ? null : `${stem}.txt`;
    const diffPath = s.diff === null ? null : `${stem}.diff`;
    // Upload first, so a saved row never points at a missing file.
    if (textPath && s.text !== null) await this.upload(textPath, s.text);
    if (diffPath && s.diff !== null) await this.upload(diffPath, s.diff);

    const row = check(
      await this.db.from('snapshots').insert({
        source_id: s.sourceId,
        run_id: s.runId,
        http_status: s.httpStatus,
        content_hash: s.contentHash,
        file_hash: s.fileHash,
        text_path: textPath,
        diff_path: diffPath,
      }).select('id').single(),
      'insert snapshot',
    ) as { id: number };
    return row.id;
  }

  async latestText(sourceId: number): Promise<string | null> {
    const rows = check(
      await this.db.from('snapshots').select('text_path').eq('source_id', sourceId)
        .order('taken_at', { ascending: false }).limit(1),
      'read latest snapshot',
    ) as { text_path: string | null }[];
    const path = rows[0]?.text_path;
    if (!path) return null;
    const blob = check(await this.db.storage.from(BUCKET).download(path), `download ${path}`);
    return blob ? blob.text() : null;
  }

  async addEvent(e: NewEvent): Promise<void> {
    check(
      await this.db.from('change_events').insert({
        source_id: e.sourceId,
        run_id: e.runId,
        kind: e.kind,
        snapshot_id: e.snapshotId ?? null,
        detail: e.detail ?? null,
      }),
      'insert event',
    );
  }

  async knownLinks(indexSourceId: number): Promise<KnownLink[]> {
    const all: KnownLink[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const page = check(
        await this.db.from('links_seen').select('url, version_key').eq('index_source_id', indexSourceId)
          .order('id').range(from, from + PAGE_SIZE - 1),
        'read known links',
      ) as { url: string; version_key: string | null }[];
      all.push(...page.map((l) => ({ url: l.url, versionKey: l.version_key })));
      if (page.length < PAGE_SIZE) return all;
    }
  }

  async addLinks(indexSourceId: number, links: PageLink[], isBaseline: boolean): Promise<void> {
    const rows = links.map((l) => ({
      index_source_id: indexSourceId,
      url: l.url,
      link_text: l.text,
      score: l.score,
      is_document: l.isDocument,
      version_key: l.versionKey,
      is_baseline: isBaseline,
    }));
    check(
      await this.db.from('links_seen').upsert(rows, { onConflict: 'index_source_id,url', ignoreDuplicates: true }),
      'save links',
    );
  }

  async pendingLinks(limit: number): Promise<PendingLink[]> {
    const rows = check(
      await this.db.from('links_seen').select('*').eq('is_baseline', false).eq('source_added', false)
        .order('score', { ascending: false }).order('id').limit(limit),
      'read pending links',
    ) as { id: number; index_source_id: number; url: string; link_text: string | null; is_document: boolean }[];
    return rows.map((r) => ({
      id: r.id,
      indexSourceId: r.index_source_id,
      url: r.url,
      text: r.link_text ?? '',
      isDocument: r.is_document,
    }));
  }

  async pendingLinkCount(): Promise<number> {
    const r = await this.db.from('links_seen').select('id', { count: 'exact', head: true })
      .eq('is_baseline', false).eq('source_added', false);
    check(r, 'count pending links');
    return r.count ?? 0;
  }

  async addDiscoveredSource(link: PendingLink): Promise<void> {
    const parent = check(
      await this.db.from('sources').select('institution, frequency').eq('id', link.indexSourceId).single(),
      'read parent source',
    ) as { institution: string; frequency: string };
    check(
      await this.db.from('sources').upsert({
        url: link.url,
        title: link.text || link.url,
        institution: parent.institution,
        frequency: parent.frequency,
        type: link.isDocument ? 'pdf' : 'pagina',
        discovered_from: link.indexSourceId,
      }, { onConflict: 'url', ignoreDuplicates: true }),
      'add discovered source',
    );
    check(await this.db.from('links_seen').update({ source_added: true }).eq('id', link.id), 'mark link added');
  }

  async runEvents(runId: number): Promise<RunEvent[]> {
    const rows = check(
      await this.db.from('change_events')
        .select('kind, detail, sources (title, url, institution), snapshots (diff_path)')
        .eq('run_id', runId).order('id'),
      'read run events',
    ) as unknown as {
      kind: RunEvent['kind'];
      detail: string | null;
      sources: { title: string; url: string; institution: string };
      snapshots: { diff_path: string | null } | null;
    }[];

    const events: RunEvent[] = [];
    for (const row of rows) {
      const path = row.snapshots?.diff_path;
      const blob = path ? check(await this.db.storage.from(BUCKET).download(path), `download ${path}`) : null;
      events.push({ kind: row.kind, detail: row.detail, ...row.sources, diff: blob ? await blob.text() : null });
    }
    return events;
  }

  async runStats(runId?: number): Promise<RunStats | null> {
    const query = this.db.from('runs').select('*');
    const rows = check(
      await (runId === undefined ? query.not('finished', 'is', null).order('id', { ascending: false }).limit(1) : query.eq('id', runId)),
      'read run',
    ) as { id: number; started: string; requests: number; bytes: number; stops: Record<string, number>; errors: string[] }[];
    const run = rows[0];
    if (!run) return null;
    const checked = Object.values(run.stops).reduce((sum, n) => sum + n, 0);
    return { id: run.id, started: run.started, checked, requests: run.requests, bytes: run.bytes, errors: run.errors };
  }

  async startRun(kind: string): Promise<number> {
    const row = check(
      await this.db.from('runs').insert({ kind }).select('id').single(),
      'start run',
    ) as { id: number };
    return row.id;
  }

  async opportunities(kind?: OpportunityKind): Promise<Opportunity[]> {
    const all: Opportunity[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const query = this.db.from('opportunities').select('*');
      const page = check(
        await (kind ? query.eq('kind', kind) : query).order('id').range(from, from + PAGE_SIZE - 1),
        'read opportunities',
      ) as OpportunityRow[];
      all.push(...page.map(fromRow));
      if (page.length < PAGE_SIZE) return all;
    }
  }

  async saveOpportunities(rows: Opportunity[], runId: number, events: OpportunityEvent[]): Promise<void> {
    const ids = new Map<string, number>();
    for (let i = 0; i < rows.length; i += WRITE_BATCH) {
      const saved = check(
        await this.db.from('opportunities').upsert(rows.slice(i, i + WRITE_BATCH).map(toRow), { onConflict: 'stable_key' })
          .select('id, stable_key'),
        'save opportunities',
      ) as { id: number; stable_key: string }[];
      for (const row of saved) ids.set(row.stable_key, row.id);
    }

    const history = events.flatMap((e) => {
      const id = ids.get(e.stableKey);
      return id === undefined ? [] : [{
        opportunity_id: id, run_id: runId, field: e.field, old_value: e.oldValue, new_value: e.newValue,
      }];
    });
    for (let i = 0; i < history.length; i += WRITE_BATCH) {
      check(await this.db.from('opportunity_events').insert(history.slice(i, i + WRITE_BATCH)), 'save opportunity events');
    }
  }

  async runOpportunityEvents(runId: number): Promise<OpportunityEvent[]> {
    const rows = check(
      await this.db.from('opportunity_events')
        .select('field, old_value, new_value, opportunities (stable_key)')
        .eq('run_id', runId).order('id'),
      'read opportunity events',
    ) as unknown as {
      field: string;
      old_value: string | null;
      new_value: string | null;
      opportunities: { stable_key: string };
    }[];
    return rows.map((r) => ({
      stableKey: r.opportunities.stable_key, field: r.field, oldValue: r.old_value, newValue: r.new_value,
    }));
  }

  async finishRun(id: number, stats: FinishedRun): Promise<void> {
    check(
      await this.db.from('runs').update({ ...stats, finished: new Date().toISOString() }).eq('id', id),
      'finish run',
    );
  }

  robotsCache(): RobotsCache {
    return {
      get: async (origin) => {
        const row = check(
          await this.db.from('robots_cache').select('*').eq('origin', origin).maybeSingle(),
          'read robots cache',
        ) as { fetched_at: string; http_status: number; body: string } | null;
        return row
          ? { fetchedAt: Date.parse(row.fetched_at), httpStatus: row.http_status, body: row.body }
          : undefined;
      },
      set: async (origin, e) => {
        check(
          await this.db.from('robots_cache').upsert({
            origin,
            fetched_at: new Date(e.fetchedAt).toISOString(),
            http_status: e.httpStatus,
            body: e.body,
          }),
          'write robots cache',
        );
      },
    };
  }
}
