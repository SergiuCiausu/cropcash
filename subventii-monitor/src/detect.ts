// The change-detection cascade. Each source stops at the first step that gives
// an answer, so most checks never download or store anything.
import { createPatch } from 'diff';
import { MIN_TEXT_CHARS, decodeHtml, extractHtml, isChallengePage } from './extract/html.ts';
import { extractPdf, isPdf } from './extract/pdf.ts';
import { validatorsMatch, type FetchResult, type Fetcher, type Validators } from './fetcher.ts';
import { extractLinks, type PageLink } from './links.ts';
import { normalize, sha256 } from './normalize.ts';
import { syncOpportunities } from './opportunities/sync.ts';
import type { Draft } from './opportunities/types.ts';
import type { EventKind, Source, SourcePatch, SourceState, Store } from './store.ts';

export type Stop =
  | 'headers'        // HEAD showed the document is unchanged
  | 'not_modified'   // 304, or the same validators on a 200
  | 'same_text'      // downloaded, but the useful content is identical
  | 'baseline'       // first visit
  | 'changed'
  | 'suspicious'
  | 'gone'
  | 'blocked'
  | 'error';

export interface CheckContext {
  store: Store;
  fetcher: Fetcher;
  runId: number;
  now: Date;
}

const SUSPICIOUS_SHRINK = 0.2;
const DIFF_TIMEOUT_MS = 10_000;
const MAX_LINK_EVENTS = 50; // Protects the report if a site is redesigned.

/** Due at midnight UTC, so a daily run is never skipped for starting earlier. */
export function nextDue(frequency: Source['frequency'], now: Date): string {
  const days = frequency === 'weekly' ? 7 : 1;
  const due = new Date(now);
  due.setUTCHours(0, 0, 0, 0);
  due.setUTCDate(due.getUTCDate() + days);
  return due.toISOString();
}

interface Extracted {
  text: string;
  hasText: boolean;
  /** True when a short result means something went wrong. */
  thinIsBad: boolean;
  links: PageLink[];
  drafts: Draft[];
  parserFailed: boolean;
}

async function extract(body: Uint8Array, res: FetchResult, source: Source): Promise<Extracted> {
  if (isPdf(body)) {
    const text = normalize(await extractPdf(body));
    return { text, hasText: text.length > 0, thinIsBad: false, links: [], drafts: [], parserFailed: false };
  }
  if (res.contentType?.includes('html') || res.contentType === null) {
    const decoded = decodeHtml(body, res.contentType);
    const html = await extractHtml(decoded, source.url);
    const text = normalize(html.text);
    return {
      text,
      hasText: text.length > 0,
      thinIsBad: !html.fromSelector,
      links: source.type === 'index' ? extractLinks(decoded, source.url) : [],
      drafts: html.drafts,
      parserFailed: html.parserFailed,
    };
  }
  return { text: '', hasText: false, thinIsBad: false, links: [], drafts: [], parserFailed: false }; // DOC, XLS and other files.
}

function makeDiff(title: string, before: string | null, after: string): string | null {
  if (!before) return null;
  try {
    return createPatch(title, before, after, undefined, undefined, { context: 2, timeout: DIFF_TIMEOUT_MS }) ?? null;
  } catch {
    return null;
  }
}

