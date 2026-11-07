import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ro from './ro.json';

type Dict = { [key: string]: string | Dict };

function strings(node: Dict, prefix = ''): [string, string][] {
  return Object.entries(node).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : strings(v, `${prefix}${k}.`),
  );
}

const all = strings(ro as Dict);
const keys = new Set(all.map(([k]) => k));

/** Words the farmer should never see (CLAUDE.md, docs/01). "CropCash" is fine, "cash-flow" is not. */
const FORBIDDEN = [/lichidit/i, /cash[\s-]?flow/i, /portofoli/i, /randament/i];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('ro.json', () => {
  it('has no forbidden financial jargon', () => {
    const hits = all.filter(([, v]) => FORBIDDEN.some((re) => re.test(v)));
    expect(hits).toEqual([]);
  });

  it('every placeholder is a simple {name}', () => {
    const bad = all.filter(([, v]) => /\{[^}]*[^\w}][^}]*\}/.test(v));
    expect(bad).toEqual([]);
  });

  it('every literal t("…") key used in the app exists', () => {
    const src = join(import.meta.dirname, '..');
    const missing: string[] = [];
    for (const file of sourceFiles(src)) {
      const code = readFileSync(file, 'utf8');
      for (const m of code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        if (!keys.has(m[1]!)) missing.push(`${file.slice(src.length + 1)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
