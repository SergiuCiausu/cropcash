import { describe, expect, it } from 'vitest';
import { decodeHtml, extractHtml } from '../src/extract/html.ts';
import { extractPdf, isPdf } from '../src/extract/pdf.ts';
import { normalize } from '../src/normalize.ts';
import { simplePdf } from './pdf-fixture.ts';

const paragraph = 'Fermierii pot depune cererile de finanțare în cadrul sesiunii deschise până la data anunțată de agenție. '.repeat(4);

const page = (visits: number) => `<!doctype html><html><head><title>Sesiuni</title><script>var t=1</script></head><body>
  <header><nav><a href="/">Acasă</a></nav></header>
  <main><h1>Sesiuni deschise</h1><p>${paragraph}</p>
    <table><tr><td>DR-14</td><td>31.12.2026</td></tr></table></main>
  <footer>Vizitatori: ${visits}</footer>
</body></html>`;

describe('tag links', () => {
  const page = (tags: string) => `<main><table><tr><td>Apel</td><td>${tags}</td></tr></table>${'<p>Conținut.</p>'.repeat(40)}</main>`;
  const a = '<a rel="category tag" href="/a">A</a>';
  const b = '<a rel="tag" href="/b">B</a>';

  it('ignores tags that swap places between visits', async () => {
    const url = 'https://mfe.gov.ro/ceva/';
    const first = await extractHtml(page(`${a}, ${b}`), url);
    const second = await extractHtml(page(`${b}, ${a}`), url);
    expect(first.text).toBe(second.text);
    expect(first.text).toContain('Apel');
  });
});

describe('extractHtml', () => {
  it('keeps the content and drops the menu, footer and scripts', async () => {
    const text = normalize((await extractHtml(page(1), 'https://example.ro/s')).text);
    expect(text).toContain('Fermierii pot depune');
    expect(text).toContain('DR-14');
    expect(text).not.toContain('Acasă');
    expect(text).not.toContain('Vizitatori');
    expect(text).not.toContain('var t');
  });

  it('gives identical text when only the visitor counter changes', async () => {
    const a = (await extractHtml(page(100), 'https://example.ro/s')).text;
    const b = (await extractHtml(page(101), 'https://example.ro/s')).text;
    expect(normalize(a)).toBe(normalize(b));
  });

  it('keeps table rows on separate lines, for readable diffs', async () => {
    const html = `<html><body><main><p>${paragraph}</p><table>
      <tr><td>DR-14</td><td>31.12.2026</td></tr><tr><td>DR-30</td><td>15.01.2027</td></tr></table></main></body></html>`;
    const lines = normalize((await extractHtml(html, 'https://example.ro/t')).text).split('\n');
    expect(lines.some((l) => l.includes('DR-14') && !l.includes('DR-30'))).toBe(true);
  });

  it('survives a page with no usable content', async () => {
    expect(normalize((await extractHtml('<html><body></body></html>', 'https://example.ro/e')).text)).toBe('');
  });
});

describe('site selectors', () => {
  const afir = (body: string) => `<html><body><nav>Meniu</nav><main class="container page-container">
    ${body}<div class="download-button"><a href="/a.pdf">Anunt DR 18 PRELUNGIT 16.11.2026</a></div></main></body></html>`;

  it('keeps document names, even on a short page', async () => {
    const r = await extractHtml(afir('<p>Sesiuni</p>'), 'https://www.afir.ro/instrumente/sesiuni/');
    expect(r.fromSelector).toBe(true);
    expect(normalize(r.text).split('\n')).toEqual(['Sesiuni', 'Anunt DR 18 PRELUNGIT 16.11.2026']);
  });

  it('falls back when the layout changes and the selector finds nothing', async () => {
    const html = `<html><body><section><p>${paragraph}</p></section></body></html>`;
    const r = await extractHtml(html, 'https://www.afir.ro/x');
    expect(r.fromSelector).toBe(false);
    expect(r.text).toContain('Fermierii');
  });
});

describe('decodeHtml', () => {
  const windows1250 = new Uint8Array([0x54, 0xE2, 0x72, 0x67]); // "Târg"

  it('uses the charset from the header', () => {
    expect(decodeHtml(windows1250, 'text/html; charset=windows-1250')).toBe('Târg');
  });

  it('uses the meta tag when the header has none', () => {
    const meta = new TextEncoder().encode('<meta charset="windows-1250">');
    const body = new Uint8Array([...meta, ...windows1250]);
    expect(decodeHtml(body, 'text/html')).toContain('Târg');
  });

  it('defaults to UTF-8, and survives an unknown charset', () => {
    const body = new TextEncoder().encode('Târg');
    expect(decodeHtml(body, null)).toBe('Târg');
    expect(decodeHtml(body, 'text/html; charset=not-a-charset')).toBe('Târg');
  });
});

describe('extractPdf', () => {
  it('reads text from a PDF', async () => {
    const pdf = simplePdf('Ghidul solicitantului');
    expect(isPdf(pdf)).toBe(true);
    expect(await extractPdf(pdf)).toContain('Ghidul solicitantului');
  });

  it('returns nothing for a damaged file', async () => {
    expect(await extractPdf(new TextEncoder().encode('%PDF-1.4 broken'))).toBe('');
  });

  it('does not mistake HTML for a PDF', () => {
    expect(isPdf(new TextEncoder().encode('<html></html>'))).toBe(false);
  });
});
