import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CALENDAR_PATH, FUEL_PATH, SPEC_PATH } from '../src/config.ts';
import { FUEL_FACTS, loadWatchMap, obligationsSection, unwatched, watchKey, watchMap } from '../src/obligations.ts';
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
    const live = loadWatchMap(FUEL_PATH, CALENDAR_PATH);
    expect(live.size).toBeGreaterThan(0);
    const spec = parseSpec(fs.readFileSync(SPEC_PATH, 'utf8')).map((s) => s.url);
    expect(unwatched(live, spec)).toEqual([]);
  });
});
