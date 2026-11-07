import { describe, expect, it, vi } from 'vitest';
import { checkFarmerPages, pagePatch, type PageStore, type WatchedPage, type WatchedPagePatch } from '../src/farmer-pages.ts';
import { Fetcher, type FetchResult } from '../src/fetcher.ts';
import { cleanSourceUrl, guardedFetch, isPublicAddress, publicLookup } from '../src/guarded-fetch.ts';
import { fromResult, pageReader, type PageRead } from '../src/read-page.ts';
import { sha256 } from '../src/normalize.ts';

const NOW = new Date('2026-11-07T07:00:00Z');
const limits = { previewChars: 10, textChars: 1000 };
const page: WatchedPage = { id: 1, url: 'https://a.ro/x', title: 'Pagina', content_hash: 'old', failure_count: 0 };
const read = (text: string): PageRead => ({
  state: 'ok', url: page.url, finalUrl: page.url, kind: 'pagina', title: 'Pagina', text, hash: sha256(text),
});

describe('cleanSourceUrl', () => {
  it('accepts what a farmer types', () => {
    expect(cleanSourceUrl('  afir.ro/apeluri ')).toBe('https://afir.ro/apeluri');
    expect(cleanSourceUrl('http://apia.org.ro/a.pdf#page=2')).toBe('http://apia.org.ro/a.pdf');
  });

  it.each([
    '', 'localhost', 'http://localhost/x', 'file:///etc/passwd', 'ftp://a.ro/x', 'javascript:alert(1)',
    'https://user:pass@a.ro/x', 'https://a.ro:8080/x', 'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/',
    'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/', 'http://192.168.1.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/',
    `https://a.ro/${'x'.repeat(2001)}`,
  ])('refuses %s', (text) => {
    expect(cleanSourceUrl(text)).toBeNull();
  });
});

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '2a00:1450:4001:81a::200e'])('allows %s', (ip) => expect(isPublicAddress(ip)).toBe(true));
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '::1', '::', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '64:ff9b::a00:1', 'not an address',
  ])('blocks %s', (ip) => expect(isPublicAddress(ip)).toBe(false));
});

describe('guardedFetch', () => {
  it('refuses a name that points inside, when the connection opens', async () => {
    const answer = await new Promise<Error | null>((resolve) => publicLookup('localhost', { all: true }, (err) => resolve(err)));
    expect(answer?.message).toContain('EPRIVATEADDRESS');
  });

  it('refuses a private address and any other port before sending', async () => {
    const get = guardedFetch();
    await expect(get('http://127.0.0.1/')).rejects.toThrow('EPRIVATEADDRESS');
    await expect(get('http://[::1]/')).rejects.toThrow('EPRIVATEADDRESS');
    await expect(get('https://example.com:8443/')).rejects.toThrow('EPRIVATEADDRESS');
  });
});

