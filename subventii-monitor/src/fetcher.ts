// Polite HTTP: robots rules, per-host pacing, retries, and manual redirects.
import PQueue from 'p-queue';
import robotsParser from 'robots-parser';
import type { Robot } from 'robots-parser';

export type Outcome =
  | 'ok'
  | 'not_modified'
  | 'not_found'
  | 'forbidden'
  | 'blocked_robots'
  | 'robots_unavailable'
  | 'server_error'
  | 'client_error'
  | 'timeout'
  | 'tls_error'
  | 'network_error'
  | 'too_many_redirects'
  | 'too_large';

export type RedirectKind = 'none' | 'minor' | 'moved' | 'to_homepage';

export interface Validators {
  etag: string | null;
  lastModified: string | null;
  contentLength: string | null;
}

export interface FetchResult extends Validators {
  url: string;
  outcome: Outcome;
  httpStatus: number | null;
  finalUrl: string | null;
  redirectKind: RedirectKind;
  hops: number;
  contentType: string | null;
  body: Uint8Array | null;
  note: string | null;
}

export interface RobotsCacheEntry {
  fetchedAt: number;
  httpStatus: number;
  body: string;
}

export interface RobotsCache {
  get(origin: string): Promise<RobotsCacheEntry | undefined>;
  set(origin: string, entry: RobotsCacheEntry): Promise<void>;
}

export interface FetcherOptions {
  userAgent: string;
  minDelayMs?: number;
  timeoutMs?: number;
  bodyTimeoutMs?: number;
  maxBytes?: number;
  retries?: number;
  backoffMs?: number;
  maxRedirects?: number;
  robotsCache?: RobotsCache;
}

// The package's types declare no default call, but its CommonJS export is the function.
const parseRobots = robotsParser as unknown as (url: string, contents: string) => Robot;

const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
const TLS_CODES = /CERT|TLS|SSL|SELF_SIGNED|LEAF_SIGNATURE|ISSUER/i;

type RobotsVerdict =
  | { kind: 'rules'; isAllowed: (url: string) => boolean }
  | { kind: 'denied'; reason: string }
  | { kind: 'unavailable'; reason: string };

type RawResponse =
  | { ok: true; res: Response }
  | { ok: false; outcome: Outcome; note: string };

function usable(value: string | null | undefined): string | null {
  return value && value !== '0' ? value : null;
}

/**
 * True only if a real validator (ETag or Last-Modified) matches and nothing
 * contradicts it. Length alone proves nothing, and 0 means unknown (the EC
 * sends that on HEAD). Values are compared exactly, never parsed as dates.
 */
export function validatorsMatch(stored: Validators, current: Validators): boolean {
  let confirmed = false;
  if (stored.etag && current.etag) {
    if (stored.etag !== current.etag) return false;
    confirmed = true;
  }
  if (stored.lastModified && current.lastModified) {
    if (stored.lastModified !== current.lastModified) return false;
    confirmed = true;
  }
  const a = usable(stored.contentLength);
  const b = usable(current.contentLength);
  if (a && b && a !== b) return false;
  return confirmed;
}

function canonical(u: string): string {
  const url = new URL(u);
  const host = url.hostname.replace(/^www\./, '');
  const pathname = url.pathname.replace(/\/+$/, '').toLowerCase();
  return `${host}${pathname}${url.search}`;
}

/** Tells a harmless http→https or www change from a page that really moved. */
export function classifyRedirect(from: string, to: string): RedirectKind {
  if (from === to) return 'none';
  if (canonical(from) === canonical(to)) return 'minor';
  const target = new URL(to);
  const source = new URL(from);
  if (target.pathname === '/' && !target.search && source.pathname !== '/') {
    return 'to_homepage';
  }
  return 'moved';
}

export function describeError(err: unknown): { outcome: Outcome; note: string } {
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string; message?: string } };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return { outcome: 'timeout', note: 'request timed out' };
  const code = e?.cause?.code ?? e?.code ?? '';
  const message = e?.cause?.message ?? e?.message ?? 'unknown error';
  if (TLS_CODES.test(code) || TLS_CODES.test(message)) {
    return { outcome: 'tls_error', note: `${code} ${message}`.trim() };
  }
  return { outcome: 'network_error', note: `${code} ${message}`.trim() };
}

