import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkSource } from '../src/detect.ts';
import { Fetcher } from '../src/fetcher.ts';
import { cleanUrl, extractLinks, isDocument, linkScore, sameSite, versionKey } from '../src/links.ts';
import { renderReport, type ReportInput } from '../src/report/daily.ts';
import { writeReport } from '../src/report/write.ts';
import { MAX_NEW_SOURCES_PER_RUN, runChecks } from '../src/run.ts';
import type { RunEvent, Source } from '../src/store.ts';
import { MemoryStore } from './memory-store.ts';

describe('cleanUrl', () => {
  const base = 'https://a.ro/x/page.html';

  it('resolves relative links, and drops fragments and tracking', () => {
    expect(cleanUrl('../doc.pdf?utm_source=f&id=3#p2', base)).toBe('https://a.ro/doc.pdf?id=3');
  });

  it('ignores links that are not web pages', () => {
    expect(cleanUrl('mailto:x@a.ro', base)).toBeNull();
    expect(cleanUrl('javascript:void(0)', base)).toBeNull();
    expect(cleanUrl('http://[bad', base)).toBeNull();
  });

  it('treats the two AFIR links to a file as one', () => {
    const view = cleanUrl('/api/file?url=/media/a/b.pdf&filename=B&filetype=pdf', 'https://www.afir.ro/s');
    const download = cleanUrl('/api/file/document?url=/media/a/b.pdf&filename=B&filetype=pdf', 'https://www.afir.ro/s');
    expect(view).toBe(download);
  });
});

describe('link helpers', () => {
  it('recognizes documents, including AFIR links', () => {
    expect(isDocument('https://a.ro/ghid.PDF')).toBe(true);
    expect(isDocument('https://www.afir.ro/api/file/document?url=/media/x/g.pdf')).toBe(true);
    expect(isDocument('https://a.ro/ghid.html')).toBe(false);
  });

  it('counts subdomains as the same site', () => {
    expect(sameSite('https://dadrab.madr.ro/a', 'https://www.madr.ro/b')).toBe(true);
    expect(sameSite('https://facebook.com/a', 'https://www.madr.ro/b')).toBe(false);
  });

  it('scores the spec keywords, with or without diacritics', () => {
    expect(linkScore('https://a.ro/Ghid-sesiune-2026.pdf', '')).toBe(3);
    expect(linkScore('https://a.ro/x', 'Anexă la ordin')).toBe(2);
    expect(linkScore('https://a.ro/contact', 'Contact')).toBe(0);
  });
});

describe('versionKey', () => {
  it.each([
    ['https://a.ro/Manual-impl-SDL-2023-2027--v1-rectificat-18.06.2025.pdf', 'https://a.ro/Manual-impl-SDL-2023-2027--v2.pdf'],
    ['https://a.ro/GS-GAL-2023-2027-versiunea-2.pdf', 'https://a.ro/GS-GAL-2023-2027-versiunea-3.pdf'],
    [
      'https://www.afir.ro/api/file/document?url=/media/25dk/anunt_cerereproiecte_dr_14_prelungit_16112026.pdf',
      'https://www.afir.ro/api/file/document?url=/media/otup/anunt_cerereproiecte_dr_14_.pdf',
    ],
  ])('groups versions: %s', (a, b) => {
    expect(versionKey(a)).not.toBeNull();
    expect(versionKey(a)).toBe(versionKey(b));
  });

  it('keeps different documents apart', () => {
    expect(versionKey('https://a.ro/anunt_dr_14.pdf')).not.toBe(versionKey('https://a.ro/anunt_dr_18.pdf'));
  });

  it('refuses to group names that are too generic', () => {
    expect(versionKey('https://a.ro/Anexa.pdf')).toBeNull();
  });
});

