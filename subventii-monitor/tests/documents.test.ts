import { describe, expect, it } from 'vitest';
import { shortDiff, splitPassages } from '../src/documents.ts';

describe('splitPassages', () => {
  it('keeps every word and cuts at line ends', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `rândul numărul ${i}`);
    const passages = splitPassages(lines.join('\n'), 100);
    expect(passages.length).toBeGreaterThan(1);
    expect(passages.every((p) => p.length <= 100)).toBe(true);
    expect(passages.join('\n').split('\n')).toEqual(lines);
  });

  it('cuts one very long line', () => {
    const passages = splitPassages('a'.repeat(250), 100);
    expect(passages.map((p) => p.length)).toEqual([100, 100, 50]);
  });

  it('removes what Postgres text refuses, and empty pieces', () => {
    expect(splitPassages('un\u0000u\n\n\n')).toEqual(['unu']);
    expect(splitPassages('  \n ')).toEqual([]);
  });
});

describe('shortDiff', () => {
  const diff = '--- a\n+++ b\n@@ -1,2 +1,2 @@\n context\n-termen 5 iunie\n+termen 12 iunie';

  it('keeps only what was added and removed', () => {
    expect(shortDiff(diff)).toBe('-termen 5 iunie\n+termen 12 iunie');
  });

  it('stays short', () => {
    expect(shortDiff(`+${'x'.repeat(50)}`, 20)).toHaveLength(21);
  });
});