export async function checkSource(source: Source, ctx: CheckContext): Promise<Stop> {
  const { store, fetcher, runId, now } = ctx;
  const emit = (kind: EventKind, detail?: string, snapshotId?: number) =>
    store.addEvent({ sourceId: source.id, runId, kind, detail, snapshotId });

  const seen: SourcePatch = {
    last_checked: now.toISOString(),
    next_due: nextDue(source.frequency, now),
    failure_count: 0,
  };

  /** A source in a failed state that answers normally again is worth reporting. */
  const recovered = async (): Promise<SourceState> => {
    if (['gone', 'blocked', 'error', 'suspicious'].includes(source.state)) {
      await emit('returned', `was ${source.state}`);
    }
    return 'active';
  };

  const failed = async (res: FetchResult): Promise<Stop> => {
    const detail = res.note ?? `HTTP ${res.httpStatus}`;
    const lastChecked = { last_checked: now.toISOString() };
    if (res.outcome === 'not_found' || res.outcome === 'blocked_robots') {
      const state = res.outcome === 'not_found' ? 'gone' : 'blocked';
      if (source.state !== state) await emit(state, detail);
      await store.updateSource(source.id, { ...lastChecked, state, next_due: nextDue(source.frequency, now) });
      return state;
    }
    // Temporary failures keep next_due, so the next run tries again.
    if (source.state !== 'error') await emit('error', `${res.outcome}: ${detail}`);
    await store.updateSource(source.id, { ...lastChecked, state: 'error', failure_count: source.failure_count + 1 });
    return 'error';
  };

  const hasBaseline = source.content_hash !== null;
  const previous: Validators | undefined = hasBaseline
    ? { etag: source.etag, lastModified: source.last_modified, contentLength: source.content_length }
    : undefined;

  if (previous && source.type === 'pdf') {
    const head = await fetcher.head(source.url);
    if (head.outcome === 'ok' && validatorsMatch(previous, head)) {
      await store.updateSource(source.id, { ...seen, state: await recovered(), resolved_url: head.finalUrl });
      return 'headers';
    }
  }

  const res = await fetcher.get(source.url, previous);
  if (res.outcome === 'not_modified') {
    await store.updateSource(source.id, { ...seen, state: await recovered(), resolved_url: res.finalUrl });
    return 'not_modified';
  }
  if (res.outcome !== 'ok' || !res.body) return failed(res);

  const { text, hasText, thinIsBad, links, drafts, parserFailed } = await extract(res.body, res, source);
  if (isChallengePage(text)) {
    return failed({ ...res, outcome: 'blocked_robots', note: 'the site answered with a CAPTCHA page' });
  }
  const fileHash = sha256(res.body);
  // Files without text can only be compared byte for byte.
  const contentHash = hasText ? sha256(text) : fileHash;
  const thin = thinIsBad && text.length < MIN_TEXT_CHARS;

  const current: SourcePatch = {
    ...seen,
    resolved_url: res.finalUrl,
    etag: res.etag,
    last_modified: res.lastModified,
    content_length: res.contentLength,
    content_hash: contentHash,
    file_hash: fileHash,
    text_chars: text.length,
  };
  const snapshot = (diff: string | null) => store.saveSnapshot({
    sourceId: source.id,
    runId,
    httpStatus: res.httpStatus,
    contentHash,
    fileHash,
    text: hasText ? text : null,
    diff,
  });

  /** Links on a page's first visit are remembered, not reported. */
  const syncLinks = async (): Promise<void> => {
    if (links.length === 0) return;
    const known = await store.knownLinks(source.id);
    const seen = new Set(known.map((k) => k.url));
    const fresh = links.filter((l) => !seen.has(l.url)).sort((a, b) => b.score - a.score);
    if (fresh.length === 0) return;

    const isBaseline = !hasBaseline || known.length === 0;
    if (!isBaseline) {
      for (const link of fresh.slice(0, MAX_LINK_EVENTS)) {
        const previous = link.versionKey ? known.find((k) => k.versionKey === link.versionKey) : undefined;
        const { url, text: linkText, score, isDocument } = link;
        await emit('new_link', JSON.stringify({ url, text: linkText, score, isDocument, versionOf: previous?.url ?? null }));
      }
    }
    await store.addLinks(source.id, fresh, isBaseline);
  };

  /** Runs only when content changed, and before the source row is updated. */
  const syncContent = async (): Promise<void> => {
    await syncLinks();
    if (drafts[0]) await syncOpportunities(store, drafts[0].kind, drafts, runId, now.toISOString().slice(0, 10));
    if (parserFailed) await emit('needs_manual', 'the page parser found nothing; its layout may have changed');
  };

  // The source row is updated last. If a run dies midway, the next run finds
  // the same change again, which can repeat an event but can't lose one.
  if (!hasBaseline) {
    const id = await snapshot(null);
    await emit('baseline', hasText ? undefined : 'no extractable text; compared by file hash', id);
    if (thin) await emit('needs_manual', `only ${text.length} characters of text`);
    await syncContent();
    await store.updateSource(source.id, { ...current, state: thin ? 'needs_manual' : 'active' });
    return 'baseline';
  }

  if (contentHash === source.content_hash) {
    await syncLinks();
    await store.updateSource(source.id, { ...current, state: await recovered() });
    return 'same_text';
  }

  const before = source.text_chars ?? 0;
  // A parsed list legitimately shrinks as calls end, and a page whose parser
  // failed has no drafts, so this guard is only for free text.
  if (before > 0 && text.length < before * SUSPICIOUS_SHRINK && drafts.length === 0) {
    // Validators stay as they are, so this is judged again on the next run.
    if (source.state !== 'suspicious') {
      await emit('suspicious', `text fell from ${before} to ${text.length} characters`);
    }
    await store.updateSource(source.id, { ...seen, state: 'suspicious' });
    return 'suspicious';
  }

  const previousText = hasText ? await store.latestText(source.id) : null;
  const diff = hasText ? makeDiff(source.title, previousText, text) : null;
  const id = await snapshot(diff);
  await emit('changed', diff ? undefined : 'no text diff available', id);
  await syncContent();
  await store.updateSource(source.id, { ...current, state: 'active' });
  return 'changed';
}
