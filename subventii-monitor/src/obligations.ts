// „De raportat” in the app (docs/04-farmer-reports.md) shows facts from docs/data/fuel-excise.json and
// the obligation events in docs/data/calendar-2026.json. Each lists the official pages it rests on
// (`watch_urls`). When one of those pages changes, the daily report says which facts to re-check, so a
// person updates the JSON. Nothing is stored: the files stay the only place the facts live.
import fs from 'node:fs';
import type { RunEvent } from './store.ts';
import type { NewLinkDetail } from './report/daily.ts';

/** URL → the facts that rest on it, in Romanian, as the report lists them. */
export type WatchMap = Map<string, string[]>;

/** Trailing slashes and case of the host don't make another page. */
export const watchKey = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return url.replace(/\/+$/, '');
  }
};

interface FuelFile {
  watch_urls?: string[];
}
interface CalendarFile {
  events: { title_ro: string; watch_urls?: string[] }[];
}

export const FUEL_FACTS = 'Motorina (acciza): cotele pe litru, termenele, actele, plafoanele';

export function watchMap(fuel: FuelFile, calendar: CalendarFile): WatchMap {
  const map: WatchMap = new Map();
  const add = (url: string, fact: string) => {
    const k = watchKey(url);
    const facts = map.get(k) ?? [];
    if (!facts.includes(fact)) facts.push(fact);
    map.set(k, facts);
  };
  for (const url of fuel.watch_urls ?? []) add(url, FUEL_FACTS);
  for (const ev of calendar.events) for (const url of ev.watch_urls ?? []) add(url, `Termen: ${ev.title_ro}`);
  return map;
}

export function loadWatchMap(fuelPath: string, calendarPath: string): WatchMap {
  const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
  return watchMap(read(fuelPath), read(calendarPath));
}

/** The watched URLs missing from the spec's sources: the monitor would never read them. */
export function unwatched(map: WatchMap, specUrls: readonly string[]): string[] {
  const spec = new Set(specUrls.map(watchKey));
  return [...map.keys()].filter((k) => !spec.has(k));
}

/** A new link on a watched index page counts when it looks like it's about these obligations. */
export const RELEVANT_LINK = /motorin|acciz|decont|registr|geofoto|forț[ăa] major|forta major/i;

/** The report section: the watched pages that changed this run, and the facts to re-check. */
export function obligationsSection(events: readonly RunEvent[], map: WatchMap): string[] {
  const rows: string[] = [];
  for (const e of events) {
    const facts = map.get(watchKey(e.url));
    if (!facts) continue;
    const page = `[${e.title.replaceAll(']', ')')}](${e.url})`;
    if (e.kind === 'new_link') {
      const link = JSON.parse(e.detail ?? '{}') as Partial<NewLinkDetail>;
      if (!RELEVANT_LINK.test(`${link.text ?? ''} ${link.url ?? ''}`)) continue;
      rows.push(`- Link nou pe ${page}: [${(link.text || link.url || '').replaceAll(']', ')')}](${link.url}). De re-verificat: ${facts.join('; ')}.`);
    } else if (e.kind === 'changed' || e.kind === 'gone' || e.kind === 'returned') {
      const what = e.kind === 'changed' ? 's-a schimbat' : e.kind === 'gone' ? 'a dispărut' : 'a revenit';
      rows.push(`- ${page} ${what}. De re-verificat: ${facts.join('; ')}.`);
    }
  }
  if (rows.length === 0) return [];
  return [
    `## Obligații de re-verificat (${rows.length})`,
    '',
    'Paginile de mai jos susțin ce arată aplicația în „De raportat”. Citește-le și actualizează docs/data/fuel-excise.json sau docs/data/calendar-2026.json (cifra, status, source_url).',
    '',
    ...rows,
    '',
  ];
}
