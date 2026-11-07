/* After `next build`: writes out/sw.js, the service worker that keeps the app on the phone.
   Same worker as farm-app (lib/live/service-worker.mjs), over the exported files, plus each page
   under its route (/salariu as well as salariu.html), because that is the address people open. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cacheList, swSource, versionOf } from '../lib/live/service-worker.mjs';

/** Every exported file, and the route each page answers to. */
export function webCacheList(root) {
  const files = cacheList(root).filter((f) => !/^(404|_not-found)\.html$/.test(f) && !f.startsWith('_not-found/'));
  const routes = files.filter((f) => f.endsWith('.html') && !f.includes('/')).map((f) => (f === 'index.html' ? './' : f.slice(0, -5)));
  return { files, cached: [...files, ...routes] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = fileURLToPath(new URL('../out/', import.meta.url));
  const { files, cached } = webCacheList(out);
  writeFileSync(`${out}sw.js`, swSource(cached, versionOf(out, files)));
  console.log(`web: wrote out/sw.js with ${cached.length} entries`);
}
