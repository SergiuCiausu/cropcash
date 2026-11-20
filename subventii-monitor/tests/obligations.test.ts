import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CALENDAR_PATH, EXCISE_PATH, FUEL_PATH, SPEC_PATH } from '../src/config.ts';
import { endingSoon, exciseFact, exciseKeywords, type ExciseFile, FUEL_FACTS, loadExcise, loadWatchMap, obligationsSection, unwatched, watchKey, watchMap } from '../src/obligations.ts';
import { renderReport } from '../src/report/daily.ts';
import { parseSpec } from '../src/seed.ts';
import type { RunEvent } from '../src/store.ts';

const event = (overrides: Partial<RunEvent>): RunEvent => ({
  kind: 'changed',
  detail: null,
  title: 'Pagina',
  url: 'https://example.ro/',
  institution: 'APIA',
  diff: null,
  ...overrides,
});

const map = watchMap(
  { watch_urls: ['https://legislatie.just.ro/Public/DetaliiDocument/164301', 'https://apia.org.ro/comunicate-de-presa'] },
  { events: [{ title_ro: 'Depui decontul DR-06', watch_urls: ['https://apia.org.ro/comunicate-de-presa/'] }, { title_ro: 'Fără surse' }] },
);

describe('the obligations the daily report watches', () => {
  it('maps each watched page to every fact that rests on it, whatever its trailing slash', () => {
    expect(map.get(watchKey('https://apia.org.ro/comunicate-de-presa/'))).toEqual([FUEL_FACTS, 'Termen: Depui decontul DR-06']);
    expect(map.size).toBe(2);
  });

  it('lists a watched page that changed, went or came back, with what to re-check', () => {
    const lines = obligationsSection(
      [
        event({ url: 'https://legislatie.just.ro/Public/DetaliiDocument/164301', title: 'HG 1174/2014' }),
        event({ kind: 'gone', url: 'https://apia.org.ro/comunicate-de-presa', title: 'Comunicate' }),
        event({ url: 'https://apia.org.ro/altceva', title: 'Nu e urmărită' }),
        event({ kind: 'baseline', url: 'https://legislatie.just.ro/Public/DetaliiDocument/164301' }),
      ],
      map,
    );
    expect(lines[0]).toBe('## Obligații de re-verificat (2)');
    expect(lines.join('\n')).toContain(`[HG 1174/2014](https://legislatie.just.ro/Public/DetaliiDocument/164301) s-a schimbat. De re-verificat: ${FUEL_FACTS}.`);
    expect(lines.join('\n')).toContain('a dispărut');
    expect(lines.join('\n')).not.toContain('Nu e urmărită');
  });

  it('lists a new link on a watched page only when it is about these obligations', () => {
    const link = (text: string) =>
      event({ kind: 'new_link', url: 'https://apia.org.ro/comunicate-de-presa', detail: JSON.stringify({ url: `https://apia.org.ro/${text}`, text, score: 1, isDocument: false, versionOf: null }) });
    const lines = obligationsSection([link('Ajutor de stat pentru motorina 2027'), link('Ziua porților deschise')], map);
    expect(lines[0]).toBe('## Obligații de re-verificat (1)');
    expect(lines.join('\n')).toContain('Ajutor de stat pentru motorina 2027');
  });

  it('adds nothing when no watched page moved, so a quiet day still reads „Nu s-a schimbat nimic”', () => {
    const obligations = obligationsSection([event({ url: 'https://apia.org.ro/altceva' })], map);
    expect(obligations).toEqual([]);
    const quiet = renderReport({ date: '2026-11-20', checked: 1, requests: 1, bytes: 0, pendingLinks: 0, events: [], obligations });
    expect(quiet).toContain('Nu s-a schimbat nimic.');
  });

  it('puts the section right after the digest', () => {
    const obligations = obligationsSection([event({ url: 'https://legislatie.just.ro/Public/DetaliiDocument/164301', title: 'HG' })], map);
    const report = renderReport({
      date: '2026-11-20',
      checked: 1,
      requests: 1,
      bytes: 0,
      pendingLinks: 0,
      events: [event({ url: 'https://legislatie.just.ro/Public/DetaliiDocument/164301', title: 'HG' })],
      digest: ['## Pentru fermieri', ''],
      obligations,
    });
    expect(report.indexOf('## Pentru fermieri')).toBeLessThan(report.indexOf('## Obligații de re-verificat'));
    expect(report.indexOf('## Obligații de re-verificat')).toBeLessThan(report.indexOf('## Surse modificate'));
  });

  it('watches only pages the monitor reads: every watch_url in docs/data is a source in the spec', () => {
    const live = loadWatchMap(FUEL_PATH, CALENDAR_PATH, EXCISE_PATH);
    expect(live.size).toBeGreaterThan(0);
    const spec = parseSpec(fs.readFileSync(SPEC_PATH, 'utf8')).map((s) => s.url);
    expect(unwatched(live, spec)).toEqual([]);
  });
});