describe('reading a page', () => {
  const result = (over: Partial<FetchResult>): FetchResult => ({
    url: page.url, outcome: 'ok', httpStatus: 200, finalUrl: page.url, redirectKind: 'none', hops: 0, contentType: 'text/html',
    contentLength: null, etag: null, lastModified: null, body: null, note: null, ...over,
  });
  const html = `<html><head><title>Sesiune DR-14</title></head><body><main><p>${'Text despre finanțare. '.repeat(20)}</p></main></body></html>`;

  it('reads a page with its title', async () => {
    const r = await fromResult(page.url, result({ body: new TextEncoder().encode(html) }));
    expect(r).toMatchObject({ state: 'ok', kind: 'pagina', title: 'Sesiune DR-14' });
  });

  it('calls a page with almost no text thin, not broken', async () => {
    const body = new TextEncoder().encode('<html><body><p>Scurt</p></body></html>');
    expect(await fromResult(page.url, result({ body }))).toMatchObject({ state: 'thin' });
  });

  it('refuses anything that is not a page or a PDF', async () => {
    const r = await fromResult(page.url, result({ contentType: 'application/zip', body: new Uint8Array([1, 2]) }));
    expect(r).toEqual({ state: 'refused', reason: 'unsupported', url: page.url });
  });

  it.each([
    ['blocked_robots', 'blocked'], ['forbidden', 'blocked'], ['not_found', 'gone'], ['timeout', 'error'],
  ] as const)('reports %s as %s', async (outcome, state) => {
    expect(await fromResult(page.url, result({ outcome }))).toEqual({ state, url: page.url });
  });

  it('says when a file is too large', async () => {
    expect(await fromResult(page.url, result({ outcome: 'too_large' }))).toMatchObject({ state: 'refused', reason: 'too_large' });
  });

  it('reports a private address even when it was found on robots.txt', async () => {
    const r = await fromResult(page.url, result({ outcome: 'robots_unavailable', note: 'robots.txt: EPRIVATEADDRESS x' }));
    expect(r).toMatchObject({ state: 'refused', reason: 'private' });
  });

  it('gives up at the deadline', async () => {
    const fetchFn = (() => new Promise(() => {})) as unknown as typeof fetch;
    const reader = pageReader({ userAgent: 't', maxBytes: 100, timeoutMs: 5000, retries: 0, deadlineMs: 20, fetchFn });
    expect(await reader(page.url)).toEqual({ state: 'error', url: page.url });
  });

  it('stops reading a robots.txt that is too large', async () => {
    const fetchFn = (async () => new Response('x'.repeat(600_000))) as unknown as typeof fetch;
    const fetcher = new Fetcher({ userAgent: 't', maxBytes: 100, fetchFn, minDelayMs: 0 });
    expect((await fetcher.get(page.url)).outcome).toBe('robots_unavailable');
  });
});

describe('the daily check', () => {
  it('notes a real change and shows what changed', () => {
    const patch = pagePatch(page, read('text nou'), limits, NOW, 'text vechi');
    expect(patch.changed_at).toBe(NOW.toISOString());
    expect(patch.short_diff).toContain('text nou');
  });

  it('says nothing when the text is the same', () => {
    const same = { ...page, content_hash: sha256('la fel') };
    expect(pagePatch(same, read('la fel'), limits, NOW, null).changed_at).toBeUndefined();
  });

  it('does not count the first read as a change', () => {
    expect(pagePatch({ ...page, content_hash: null }, read('prima'), limits, NOW, null).changed_at).toBeUndefined();
  });

  it('keeps the last text when a read fails', () => {
    const patch = pagePatch(page, { state: 'error', url: page.url }, limits, NOW, null);
    expect(patch).toMatchObject({ state: 'error', failure_count: 1 });
    expect(patch).not.toHaveProperty('content_hash');
    expect(patch).not.toHaveProperty('text');
  });

  it('checks each page tomorrow again, and shortens what it keeps', () => {
    const patch = pagePatch(page, read('un text destul de lung'), limits, NOW, 'vechi');
    expect(patch.next_due).toBe('2026-11-08T07:00:00.000Z');
    expect(patch.preview).toHaveLength(limits.previewChars);
  });

  function memory(pages: WatchedPage[]) {
    const patches = new Map<number, WatchedPagePatch>();
    const store: PageStore = {
      duePages: async () => pages,
      pageText: vi.fn(async () => 'text vechi'),
      updatePage: async (id, patch) => void patches.set(id, patch),
    };
    return { store, patches };
  }

  it('goes on after one page fails, and logs no links', async () => {
    const { store, patches } = memory([{ ...page, id: 1 }, { ...page, id: 2 }]);
    const reader = vi.fn(async () => read('text nou')).mockRejectedValueOnce(new Error('boom'));
    const logs: string[] = [];
    const summary = await checkFarmerPages(store, reader, limits, (m) => logs.push(m), NOW);
    expect(summary).toEqual({ checked: 2, changed: 1 });
    expect(patches.has(2)).toBe(true);
    expect(logs.join(' ')).not.toContain('a.ro');
  });

  it('loads the old text only when something changed', async () => {
    const { store } = memory([{ ...page, content_hash: sha256('la fel') }]);
    await checkFarmerPages(store, async () => read('la fel'), limits, () => {}, NOW);
    expect(store.pageText).not.toHaveBeenCalled();
  });
});
