// „De raportat” in the app (docs/04-farmer-reports.md) shows facts from docs/data/fuel-excise.json and
// the obligation events in docs/data/calendar-2026.json; /subventii shows the excise schemes in
// docs/data/excise-schemes.json (docs/accize-plan.md §5). Each lists the official pages it rests on
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
interface ExciseScheme {
  id: string;
  name_ro: string;
  status: string;
  valid_to?: string | null;
  replaces?: string | null;
  replaced_by?: string | null;
  watch_urls?: string[];
  watch_keywords?: string[];
}
export interface ExciseFile {
  schemes: ExciseScheme[];
}

/** A proposal's page moving may mean it became law, so the report says so. */
export const exciseFact = (s: Pick<ExciseScheme, 'name_ro' | 'status'>) =>
  s.status === 'propunere' ? `Acciză: ${s.name_ro} (doar propunere: verifică dacă a devenit lege)` : `Acciză: ${s.name_ro} (${s.status})`;

export const FUEL_FACTS = 'Motorina (acciza): cotele pe litru, termenele, actele, plafoanele';

export function watchMap(fuel: FuelFile, calendar: CalendarFile, excise?: ExciseFile): WatchMap {
  const map: WatchMap = new Map();
  const add = (url: string, fact: string) => {
    const k = watchKey(url);
    const facts = map.get(k) ?? [];
    if (!facts.includes(fact)) facts.push(fact);
    map.set(k, facts);
  };
  for (const url of fuel.watch_urls ?? []) add(url, FUEL_FACTS);
  for (const ev of calendar.events) for (const url of ev.watch_urls ?? []) add(url, `Termen: ${ev.title_ro}`);
  for (const s of excise?.schemes ?? []) for (const url of s.watch_urls ?? []) add(url, exciseFact(s));
  return map;
}

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

export function loadWatchMap(fuelPath: string, calendarPath: string, excisePath?: string): WatchMap {
  return watchMap(readJson(fuelPath), readJson(calendarPath), excisePath ? readJson(excisePath) : undefined);
}

export function loadExcise(excisePath: string): ExciseFile {
  return readJson(excisePath);
}

/** Every scheme's watch_keywords, once each, for spotting a relevant new link. */
export const exciseKeywords = (excise: ExciseFile) => [...new Set(excise.schemes.flatMap((s) => s.watch_keywords ?? []))];

const DAY_MS = 86_400_000;
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const roDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** How many days before valid_to a scheme with no extension is flagged. */
export const ENDING_DAYS = 30;

/** Schemes ending within ENDING_DAYS with nothing in force to follow them (a proposal doesn't count). */
export function endingSoon(excise: ExciseFile, today: string): string[] {
  const inForce = (id: string | null | undefined) => {
    const next = id ? excise.schemes.find((x) => x.id === id) : undefined;
    return !!next && next.status !== 'propunere';
  };
  const rows: string[] = [];
  for (const s of excise.schemes) {
    if (!s.valid_to || s.status === 'propunere') continue;
    const days = Math.round((Date.parse(s.valid_to) - Date.parse(today)) / DAY_MS);
    if (days < 0 || days > ENDING_DAYS) continue;
    if (inForce(s.replaced_by) || excise.schemes.some((x) => x.replaces === s.id && inForce(x.id))) continue;
    const when = days === 0 ? 'azi' : days === 1 ? 'mâine' : `peste ${days} zile`;
    rows.push(
      `- „${s.name_ro}” se termină pe ${roDate(s.valid_to)} (${when}) și nu am găsit încă o prelungire. Caută anunțul (MADR, APIA) și actualizează valid_to în docs/data/excise-schemes.json, sau adaugă schema care o înlocuiește.`,
    );
  }
  return rows;
}

/** The watched URLs missing from the spec's sources: the monitor would never read them. */
export function unwatched(map: WatchMap, specUrls: readonly string[]): string[] {
  const spec = new Set(specUrls.map(watchKey));
  return [...map.keys()].filter((k) => !spec.has(k));
}

/** A new link on a watched index page counts when it looks like it's about these obligations. */
export const RELEVANT_LINK = /motorin|acciz|decont|registr|geofoto|forț[ăa] major|forta major/i;

/** RELEVANT_LINK plus the excise schemes' own keywords. */
export function relevantLink(keywords: readonly string[] = []): RegExp {
  const extra = keywords.filter(Boolean).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return extra.length === 0 ? RELEVANT_LINK : new RegExp(`${RELEVANT_LINK.source}|${extra.join('|')}`, 'i');
}

export interface ObligationsExtra {
  /** watch_keywords from excise-schemes.json. */
  keywords?: readonly string[];
  /** endingSoon(): schemes about to end, listed whatever moved today. */
  ending?: readonly string[];
}

/** The report section: the watched pages that changed this run, and the facts to re-check. */
export function obligationsSection(events: readonly RunEvent[], map: WatchMap, extra: ObligationsExtra = {}): string[] {
  const relevant = relevantLink(extra.keywords);
  const rows: string[] = [];
  for (const e of events) {
    const facts = map.get(watchKey(e.url));
    if (!facts) continue;
    const page = `[${e.title.replaceAll(']', ')')}](${e.url})`;
    if (e.kind === 'new_link') {
      const link = JSON.parse(e.detail ?? '{}') as Partial<NewLinkDetail>;
      if (!relevant.test(`${link.text ?? ''} ${link.url ?? ''}`)) continue;
      rows.push(`- Link nou pe ${page}: [${(link.text || link.url || '').replaceAll(']', ')')}](${link.url}). De re-verificat: ${facts.join('; ')}.`);
    } else if (e.kind === 'changed' || e.kind === 'gone' || e.kind === 'returned') {
      const what = e.kind === 'changed' ? 's-a schimbat' : e.kind === 'gone' ? 'a dispărut' : 'a revenit';
      rows.push(`- ${page} ${what}. De re-verificat: ${facts.join('; ')}.`);
    }
  }
  rows.push(...(extra.ending ?? []));
  if (rows.length === 0) return [];
  return [
    `## Obligații de re-verificat (${rows.length})`,
    '',
    'Paginile de mai jos susțin ce arată aplicația în „De raportat” și la „Accize” pe Subvenții. Citește-le și actualizează docs/data/fuel-excise.json, docs/data/calendar-2026.json sau docs/data/excise-schemes.json (cifra, status, source_url).',
    '',
    ...rows,
    '',
  ];
}
