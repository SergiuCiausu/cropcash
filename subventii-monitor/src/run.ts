import PQueue from 'p-queue';
import { checkSource, type Stop } from './detect.ts';
import { checkFarmerPages, type PageStore } from './farmer-pages.ts';
import { Fetcher } from './fetcher.ts';
import { refreshStatuses, syncOpportunities } from './opportunities/sync.ts';
import type { Draft } from './opportunities/types.ts';
import type { PageReader, TextLimits } from './read-page.ts';
import type { Source, Store } from './store.ts';

const HOST_CONCURRENCY = 10;
export const MAX_NEW_SOURCES_PER_RUN = 25;

export interface RunSummary {
  runId: number;
  checked: number;
  requests: number;
  bytes: number;
  stops: Record<string, number>;
  newSources: number;
  errors: string[];
}

/** Reads calls that don't come from a monitored page. It must throw on failure. */
export type FetchCalls = () => Promise<Draft[]>;

/** The pages farmers added, checked apart from the official sources. */
export interface FarmerPages {
  store: PageStore;
  read: PageReader;
  limits: TextLimits;
}

/** An empty answer is treated as a failure, or every stored call would close. */
async function syncEuCalls(store: Store, fetchCalls: FetchCalls, runId: number, today: string): Promise<void> {
  const calls = await fetchCalls();
  if (calls.length === 0) throw new Error('EC API returned no open or upcoming calls');
  await syncOpportunities(store, 'ec', calls, runId, today);
}

/** Turns the best waiting links into sources, which the next run will check. */
async function promoteLinks(store: Store, log: (message: string) => void): Promise<number> {
  let added = 0;
  for (const link of await store.pendingLinks(MAX_NEW_SOURCES_PER_RUN)) {
    try {
      await store.addDiscoveredSource(link);
      added += 1;
    } catch (err) {
      log(`could not add ${link.url}: ${(err as Error).message}`);
    }
  }
  return added;
}

/** Checks every due source, one request at a time per host, and records the run. */
export async function runChecks(
  store: Store,
  fetcher: Fetcher,
  log: (message: string) => void = console.log,
  now: Date = new Date(),
  fetchCalls?: FetchCalls,
  farmerPages?: FarmerPages,
): Promise<RunSummary> {
  const sources = await store.dueSources(now);
  const runId = await store.startRun('daily');

  const byHost = new Map<string, Source[]>();
  for (const s of sources) {
    const host = new URL(s.url).hostname;
    byHost.set(host, [...(byHost.get(host) ?? []), s]);
  }
  log(`Checking ${sources.length} due sources on ${byHost.size} hosts`);

  const stops: Record<string, number> = {};
  const count = (stop: Stop | 'crashed') => {
    stops[stop] = (stops[stop] ?? 0) + 1;
  };

  let done = 0;
  const queue = new PQueue({ concurrency: HOST_CONCURRENCY });
  for (const group of byHost.values()) {
    void queue.add(async () => {
      for (const source of group) {
        done += 1;
        try {
          const stop = await checkSource(source, { store, fetcher, runId, now });
          count(stop);
          log(`[${done}/${sources.length}] ${stop} ${source.url}`);
        } catch (err) {
          // One bad source must not end the run for the others.
          count('crashed');
          log(`[${done}/${sources.length}] crashed ${source.url}: ${(err as Error).message}`);
        }
      }
    });
  }
  await queue.onIdle();

  const newSources = await promoteLinks(store, log);

  const errors: string[] = [];
  const today = now.toISOString().slice(0, 10);
  const attempt = async (name: string, step: () => Promise<void>) => {
    try {
      await step();
    } catch (err) {
      errors.push(`${name}: ${(err as Error).message}`);
      log(`${name} failed: ${(err as Error).message}`);
    }
  };
  if (fetchCalls) await attempt('Apeluri UE', () => syncEuCalls(store, fetchCalls, runId, today));
  await attempt('Actualizare stare apeluri', () => refreshStatuses(store, runId, today));
  if (farmerPages) {
    await attempt('Surse adăugate de fermieri', async () => {
      const { checked, changed } = await checkFarmerPages(farmerPages.store, farmerPages.read, farmerPages.limits, log, now);
      log(`Farmer pages: ${checked} checked, ${changed} changed`);
    });
  }

  await store.finishRun(runId, { requests: fetcher.requests, bytes: fetcher.bytes, stops, errors });
  return { runId, checked: sources.length, requests: fetcher.requests, bytes: fetcher.bytes, stops, newSources, errors };
}
