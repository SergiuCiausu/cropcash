import { describe, expect, it } from 'vitest';
import { cacheList, swSource, versionOf } from './service-worker.mjs';

/* The farm-app folder, as a plain path on any system (no Node types in this package). */
const root = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');

describe('the service worker', () => {
  const files = cacheList(root);

  it('keeps every page and what it loads', () => {
    for (const f of ['subsidies/salariu.html', 'subsidies/app.js', 'subsidies/engine.js', 'subsidies/subsidies.css', 'desktop/2-rail.html', 'mobile/shared.js', 'vendor/Recharts.js']) {
      expect(files, f).toContain(f);
    }
  });

  it('leaves out sources, build scripts and itself', () => {
    expect(files.some((f) => f.endsWith('.ts') || f.endsWith('.mjs') || f.startsWith('live/') || f === 'sw.js' || f.includes('node_modules'))).toBe(false);
  });

  it('changes version only when a file changes', () => {
    expect(versionOf(root, files)).toBe(versionOf(root, files));
    expect(versionOf(root, files.slice(1))).not.toBe(versionOf(root, files));
  });

  it('writes a script that parses, with the list in it', () => {
    const source = swSource(['subsidies/app.js'], 'abc');
    expect(() => new Function(source)).not.toThrow();
    expect(source).toContain("'cropcash-farm-abc'");
    expect(source).toContain('["subsidies/app.js"]');
  });
});