function outcomeForStatus(status: number): Outcome {
  if (status === 304) return 'not_modified';
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404 || status === 410) return 'not_found';
  if (status === 401 || status === 403) return 'forbidden';
  if (status >= 500) return 'server_error';
  return 'client_error';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface WalkOptions {
  method: 'GET' | 'HEAD';
  previous?: Validators;
  keepBody: boolean;
}

export class Fetcher {
  requests = 0;
  bytes = 0;

  private opts: Required<Omit<FetcherOptions, 'robotsCache'>> & { robotsCache?: RobotsCache };
  private hosts = new Map<string, { queue: PQueue; delayMs: number; last: number }>();
  private robots = new Map<string, Promise<RobotsVerdict>>();

  constructor(options: FetcherOptions) {
    this.opts = {
      minDelayMs: 3000,
      timeoutMs: 30_000,
      bodyTimeoutMs: 180_000,
      maxBytes: 100 * 1024 * 1024,
      retries: 2,
      backoffMs: 5000,
      maxRedirects: 5,
      ...options,
    };
  }

  private host(hostname: string) {
    let h = this.hosts.get(hostname);
    if (!h) {
      h = { queue: new PQueue({ concurrency: 1 }), delayMs: this.opts.minDelayMs, last: 0 };
      this.hosts.set(hostname, h);
    }
    return h;
  }

  /** Runs one request per host at a time, spaced by that host's delay. */
  private paced<T>(hostname: string, fn: () => Promise<T>): Promise<T> {
    const h = this.host(hostname);
    return h.queue.add(async () => {
      const wait = h.last + h.delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      h.last = Date.now();
      this.requests += 1;
      return fn();
    }) as Promise<T>;
  }

  private verdict(origin: string, entry: RobotsCacheEntry): RobotsVerdict {
    const { httpStatus: status, body } = entry;
    if (status === 401 || status === 403) return { kind: 'denied', reason: `robots.txt returned ${status}` };
    if (status >= 400) return { kind: 'rules', isAllowed: () => true };
    const rules = parseRobots(`${origin}/robots.txt`, body);
    const crawlDelay = rules.getCrawlDelay(this.opts.userAgent);
    if (crawlDelay) {
      const h = this.host(new URL(origin).hostname);
      h.delayMs = Math.max(h.delayMs, crawlDelay * 1000);
    }
    return { kind: 'rules', isAllowed: (url) => rules.isAllowed(url, this.opts.userAgent) !== false };
  }

  private async loadRobots(origin: string): Promise<RobotsVerdict> {
    const cached = await this.opts.robotsCache?.get(origin);
    if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) return this.verdict(origin, cached);

