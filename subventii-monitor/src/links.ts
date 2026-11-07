// Finds the documents and pages an index page links to. A new link is the best
// signal of a new subsidy or a new version of a guide.
import * as cheerio from 'cheerio';
import { BOILERPLATE } from './extract/html.ts';
import { selectorFor } from './extract/selectors.ts';
import { normalize } from './normalize.ts';

export interface PageLink {
  url: string;
  text: string;
  score: number;
  isDocument: boolean;
  versionKey: string | null;
}

const TRACKING = /^(utm_|fbclid$|gclid$|mc_)/i;
const DOCUMENT = /\.(pdf|docx?|xlsx?|odt|ods|rtf|zip|rar|7z)$/i;
const KEYWORDS = ['ghid', 'anexa', 'ordin', 'sesiune', '2026', '2027'];

// Words that mark a revision of a document rather than a different document.
const REVISION_WORDS = /\b(versiunea|versiune|vers|ver|v|revizia|rev|editia|ed|rectificat[ae]?|actualizat[ae]?|modificat[ae]?|prelungit[ae]?|final[ae]?)\s*\d*\b/g;
const DATES = /\b\d{1,2}[ .]\d{1,2}[ .]\d{2,4}\b|\b\d{6,8}\b/g;

function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Resolves a link and removes what doesn't identify the target. */
export function cleanUrl(href: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(href.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  for (const name of [...url.searchParams.keys()]) {
    if (TRACKING.test(name)) url.searchParams.delete(name);
  }
  // AFIR offers each file twice: a view link and a download link.
  if (url.hostname.endsWith('afir.ro') && url.pathname === '/api/file') url.pathname = '/api/file/document';
  return url.toString();
}

function filePath(url: URL): string {
  return url.searchParams.get('url') ?? url.pathname; // AFIR hides the file in a parameter.
}

export function isDocument(link: string): boolean {
  const url = new URL(link);
  return DOCUMENT.test(filePath(url)) || url.searchParams.has('filetype');
}

/** Same site means the same last two labels, so subdomains belong together. */
export function sameSite(a: string, b: string): boolean {
  const site = (u: string) => new URL(u).hostname.split('.').slice(-2).join('.');
  return site(a) === site(b);
}

export function linkScore(url: string, text: string): number {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // Malformed encoding: score the raw URL.
  }
  const haystack = plain(`${decoded} ${text}`);
  return KEYWORDS.filter((word) => haystack.includes(word)).length;
}

/**
 * Names the document behind a file, ignoring its revision. `ghid-v2.pdf` and
 * `ghid-rectificat-18.06.2025.pdf` get the same key. Null if the name is too
 * generic to group safely.
 */
export function versionKey(link: string): string | null {
  const raw = filePath(new URL(link)).split('/').pop() ?? '';
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    // Malformed encoding: use the raw name.
  }
  const key = plain(name)
    .replace(DOCUMENT, '')
    .replace(/[-_]+/g, ' ')
    .replace(DATES, ' ')
    .replace(REVISION_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return key.split(' ').length >= 2 ? key : null;
}

/** Reads the links in a page's main content, or its body without the menus. */
export function extractLinks(html: string, pageUrl: string): PageLink[] {
  const $ = cheerio.load(html);
  $(BOILERPLATE).remove();
  const selector = selectorFor(pageUrl);
  const scoped = selector ? $(selector) : null;
  const root = scoped && scoped.length > 0 ? scoped : $('body');

  const page = cleanUrl(pageUrl, pageUrl);
  const links = new Map<string, PageLink>();
  root.find('a[href]').each((_, element) => {
    const url = cleanUrl($(element).attr('href') ?? '', pageUrl);
    if (!url || url === page || !sameSite(url, pageUrl)) return;
    const text = normalize($(element).text()).replaceAll('\n', ' ');
    const existing = links.get(url);
    if (existing) {
      if (!existing.text) existing.text = text;
      return;
    }
    const document = isDocument(url);
    links.set(url, {
      url,
      text,
      score: linkScore(url, text),
      isDocument: document,
      versionKey: document ? versionKey(url) : null,
    });
  });
  return [...links.values()];
}
