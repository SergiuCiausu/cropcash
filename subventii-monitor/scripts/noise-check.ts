// Finds pages whose extracted text changes when nothing real happened.
//
//   npm run noise-check -- fetch first     saves every HTML source's raw page
//   npm run noise-check -- fetch second    same again, some minutes later
//   npm run noise-check -- compare first second
//
// Comparing re-runs extraction on the saved pages, so selectors can be tuned
// without sending the sites any more requests.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SPEC_PATH, loadUserAgent } from '../src/config.ts';
import { MIN_TEXT_CHARS, decodeHtml, extractHtml } from '../src/extract/html.ts';
import { selectorFor } from '../src/extract/selectors.ts';
import { Fetcher } from '../src/fetcher.ts';
import { normalize, sha256 } from '../src/normalize.ts';
import { parseSpec, type SeedSource } from '../src/seed.ts';
import { installCertificates } from '../src/tls-setup.ts';

interface Saved {
  url: string;
  title: string;
  institution: string;
  file: string | null;
  contentType: string | null;
  outcome: string;
}

const dirFor = (label: string) => path.join(ROOT, 'data', 'noise', label);
const indexFor = (label: string) => path.join(dirFor(label), 'index.json');

async function fetchAll(label: string): Promise<void> {
  installCertificates();
  fs.mkdirSync(dirFor(label), { recursive: true });
  const sources = parseSpec(fs.readFileSync(SPEC_PATH, 'utf8')).filter((s) => s.type !== 'pdf');
  const byHost = new Map<string, SeedSource[]>();
  for (const s of sources) {
    const host = new URL(s.url).hostname;
    byHost.set(host, [...(byHost.get(host) ?? []), s]);
  }

  const fetcher = new Fetcher({ userAgent: loadUserAgent() });
  const saved: Saved[] = [];
  await Promise.all([...byHost.values()].map(async (group) => {
    for (const s of group) {
      const r = await fetcher.get(s.url);
      const file = r.body ? `${sha256(s.url).slice(0, 16)}.html` : null;
      if (file && r.body) fs.writeFileSync(path.join(dirFor(label), file), r.body);
      saved.push({
        url: s.url, title: s.title, institution: s.institution, file, contentType: r.contentType, outcome: r.outcome,
      });
      console.log(`[${saved.length}/${sources.length}] ${r.outcome} ${s.url}`);
    }
  }));
  fs.writeFileSync(indexFor(label), JSON.stringify(saved, null, 1));
}

async function textOf(label: string, s: Saved): Promise<string> {
  const body = fs.readFileSync(path.join(dirFor(label), s.file!));
  return normalize((await extractHtml(decodeHtml(body, s.contentType), s.url)).text);
}

async function compare(a: string, b: string): Promise<void> {
  const first = JSON.parse(fs.readFileSync(indexFor(a), 'utf8')) as Saved[];
  const second = new Map((JSON.parse(fs.readFileSync(indexFor(b), 'utf8')) as Saved[]).map((s) => [s.url, s]));

  const noisy: string[] = [];
  const thin: string[] = [];
  const failed: string[] = [];
  const hosts = new Map<string, { pages: number; chars: number; selector: boolean }>();
  let compared = 0;

  for (const s of first) {
    const other = second.get(s.url);
    if (!s.file || !other?.file) {
      failed.push(`- ${s.title}: ${s.outcome} / ${other?.outcome ?? 'missing'}`);
      continue;
    }
    compared += 1;
    const [x, y] = [await textOf(a, s), await textOf(b, other)];
    const host = new URL(s.url).hostname.replace(/^www\./, '');
    const entry = hosts.get(host) ?? { pages: 0, chars: 0, selector: Boolean(selectorFor(s.url)) };
    hosts.set(host, { ...entry, pages: entry.pages + 1, chars: entry.chars + x.length });

    if (x.length < MIN_TEXT_CHARS && !selectorFor(s.url)) thin.push(`- ${s.title} (${x.length} chars): ${s.url}`);
    if (x !== y) {
      const before = new Set(x.split('\n'));
      const after = new Set(y.split('\n'));
      const removed = [...before].filter((l) => !after.has(l)).slice(0, 3);
      const added = [...after].filter((l) => !before.has(l)).slice(0, 3);
      noisy.push([
        `### ${s.title}`, s.url, '',
        ...removed.map((l) => `- \`- ${l.slice(0, 140)}\``),
        ...added.map((l) => `- \`+ ${l.slice(0, 140)}\``), '',
      ].join('\n'));
    }
  }

  const rows = [...hosts.entries()].sort((p, q) => q[1].pages - p[1].pages)
    .map(([h, v]) => `| ${h} | ${v.pages} | ${Math.round(v.chars / v.pages)} | ${v.selector ? 'yes' : 'no'} |`);
  const report = [
    `# Noise check: ${a} vs ${b}`, '',
    `- Pages compared: ${compared}`,
    `- Noisy (text differs): ${noisy.length}`,
    `- Thin, without a selector: ${thin.length}`,
    `- Not compared: ${failed.length}`, '',
    '## Noisy pages', '', ...noisy, '',
    '## Thin pages', '', ...thin, '',
    '## Not compared', '', ...failed, '',
    '## Hosts', '', '| Host | Pages | Average chars | Selector |', '| --- | --- | --- | --- |', ...rows, '',
  ].join('\n');

  const file = path.join(ROOT, 'reports', `noise-check-${new Date().toISOString().slice(0, 10)}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, report);
  console.log(`compared ${compared}, noisy ${noisy.length}, thin ${thin.length}, not compared ${failed.length}`);
  console.log(`Report written to ${file}`);
}

const [command, a, b] = process.argv.slice(2);
if (command === 'fetch' && a) {
  await fetchAll(a);
} else if (command === 'compare' && a && b) {
  await compare(a, b);
} else {
  console.error('Usage: npm run noise-check -- fetch <label> | compare <labelA> <labelB>');
  process.exitCode = 1;
}
