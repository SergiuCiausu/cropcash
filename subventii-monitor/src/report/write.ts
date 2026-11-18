import fs from 'node:fs';
import path from 'node:path';
import { REPORTS_DIR } from '../config.ts';
import type { RunStats, Store } from '../store.ts';
import { renderReport } from './daily.ts';
import { renderDigest } from './digest.ts';

/** Saves a run's report. A second run on the same day gets its own file. */
export async function writeReport(store: Store, run: RunStats, dir: string = REPORTS_DIR): Promise<string> {
  const date = run.started.slice(0, 10);
  const content = renderReport({
    date,
    checked: run.checked,
    requests: run.requests,
    bytes: run.bytes,
    pendingLinks: await store.pendingLinkCount(),
    events: await store.runEvents(run.id),
    errors: run.errors,
    problems: await store.problemSources(),
    digest: renderDigest({
      today: date,
      opportunities: await store.opportunities(),
      events: await store.runOpportunityEvents(run.id),
    }),
  });

  fs.mkdirSync(dir, { recursive: true });
  const plain = path.join(dir, `${date}.md`);
  const owner = `<!-- run ${run.id} -->`;
  const free = !fs.existsSync(plain) || fs.readFileSync(plain, 'utf8').endsWith(`${owner}\n`);
  const file = free ? plain : path.join(dir, `${date}-run${run.id}.md`);
  fs.writeFileSync(file, `${content}\n${owner}\n`);
  return file;
}
