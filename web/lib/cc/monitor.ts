/* Funding calls and official sources (web/legacy/app.js, "Funding calls" and "Following").
   Signed in, they come from the monitor through the F6 reads, and a copy stays on the phone so the
   pages open offline with that copy's date. In the demo, the 7 Nov snapshot stands in. */
import { todayInRomania } from '../../../packages/shared/src/cashflow/dates';
import { callsFromServer, eventsFromServer, problemsOf, sourcesFromServer, type PageCall, type PageSource } from '../live/monitor';
import type { MeFarm } from './farm';
import { KEYS, readJson, writeJson, type KeyStore } from './storage';

export type { PageCall, PageSource };
export type CallEvent = ReturnType<typeof eventsFromServer>[number];
export type SourceProblem = ReturnType<typeof problemsOf>[number];

export interface MonitorCopy {
  savedAt: string;
  /** The day the copy was read, for "Date din …". */
  at: string;
  calls: PageCall[];
  events: CallEvent[];
  sources: PageSource[];
  changes: unknown[];
}

/** The snapshot files (data-calls.js, data-sources.js), for the demo and before the first read. */
export interface MonitorSnapshot {
  at: string | null;
  calls: PageCall[];
  events: CallEvent[];
  sources: PageSource[];
  problems: SourceProblem[];
}

export const EMPTY_SNAPSHOT: MonitorSnapshot = { at: null, calls: [], events: [], sources: [], problems: [] };

/** A copy is read again after an hour, and only on the pages that show it. */
export const MONITOR_FRESH_MS = 60 * 60 * 1000;

export function savedMonitor(store: KeyStore): MonitorCopy | null {
  const v = readJson<MonitorCopy>(store, KEYS.monitor);
  return v && Array.isArray(v.calls) ? v : null;
}

/** What the pages read, from the copy when there is one, otherwise from the snapshot. */
export function monitorView(copy: MonitorCopy | null, snapshot: MonitorSnapshot) {
  return {
    fromServer: !!copy,
    at: copy?.at ?? snapshot.at,
    calls: copy?.calls ?? snapshot.calls,
    events: copy?.events ?? snapshot.events,
    sources: copy?.sources ?? snapshot.sources,
    problems: copy ? problemsOf(copy.sources) : snapshot.problems,
    /* The snapshot has no real change yet, so without a copy there are none to show. */
    changes: copy?.changes ?? [],
  };
}
export type MonitorView = ReturnType<typeof monitorView>;

export const isFresh = (copy: MonitorCopy | null, now: number) => !!copy && now - Date.parse(copy.savedAt) < MONITOR_FRESH_MS;

type Read = (name: string, input: unknown) => Promise<{ data?: unknown[] | null }>;

/**
 * Reads the four parts and saves a new copy. Each part on its own: one table missing on the server
 * keeps the rest. Returns null when nothing new was saved (no calls, or storage refused).
 */
export async function fetchMonitor(read: Read, store: KeyStore, before: MonitorCopy | null, snapshot: MonitorSnapshot, now: Date): Promise<MonitorCopy | null> {
  const part = <T>(name: string, shape: (rows: never[]) => T, fallback: T) =>
    read(name, {}).then(
      (r) => shape((r.data ?? []) as never[]),
      () => fallback,
    );
  const [calls, events, sources, changes] = await Promise.all([
    part('search_opportunities', callsFromServer, before?.calls ?? null),
    part('list_opportunity_changes', eventsFromServer, before?.events ?? []),
    part('list_sources', sourcesFromServer, before?.sources ?? null),
    part('list_recent_changes', (rows: unknown[]) => rows, before?.changes ?? []),
  ]);
  if (!calls) return null;
  const copy: MonitorCopy = { savedAt: now.toISOString(), at: todayInRomania(now), calls, events, sources: sources ?? snapshot.sources, changes };
  return writeJson(store, KEYS.monitor, copy) ? copy : null;
}

/** True when the pages would show something different. */
export const monitorChanged = (a: MonitorCopy | null, b: MonitorCopy | null) =>
  JSON.stringify(a && [a.calls, a.events, a.sources, a.changes]) !== JSON.stringify(b && [b.calls, b.events, b.sources, b.changes]);

/* ---- Calls, shared by Oportunități and Calendar ---- */
export const callCode = (c: Pick<PageCall, 'title'>) => (c.title.match(/^DR-\d+/) || [null])[0];
export const VARIANT = /\s*(?:[-–]\s*(?:MDR|LDR|Adulți|Tineri)|,\s*pentru regiunile mai dezvoltate)\s*$/;
const sectorOf = (t: string) => (/LEGUMICULTUR/.test(t) ? 'legume' : /ZOOTEHNIC/.test(t) ? 'animale' : 'alte sectoare');

/** Short names. The official title stays in the call's detail. */
export function callName(c: Pick<PageCall, 'title'>): string {
  const t = c.title;
  const id = callCode(c);
  if (id === 'DR-14') return `DR-14: Ferme mici, ${sectorOf(t)}`;
  if (id === 'DR-12') return `DR-12: Tineri fermieri, ${sectorOf(t)}`;
  if (id === 'DR-18') return 'DR-18: Flori și plante medicinale';
  if (/^STEP-AGRI/.test(t)) return 'STEP-AGRI: Competențe digitale în agricultură';
  const plain = t.replace(VARIANT, '').replace(/,?\s+în cadrul Acțiunii.*$/, '').replace(/[”“"]/g, '').trim();
  const letters = plain.replace(/[^\p{L}]/gu, '');
  const caps = letters.replace(/[^\p{Lu}]/gu, '').length;
  if (caps / letters.length < 0.7) return plain;
  const low = plain.toLocaleLowerCase('ro');
  return low[0].toLocaleUpperCase('ro') + low.slice(1);
}

/**
 * The calls in the calendar. Signed in, the farm keeps each one's title and deadline, so a call
 * that left the list still shows. Otherwise, the followed keys found in today's list.
 */
export function followedCalls(meSaved: MeFarm | null, follows: string[], calls: PageCall[]) {
  if (!meSaved) {
    const set = new Set(follows);
    return calls.filter((c) => set.has(c.key));
  }
  const byKey = new Map(calls.map((c) => [c.key, c]));
  return (meSaved.opportunity_follows ?? [])
    .map((f) => {
      const c = byKey.get(f.stable_key);
      return { ...c, key: f.stable_key, title: f.opportunities?.title ?? c?.title, deadline: f.opportunities?.deadline ?? c?.deadline ?? null, url: f.opportunities?.url ?? c?.url };
    })
    .filter((c) => c.title);
}