describe('extractLinks', () => {
  const page = `<html><body><nav><a href="/menu.pdf">Meniu</a></nav>
    <main class="page-container">
      <a href="/doc.pdf">Ghid 2026</a>
      <a href="/doc.pdf"></a>
      <a href="https://facebook.com/share">Distribuie</a>
      <a href="/s">Pagina aceasta</a>
    </main><footer><a href="/f.pdf">Subsol</a></footer></body></html>`;

  it('reads main content only, once per URL, on this site only', () => {
    const links = extractLinks(page, 'https://www.afir.ro/s');
    expect(links.map((l) => l.url)).toEqual(['https://www.afir.ro/doc.pdf']);
    expect(links[0]).toMatchObject({ text: 'Ghid 2026', isDocument: true, score: 2 });
  });

  it('uses the body, without menus, on sites with no selector', () => {
    const urls = extractLinks(page, 'https://exemplu.ro/x').map((l) => l.url);
    expect(urls).toContain('https://exemplu.ro/doc.pdf');
    expect(urls).not.toContain('https://exemplu.ro/menu.pdf');
    expect(urls).not.toContain('https://exemplu.ro/f.pdf');
  });
});

describe('links in the cascade', () => {
  const para = 'Fermierii pot depune cererile de finanțare până la data anunțată de agenția de plăți. '.repeat(4);
  const page = (links: string) => `<html><body><main><p>${para}</p>${links}</main></body></html>`;
  let body = '';
  let server: http.Server;
  let base: string;
  let store: MemoryStore;
  let fetcher: Fetcher;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/robots.txt') return void res.writeHead(404).end();
      if (req.url === '/index') return void res.writeHead(200, { 'content-type': 'text/html' }).end(body);
      res.writeHead(200, { 'content-type': 'text/html' }).end(page(''));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => void server.close());

  beforeEach(() => {
    store = new MemoryStore();
    fetcher = new Fetcher({ userAgent: 't/1', minDelayMs: 0, retries: 0, robotsCache: store.robotsCache() });
    body = page('<a href="/anunt_dr_14.pdf">Anunț DR 14</a>');
  });

  const check = (s: Source) => checkSource(store.get(s.id), { store, fetcher, runId: 1, now: new Date() });

  it('keeps the first visit as a silent baseline', async () => {
    const s = store.add(`${base}/index`, 'index');
    await check(s);
    expect(store.links).toMatchObject([{ isBaseline: true, added: false }]);
    expect(store.kinds()).toEqual(['baseline']);
    expect(await store.pendingLinkCount()).toBe(0);
  });

  it('reports a new link once, even when the page text is unchanged', async () => {
    const s = store.add(`${base}/index`, 'index');
    await check(s);
    body = body.replace('</main>', '<a href="/ghid-2026.pdf"></a></main>');
    expect(await check(s)).toBe('same_text');
    expect(await check(s)).toBe('same_text');
    expect(store.kinds()).toEqual(['baseline', 'new_link']);
    expect(JSON.parse(store.events.at(-1)!.detail!)).toMatchObject({ url: `${base}/ghid-2026.pdf`, isDocument: true, score: 2 });
  });

  it('marks a new file as a new version of a known document', async () => {
    const s = store.add(`${base}/index`, 'index');
    await check(s);
    body = body.replace('</main>', '<a href="/anunt_dr_14_prelungit_16112026.pdf">Prelungit</a></main>');
    await check(s);
    expect(JSON.parse(store.events.at(-1)!.detail!).versionOf).toBe(`${base}/anunt_dr_14.pdf`);
  });

  it('ignores links on non-index pages', async () => {
    const s = store.add(`${base}/index`, 'pagina');
    await check(s);
    expect(store.links).toHaveLength(0);
  });

  it('monitors new links on the next run, as non-index sources, up to the cap', async () => {
    const s = store.add(`${base}/index`, 'index');
    await runChecks(store, fetcher, () => {}, new Date('2026-11-07T10:00:00Z'));
    const many = Array.from({ length: MAX_NEW_SOURCES_PER_RUN + 3 }, (_, i) => `<a href="/p${i}">Pagina ${i}</a>`);
    body = body.replace('</main>', `${many.join('')}</main>`);

    const second = await runChecks(store, fetcher, () => {}, new Date('2026-11-08T10:00:00Z'));
    expect(second.newSources).toBe(MAX_NEW_SOURCES_PER_RUN);
    expect(await store.pendingLinkCount()).toBe(3);
    const added = store.sources.filter((x) => x.id !== s.id);
    expect(added.every((x) => x.type === 'pagina')).toBe(true);

    const third = await runChecks(store, fetcher, () => {}, new Date('2026-11-09T10:00:00Z'));
    expect(third.checked).toBe(MAX_NEW_SOURCES_PER_RUN + 1);
    expect(store.get(added[0]!.id).content_hash).not.toBeNull();
    expect(third.newSources).toBe(3);
  });
});

