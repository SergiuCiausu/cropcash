import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The words the farmer must never see (CLAUDE.md, docs/01), searched in everything web/ puts on
 * screen: the pages (web/app, web/screens), their scripts (web/legacy) and components. "CropCash" is fine,
 * "cash-flow" is not. Replaces the ro.json test that went away with apps/web.
 */
const FORBIDDEN: [string, RegExp][] = [
  ['lichiditate', /lichidit/i],
  ['cash-flow', /cash[\s-]?flow/i],
  ['portofoliu', /portofoli/i],
  ['randament', /randament/i],
  /* Renamed to "Pensie" on 2026-11-08, so it doesn't come back. */
  ['bătrânețe', /b[ăa]tr[âa]ne[țţt]/i],
];

const web = join(import.meta.dirname, '..');
const ROOTS = ['app', 'legacy', 'components', 'screens'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|js)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('words on screen', () => {
  const sources = ROOTS.flatMap((r) => files(join(web, r)));

  it('finds the page files', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it('never uses the banned words', () => {
    const hits: string[] = [];
    for (const file of sources) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(import|export) .* from '/.test(line)) return; // A path, not words on screen.
          for (const [word, re] of FORBIDDEN) {
            if (re.test(line)) hits.push(`${relative(web, file)}:${i + 1} ${word}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });
});
