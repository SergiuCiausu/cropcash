import * as cheerio from 'cheerio';
import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import { parserFor } from '../opportunities/parsers/index.ts';
import { renderDraft, type Draft } from '../opportunities/types.ts';
import { selectorFor } from './selectors.ts';

/** Below this many characters, a page has no real content to compare. */
export const MIN_TEXT_CHARS = 200;

// Tag links are included because WordPress shuffles their order between visits.
// `tip_ghid_` is MIPE's custom tag type, which has no rel attribute.
const TAG_LINKS = 'a[rel~="tag"], a[href*="/tip_ghid_"]';
export const BOILERPLATE = `script, style, noscript, template, svg, iframe, nav, header, footer, aside, form, ${TAG_LINKS}`;
const BLOCKS = 'p, div, li, tr, br, h1, h2, h3, h4, h5, h6, table, section, article, ul, ol, dl, dt, dd, blockquote, pre';

function decode(body: Uint8Array, label: string | undefined): string {
  try {
    return new TextDecoder(label ?? 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body); // Unknown charset name.
  }
}

/** Uses the charset from the header, then the page's meta tag, then UTF-8. */
export function decodeHtml(body: Uint8Array, contentType: string | null): string {
  const declared = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  if (declared) return decode(body, declared);
  const head = new TextDecoder('latin1').decode(body.subarray(0, 2048));
  return decode(body, head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]);
}

/** Cheerio's text() runs blocks together, so each block gets its own line. */
function toText($: cheerio.CheerioAPI, root: ReturnType<cheerio.CheerioAPI>): string {
  root.find(BLOCKS).after('\n');
  root.find('td, th').after(' ');
  return root.text();
}

async function automatic(html: string, url: string): Promise<string> {
  try {
    const $page = cheerio.load(html);
    $page(TAG_LINKS).remove();
    const { document } = parseHTML($page.html());
    const { content } = await Defuddle(document, url);
    const $ = cheerio.load(content ?? '');
    return toText($, $.root());
  } catch {
    return ''; // Malformed page: the caller falls back to the whole body.
  }
}

/** Anti-bot pages. They are reported, never solved or worked around. */
const CHALLENGE = /completati urmatorul captcha/i;

export function isChallengePage(text: string): boolean {
  return CHALLENGE.test(text);
}

export interface HtmlResult {
  text: string;
  /** True when a site selector found the content, so even a short page is trusted. */
  fromSelector: boolean;
  /** Calls found by this page's parser, if it has one. */
  drafts: Draft[];
  /** The page has a parser that found nothing, so its layout probably changed. */
  parserFailed: boolean;
}

export async function extractHtml(html: string, url: string): Promise<HtmlResult> {
  // A parser's output is the comparable text, so diffs show calls and noise
  // such as AFIR's live counter can't register as a change.
  const parser = parserFor(url);
  if (parser) {
    const drafts = parser(html, url);
    if (drafts.length > 0) {
      return { text: drafts.map(renderDraft).join('\n'), fromSelector: true, drafts, parserFailed: false };
    }
  }
  const none = { drafts: [], parserFailed: Boolean(parser) };

  const selector = selectorFor(url);
  if (selector) {
    const $ = cheerio.load(html);
    const match = $(selector);
    match.find(BOILERPLATE).remove();
    const text = toText($, match);
    // No match means the site changed its layout, so fall through.
    if (text.trim().length > 0) return { text, fromSelector: true, ...none };
  }

  const text = await automatic(html, url);
  if (text.trim().length >= MIN_TEXT_CHARS) return { text, fromSelector: false, ...none };

  const $ = cheerio.load(html);
  $(BOILERPLATE).remove();
  return { text: toText($, $('body')), fromSelector: false, ...none };
}
