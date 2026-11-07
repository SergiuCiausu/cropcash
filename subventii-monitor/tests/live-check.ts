// Manual check against real sites: pnpm exec tsx tests/live-check.ts
// Runs the cascade twice in memory. Nothing is written to Supabase.
import { checkSource } from '../src/detect.ts';
import { loadUserAgent } from '../src/config.ts';
import { Fetcher } from '../src/fetcher.ts';
import type { Source } from '../src/store.ts';
import { installCertificates } from '../src/tls-setup.ts';
import { MemoryStore } from './memory-store.ts';

installCertificates();

const targets: [string, Source['type']][] = [
  ['https://apia.org.ro/materiale-de-informare/materiale-de-informare-anul-2026/', 'index'],
  ['https://apia.org.ro/wp-content/uploads/2026/03/Anexa-2.pdf', 'pdf'],
  ['https://www.afir.ro/instrumente/sesiuni/sesiuni-primire-proiecte/', 'index'],
  ['https://www.afir.ro/api/file/document?url=%2Fmedia%2Fgk1nhmzi%2Fghidul-solicitantului-dr-14.pdf&filename=Ghidul%20Solicitantului%20DR%2014&filetype=pdf', 'pdf'],
  ['https://www.madr.ro/proiecte-de-acte-normative.html', 'index'],
  ['https://www.madr.ro/docs/minister/masuri-de-sprijin-MADR--pentru-fermieri.pdf', 'pdf'],
  ['https://www.ansvsa.ro/legislatie/ghiduri-si-proceduri-specifice/', 'index'],
  ['https://fgcr.ro/produse/', 'index'],
  ['https://www.onvpv.ro/sites/default/files/ord_273_2020_lista_soiuri.pdf', 'pdf'],
  ['https://agriculture.ec.europa.eu/cap-my-country/cap-strategic-plans/romania_ro', 'index'],
  ['https://dajtimis.ro/', 'index'],
];

const store = new MemoryStore();
const fetcher = new Fetcher({ userAgent: loadUserAgent(), robotsCache: store.robotsCache() });
const runs: string[][] = [];

for (const pass of [1, 2]) {
  const stops: string[] = [];
  const before = fetcher.bytes;
  for (const [url, type] of targets) {
    const s = pass === 1 ? store.add(url, type) : store.sources.find((x) => x.url === url)!;
    stops.push(await checkSource(store.get(s.id), { store, fetcher, runId: pass, now: new Date() }));
  }
  runs.push(stops);
  console.log(`pass ${pass}: ${((fetcher.bytes - before) / 1024).toFixed(0)} KB, ${fetcher.requests} requests so far`);
}

targets.forEach(([url], i) => {
  const s = store.sources[i]!;
  const text = store.snapshots.find((x) => x.sourceId === s.id)?.text ?? '';
  console.log(`\n${runs[0]![i]} -> ${runs[1]![i]} | ${s.state} | ${text.length} chars | ${url.slice(0, 75)}`);
  console.log('   ' + text.replaceAll('\n', ' / ').slice(0, 230));
});
const changed = store.events.filter((e) => e.kind !== 'baseline');
console.log('\nnon-baseline events:', JSON.stringify(changed));
