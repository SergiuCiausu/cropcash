// The daily check of what farmers added. Pages live in their own locked table, so this
// never touches sources, source_changes or documents, which the app shows to everyone.
import { makeDiff } from './detect.ts';
import { shortDiff } from './documents.ts';
import { pageFields, type PageFields, type PageRead, type PageReader, type TextLimits } from './read-page.ts';

export interface WatchedPage {
  id: number;
  url: string;
  title: string | null;
  content_hash: string | null;
  failure_count: number;
}

export interface WatchedPagePatch extends PageFields {
  changed_at?: string;
  short_diff?: string | null;
}

export interface PageStore {
  duePages(now: Date): Promise<WatchedPage[]>;
  pageText(id: number): Promise<string | null>;
  updatePage(id: number, patch: WatchedPagePatch): Promise<void>;
}

const isChange = (page: WatchedPage, read: PageRead) =>
  (read.state === 'ok' || read.state === 'thin') && page.content_hash !== null && page.content_hash !== read.hash;

/** What a read changes on a stored page. A failed read keeps what was last read. */
export function pagePatch(page: WatchedPage, read: PageRead, limits: TextLimits, now: Date, before: string | null): WatchedPagePatch {
  const fields = pageFields(read, limits, now);
  const patch = { ...fields, failure_count: fields.failure_count && page.failure_count + 1 };
  if (!isChange(page, read)) return patch;
  const diff = makeDiff(page.title ?? page.url, before, fields.text ?? '');
  return { ...patch, changed_at: fields.checked_at, short_diff: diff ? shortDiff(diff) : null };
}

/** Logs ids and never links: what a farmer follows stays out of the run's records. */
export async function checkFarmerPages(
  store: PageStore,
  read: PageReader,
  limits: TextLimits,
  log: (message: string) => void,
  now: Date,
): Promise<{ checked: number; changed: number }> {
  const pages = await store.duePages(now);
  let changed = 0;
  for (const page of pages) {
    try {
      const result = await read(page.url);
      const before = isChange(page, result) ? await store.pageText(page.id) : null;
      const patch = pagePatch(page, result, limits, now, before);
      await store.updatePage(page.id, patch);
      if (patch.changed_at) changed += 1;
      log(`farmer page ${page.id}: ${patch.state}`);
    } catch (err) {
      log(`farmer page ${page.id} crashed: ${(err as Error).message}`);
    }
  }
  return { checked: pages.length, changed };
}