describe('the excise schemes the daily report watches (docs/accize-plan.md §5)', () => {
  const excise: ExciseFile = {
    schemes: [
      { id: 'refund', name_ro: 'Banii înapoi', status: 'confirmat-2026', valid_to: '2026-12-31', watch_urls: ['https://legislatie.just.ro/Public/DetaliiDocument/164301'], watch_keywords: ['motorin'] },
      { id: 'pump', name_ro: 'La pompă', status: 'propunere', valid_to: null, replaces: 'refund', watch_urls: ['https://www.madr.ro/proiecte-de-acte-normative.html'], watch_keywords: ['tichet'] },
      { id: 'tuica', name_ro: 'Țuică', status: 'confirmat-2026', valid_to: null, watch_urls: ['https://legislatie.just.ro/Public/DetaliiDocument/171282'], watch_keywords: ['țuic', 'rachiu'] },
    ],
  };
  const both = watchMap({ watch_urls: ['https://legislatie.just.ro/Public/DetaliiDocument/164301'] }, { events: [] }, excise);

  it('adds each scheme to the pages it rests on, next to the diesel facts', () => {
    expect(both.get(watchKey('https://legislatie.just.ro/Public/DetaliiDocument/164301'))).toEqual([FUEL_FACTS, 'Acciză: Banii înapoi (confirmat-2026)']);
    expect(both.get(watchKey('https://legislatie.just.ro/Public/DetaliiDocument/171282'))).toEqual(['Acciză: Țuică (confirmat-2026)']);
  });

  it('says a proposal whose page moved may have become law', () => {
    expect(exciseFact({ name_ro: 'La pompă', status: 'propunere' })).toContain('verifică dacă a devenit lege');
    const lines = obligationsSection([event({ url: 'https://www.madr.ro/proiecte-de-acte-normative.html', title: 'MADR proiecte' })], both).join('\n');
    expect(lines).toContain('De re-verificat: Acciză: La pompă (doar propunere: verifică dacă a devenit lege).');
    expect(lines).toContain('docs/data/excise-schemes.json');
  });

  it("counts a new link with a scheme's keyword, which the old pattern missed", () => {
    const link = event({ kind: 'new_link', url: 'https://www.madr.ro/proiecte-de-acte-normative.html', detail: JSON.stringify({ url: 'https://www.madr.ro/x.pdf', text: 'HG privind tichetele pentru fermieri', score: 1, isDocument: true, versionOf: null }) });
    expect(obligationsSection([link], both)).toEqual([]);
    expect(obligationsSection([link], both, { keywords: exciseKeywords(excise) })[0]).toBe('## Obligații de re-verificat (1)');
  });

  it('flags a scheme 30 days before it ends when nothing in force follows it, even on a quiet day', () => {
    expect(endingSoon(excise, '2026-11-30')).toEqual([]); // 31 days
    const rows = endingSoon(excise, '2026-12-01');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('„Banii înapoi” se termină pe 31 decembrie 2026 (peste 30 zile)');
    expect(endingSoon(excise, '2026-12-31')[0]).toContain('(azi)');
    expect(endingSoon(excise, '2027-01-01')).toEqual([]);
    // the proposal replacing it doesn't count; a scheme in force does
    const extended = { schemes: [...excise.schemes, { id: 'refund-2027', name_ro: 'Banii înapoi 2027', status: 'confirmat-2026', valid_to: '2027-12-31', replaces: 'refund' }] };
    expect(endingSoon(extended, '2026-12-01')).toEqual([]);
    const section = obligationsSection([], both, { ending: rows });
    expect(section[0]).toBe('## Obligații de re-verificat (1)');
  });

  it('reads the real catalogue: every scheme with pages is watched, and nothing ends within 30 days of 20 Nov 2026', () => {
    const real = loadExcise(EXCISE_PATH);
    const live = loadWatchMap(FUEL_PATH, CALENDAR_PATH, EXCISE_PATH);
    for (const s of real.schemes) for (const url of s.watch_urls ?? []) expect(live.get(watchKey(url))).toContain(exciseFact(s));
    expect(endingSoon(real, '2026-11-20')).toEqual([]);
    expect(endingSoon(real, '2026-12-15')[0]).toContain('se termină pe 31 decembrie 2026');
  });
});
