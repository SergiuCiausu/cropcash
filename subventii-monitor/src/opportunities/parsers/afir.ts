// AFIR's portal lists each active session with its dates and budget. The amount
// already applied for changes constantly, so it is deliberately left out.
import * as cheerio from 'cheerio';
import type { Draft } from '../types.ts';

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Turns 06/10/2026 09:00:00 into 2026-10-06. */
export function afirDate(text: string): string | null {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function slug(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function parseAfirSessions(html: string, url: string): Draft[] {
  const $ = cheerio.load(html);
  const drafts = new Map<string, Draft>();

  $('.row.gy-4').each((_, element) => {
    const grid = $(element);
    const code = clean(grid.find('.cod-descriere-alocare').first().text());
    if (!code) return;

    const value = (label: string) => {
      const title = grid.find('.titlu-container').filter((__, t) => clean($(t).text()).startsWith(label)).first();
      return clean(title.next().text());
    };
    const description = grid.find('.cod-descriere-alocare').first().next();
    const name = clean(description.find('b').first().text()) || clean(description.text());
    const component = clean(description.find('.fw-normal').first().text()).replace(/^-\s*/, '');
    const openDate = afirDate(value('DATĂ ȘI ORĂ LANSARE'));
    const deadline = afirDate(value('DATĂ ȘI ORĂ ÎNCHIDERE'));
    const budget = Number.parseFloat(value('ALOCARE FINANCIARĂ').replace(/[^\d.]/g, ''));

    const stableKey = `afir:${code}:${openDate ?? 'fara-data'}:${slug(component) || 'general'}`;
    drafts.set(stableKey, {
      stableKey,
      kind: 'afir',
      programme: 'PS PAC 2023-2027',
      title: `${code}: ${name}${component ? ` – ${component}` : ''}`,
      sourceState: null,
      openDate,
      deadline,
      budgetEur: Number.isFinite(budget) ? budget : null,
      applicants: null,
      region: 'Național',
      url,
      confidence: openDate && deadline ? 'high' : 'low',
      evidence: clean(grid.text()).slice(0, 500),
    });
  });
  return [...drafts.values()];
}
