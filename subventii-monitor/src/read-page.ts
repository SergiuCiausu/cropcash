// Reads one page or PDF that a farmer added. It follows no links on the page and writes
// nothing shared, so a farmer's source never reaches the official list or the app's search.
import * as cheerio from 'cheerio';
import { MIN_TEXT_CHARS, decodeHtml, extractHtml, isChallengePage } from './extract/html.ts';
import { extractPdf, isPdf } from './extract/pdf.ts';
import { Fetcher, type FetchResult } from './fetcher.ts';
import { PRIVATE_ADDRESS, guardedFetch } from './guarded-fetch.ts';
import { normalize, sha256 } from './normalize.ts';

export { cleanSourceUrl } from './guarded-fetch.ts';

const MAX_TITLE_CHARS = 200;

export type PageState = 'ok' | 'thin' | 'blocked' | 'gone' | 'error';

export type PageRead =
  | { state: 'refused'; reason: 'private' | 'unsupported' | 'too_large'; url: string }
  | { state: 'blocked' | 'gone' | 'error'; url: string }
  | { state: 'ok' | 'thin'; url: string; finalUrl: string; kind: 'pagina' | 'pdf'; title: string | null; text: string; hash: string };

export interface PageLimits {
  maxBytes: number;
  timeoutMs: number;
  retries: number;
  /** How long one read may take in all, waiting for the site's turn included. */
  deadlineMs: number;
}

export interface ReaderOptions extends PageLimits {
  userAgent: string;
  ca?: string;
  /** Replaced in tests. */
  fetchFn?: typeof fetch;
}

export type PageReader = (url: string) => Promise<PageRead>;

export interface PageFields {
  state: PageState;
  checked_at: string;
  next_due: string;
  failure_count: number;
  final_url?: string;
  kind?: 'pagina' | 'pdf';
  title?: string | null;
  preview?: string;
  text?: string;
  content_hash?: string;
}

/** A row in watched_pages, as it stands right after the first read. */
export type NewPage = PageFields & { url: string };

export interface TextLimits {
  previewChars: number;
  textChars: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a finished read says about a page. A failed read carries no text. */
export function pageFields(read: PageRead, { previewChars, textChars }: TextLimits, now: Date): PageFields {
  const times = { checked_at: now.toISOString(), next_due: new Date(now.getTime() + DAY_MS).toISOString() };
  // Only the daily check meets this: a page that grew past the limit, or that now points inside.
  if (read.state === 'refused') return { ...times, state: 'error', failure_count: 1 };
  if (read.state !== 'ok' && read.state !== 'thin') return { ...times, state: read.state, failure_count: 1 };
  return {
    ...times,
    state: read.state,
    failure_count: 0,
    final_url: read.finalUrl,
    kind: read.kind,
    title: read.title,
    preview: read.text.slice(0, previewChars),
    text: read.text.slice(0, textChars),
    content_hash: read.hash,
  };
}

const BLOCKED = new Set<FetchResult['outcome']>(['blocked_robots', 'forbidden']);

export async function fromResult(url: string, r: FetchResult): Promise<PageRead> {
  if (r.note?.includes(PRIVATE_ADDRESS)) return { state: 'refused', reason: 'private', url };
  if (r.outcome === 'too_large') return { state: 'refused', reason: 'too_large', url };
  if (BLOCKED.has(r.outcome)) return { state: 'blocked', url };
  if (r.outcome === 'not_found') return { state: 'gone', url };
  if (r.outcome !== 'ok' || !r.body) return { state: 'error', url };

  const finalUrl = r.finalUrl ?? url;
  if (isPdf(r.body)) {
    const text = normalize(await extractPdf(r.body));
    // A scanned PDF has no text, so its bytes are what can change.
    return { state: text ? 'ok' : 'thin', url, finalUrl, kind: 'pdf', title: null, text, hash: sha256(text || r.body) };
  }
  if (!/html/i.test(r.contentType ?? '')) return { state: 'refused', reason: 'unsupported', url };

  const html = decodeHtml(r.body, r.contentType);
  const text = normalize((await extractHtml(html, finalUrl)).text);
  if (isChallengePage(text)) return { state: 'blocked', url };
  const title = normalize(cheerio.load(html)('title').first().text()).slice(0, MAX_TITLE_CHARS) || null;
  return { state: text.length >= MIN_TEXT_CHARS ? 'ok' : 'thin', url, finalUrl, kind: 'pagina', title, text, hash: sha256(text) };
}

/** One reader per process, so pacing and robots rules hold across reads. */
export function pageReader({ userAgent, ca, fetchFn, maxBytes, timeoutMs, retries, deadlineMs }: ReaderOptions): PageReader {
  const fetcher = new Fetcher({
    userAgent, maxBytes, timeoutMs, bodyTimeoutMs: timeoutMs, retries, fetchFn: fetchFn ?? guardedFetch(ca),
  });
  return async (url) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<PageRead>((resolve) => {
      timer = setTimeout(() => resolve({ state: 'error', url }), deadlineMs);
    });
    try {
      return await Promise.race([fetcher.get(url).then((r) => fromResult(url, r)), late]);
    } catch {
      return { state: 'error', url };
    } finally {
      clearTimeout(timer);
    }
  };
}
