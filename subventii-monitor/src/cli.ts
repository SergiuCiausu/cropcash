import fs from 'node:fs';
import { PARAMS_PATH, SPEC_PATH, loadSupabase, loadUserAgent } from './config.ts';
import { Fetcher } from './fetcher.ts';
import { fetchEcCalls } from './opportunities/ec-api.ts';
import { writeReport } from './report/write.ts';
import { pageReader } from './read-page.ts';
import { runChecks } from './run.ts';
import { parseSpec } from './seed.ts';
import { SupabaseStore } from './supabase-store.ts';
import { CERTS_PATH, installCertificates } from './tls-setup.ts';

installCertificates();
const { url, secretKey } = loadSupabase();
const store = new SupabaseStore(url, secretKey);
const command = process.argv[2];

async function report(runId?: number): Promise<void> {
  const run = await store.runStats(runId);
  if (!run) throw new Error('No finished run to report on.');
  console.log(`Report written to ${await writeReport(store, run)}`);
}

if (command === 'seed') {
  const sources = parseSpec(fs.readFileSync(SPEC_PATH, 'utf8'));
  await store.upsertSources(sources);
  console.log(`Parsed ${sources.length} sources from the spec; ${await store.countSources()} in the database`);
} else if (command === 'run') {
  const userAgent = loadUserAgent();
  const fetcher = new Fetcher({ userAgent, robotsCache: store.robotsCache() });
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const { sources: p } = JSON.parse(fs.readFileSync(PARAMS_PATH, 'utf8'));
  const ca = fs.existsSync(CERTS_PATH) ? fs.readFileSync(CERTS_PATH, 'utf8') : undefined;
  const read = pageReader({
    userAgent, ca, maxBytes: p.max_mb.value * 1024 * 1024, timeoutMs: p.read_timeout_s.value * 1000,
    deadlineMs: p.monitor_deadline_s.value * 1000, retries: 1,
  });
  const limits = { previewChars: p.preview_chars.value, textChars: p.text_chars.value };
  const summary = await runChecks(store, fetcher, console.log, now, () => fetchEcCalls(userAgent, today), { store, read, limits });
  console.log(JSON.stringify(summary, null, 2));
  await report(summary.runId);
} else if (command === 'documents') {
  // Fills the app's search from text already stored. Fetches nothing from the sources.
  const sources = await store.sourcesWithText();
  for (const [i, source] of sources.entries()) {
    const text = await store.latestText(source.id);
    if (text) await store.saveDocument(source, text);
    console.log(`[${i + 1}/${sources.length}] ${source.title}`);
  }
} else if (command === 'report') {
  await report(process.argv[3] ? Number(process.argv[3]) : undefined);
} else {
  console.error('Usage: tsx src/cli.ts <seed|run|documents|report [runId]>');
  process.exitCode = 1;
}