describe('renderReport', () => {
  const event = (kind: RunEvent['kind'], extra: Partial<RunEvent> = {}): RunEvent => ({
    kind, detail: null, title: 'Sesiuni', url: 'https://a.ro/s', institution: 'AFIR', diff: null, ...extra,
  });
  const input = (events: RunEvent[], extra: Partial<ReportInput> = {}): ReportInput => ({
    date: '2026-11-08', checked: 10, requests: 12, bytes: 2048, pendingLinks: 0, events, ...extra,
  });

  it('says only that nothing changed on a quiet day', () => {
    const text = renderReport(input([]));
    expect(text).toContain('Nu s-a schimbat nimic.');
    expect(text).not.toContain('##');
  });

  it('does not call an error day quiet', () => {
    const text = renderReport(input([event('error', { detail: 'timeout' })]));
    expect(text).not.toContain('Nu s-a schimbat nimic.');
    expect(text).toContain('## Erori (1)');
  });

  it('shows changes with their diff, and shortens a huge one', () => {
    const diff = Array.from({ length: 250 }, (_, i) => `+rând ${i}`).join('\n');
    const text = renderReport(input([event('changed', { diff })]));
    expect(text).toContain('```diff');
    expect(text).toContain('+rând 199');
    expect(text).not.toContain('+rând 200');
    expect(text).toContain('200 din 250');
  });

  it('explains a change with no diff', () => {
    expect(renderReport(input([event('changed', { detail: 'no text diff available' })]))).toContain('no text diff available');
  });

  it('lists documents before pages, and flags new versions', () => {
    const link = (url: string, isDocument: boolean, score: number, versionOf: string | null = null) =>
      event('new_link', { detail: JSON.stringify({ url, text: url, score, isDocument, versionOf }) });
    const text = renderReport(input([link('p', false, 5), link('d', true, 1, 'veche.pdf')]));
    expect(text.indexOf('(d)')).toBeLessThan(text.indexOf('(p)'));
    expect(text).toContain('versiune nouă a veche.pdf');
  });

  it('counts first-time sources and waiting links instead of listing them', () => {
    const text = renderReport(input([event('baseline')], { pendingLinks: 4 }));
    expect(text).toContain('punct de pornire: 1');
    expect(text).toContain('în așteptare pentru rularea următoare: 4');
  });
});

describe('writeReport', () => {
  it('rewrites a run\'s own report, and never overwrites another run\'s', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
    const store = new MemoryStore();
    const run = (id: number) => ({ id, started: '2026-11-08T05:00:00Z', checked: 0, requests: 0, bytes: 0, errors: [] });

    const first = await writeReport(store, run(1), dir);
    expect(path.basename(first)).toBe('2026-11-08.md');
    expect(await writeReport(store, run(1), dir)).toBe(first);
    expect(path.basename(await writeReport(store, run(2), dir))).toBe('2026-11-08-run2.md');
    fs.rmSync(dir, { recursive: true });
  });
});
