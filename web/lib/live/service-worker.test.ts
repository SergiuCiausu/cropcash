import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { swSource, versionOf } from './service-worker.mjs';
import { webCacheList } from '../../scripts/write-sw.mjs';

/* A small copy of what `next build` writes to web/out. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cc-out-'));
  for (const f of ['index.html', 'salariu.html', '404.html', '_not-found.html', '_next/static/chunks/a.js', '_next/static/css/b.css', 'img/harvest-1200.jpg', 'notifications.css', 'sw.js', 'salariu.txt']) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), f);
  }
  return root;
}

describe('the service worker for web/out', () => {
  const root = fixture();
  const { files, cached } = webCacheList(root);

  it('keeps every page, script, style and image', () => {
    for (const f of ['index.html', 'salariu.html', '_next/static/chunks/a.js', '_next/static/css/b.css', 'img/harvest-1200.jpg', 'notifications.css']) expect(files, f).toContain(f);
  });

  it('keeps each page under its route too', () => {
    expect(cached).toContain('salariu');
    expect(cached).toContain('./');
  });

  it('leaves out itself, the not-found page and the RSC payloads', () => {
    expect(cached.some((f: string) => f === 'sw.js' || f.startsWith('404') || f.startsWith('_not-found') || f.endsWith('.txt'))).toBe(false);
  });

  it('changes version only when a file changes', () => {
    expect(versionOf(root, files)).toBe(versionOf(root, files));
    expect(versionOf(root, files.slice(1))).not.toBe(versionOf(root, files));
  });

  it('writes a script that parses', () => {
    expect(() => new Function(swSource(cached, 'abc'))).not.toThrow();
  });
});