    return this.paced(new URL(origin).hostname, async (): Promise<RobotsVerdict> => {
      try {
        const res = await fetch(`${origin}/robots.txt`, {
          headers: { 'user-agent': this.opts.userAgent },
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        const body = await res.text();
        if (res.status >= 500) return { kind: 'unavailable', reason: `robots.txt returned ${res.status}` };
        const entry = { fetchedAt: Date.now(), httpStatus: res.status, body };
        await this.opts.robotsCache?.set(origin, entry);
        return this.verdict(origin, entry);
      } catch (err) {
        return { kind: 'unavailable', reason: `robots.txt: ${describeError(err).note}` };
      }
    });
  }

  private robotsFor(origin: string): Promise<RobotsVerdict> {
    let p = this.robots.get(origin);
    if (!p) {
      p = this.loadRobots(origin);
      this.robots.set(origin, p);
    }
    return p;
  }

  private async send(url: string, options: WalkOptions): Promise<RawResponse> {
    const hostname = new URL(url).hostname;
    const headers: Record<string, string> = { 'user-agent': this.opts.userAgent, accept: '*/*' };
    if (options.previous?.etag) headers['if-none-match'] = options.previous.etag;
    if (options.previous?.lastModified) headers['if-modified-since'] = options.previous.lastModified;
    const timeout = options.keepBody ? this.opts.bodyTimeoutMs : this.opts.timeoutMs;

    let last: RawResponse = { ok: false, outcome: 'network_error', note: 'not attempted' };
    for (let attempt = 0; attempt <= this.opts.retries; attempt++) {
      if (attempt > 0) await sleep(this.opts.backoffMs * 3 ** (attempt - 1));
      try {
        const res = await this.paced(hostname, () => fetch(url, {
          method: options.method,
          redirect: 'manual',
          headers,
          signal: AbortSignal.timeout(timeout),
        }));
        if (res.status >= 500 || res.status === 429) {
          await res.body?.cancel();
          last = { ok: false, outcome: outcomeForStatus(res.status), note: `HTTP ${res.status}` };
          continue;
        }
        return { ok: true, res };
      } catch (err) {
        const d = describeError(err);
        last = { ok: false, ...d };
        if (d.outcome === 'tls_error') break; // A bad certificate won't fix itself on retry.
      }
    }
    return last;
  }

  /** Reads a body up to the size limit. Returns null if it is too large. */
  private async readBody(res: Response): Promise<Uint8Array | null> {
    if (!res.body) return new Uint8Array();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      this.bytes += chunk.length;
      if (size > this.opts.maxBytes) return null; // Leaving the loop cancels the stream.
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /** Follows redirects by hand so that each hop passes robots and pacing. */
  private async walk(url: string, options: WalkOptions): Promise<FetchResult> {
    const result: FetchResult = {
      url, outcome: 'ok', httpStatus: null, finalUrl: null, redirectKind: 'none', hops: 0, contentType: null,
      contentLength: null, etag: null, lastModified: null, body: null, note: null,
    };
    let current = url;

    for (;;) {
      const origin = new URL(current).origin;
      const robots = await this.robotsFor(origin);
      if (robots.kind !== 'rules') {
        return {
          ...result,
          finalUrl: current,
          outcome: robots.kind === 'denied' ? 'blocked_robots' : 'robots_unavailable',
          note: robots.reason,
        };
      }
      if (!robots.isAllowed(current)) {
        return { ...result, finalUrl: current, outcome: 'blocked_robots', note: `disallowed by ${origin}/robots.txt` };
      }

      const raw = await this.send(current, options);
      if (!raw.ok) return { ...result, finalUrl: current, outcome: raw.outcome, note: raw.note };
      const { res } = raw;
      result.httpStatus = res.status;

      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        if (result.hops >= this.opts.maxRedirects) {
          return { ...result, finalUrl: current, outcome: 'too_many_redirects', note: `stopped after ${result.hops} redirects` };
        }
        current = new URL(location, current).toString();
        result.hops += 1;
        continue;
      }

      const final: FetchResult = {
        ...result,
        outcome: outcomeForStatus(res.status),
        finalUrl: current,
        redirectKind: classifyRedirect(url, current),
        contentType: res.headers.get('content-type'),
        contentLength: res.headers.get('content-length'),
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
      };

      // Some servers ignore conditional headers and answer 200 anyway. If the
      // validators match, the body can still be skipped.
      const ignoredCondition = final.outcome === 'ok' && options.previous && validatorsMatch(options.previous, final);
      if (ignoredCondition) {
        await res.body?.cancel();
        return { ...final, outcome: 'not_modified' };
      }
      if (final.outcome !== 'ok' || !options.keepBody) {
        await res.body?.cancel();
        return final;
      }

      try {
        const body = await this.readBody(res);
        if (!body) return { ...final, outcome: 'too_large', note: `larger than ${this.opts.maxBytes} bytes` };
        return { ...final, body };
      } catch (err) {
        return { ...final, ...describeError(err) };
      }
    }
  }

  /** Asks about a document without downloading it. */
  head(url: string): Promise<FetchResult> {
    return this.walk(url, { method: 'HEAD', keepBody: false });
  }

  /**
   * Downloads a URL. With `previous`, it asks for the body only if the content
   * changed, and returns outcome `not_modified` when it didn't.
   */
  get(url: string, previous?: Validators): Promise<FetchResult> {
    return this.walk(url, { method: 'GET', keepBody: true, previous });
  }
}
