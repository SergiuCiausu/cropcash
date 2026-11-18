import type { HistoryFile } from '../data/schemas';

export interface RangeFactors {
  min: number;
  max: number;
  /** Scheme whose history produced the factors (differs from the scheme on fallback). */
  basedOn: string;
  isFallback: boolean;
}

/**
 * factor_year = actual / planned (PNS), for years with both values, excluding
 * reference amounts (e.g. the 2026 advance reference, which is not final).
 * min = min(factors), max = max(1, max(factors)). See docs/03-subsidies.md §5.
 */
function factorsFor(history: HistoryFile, code: string): { min: number; max: number } | null {
  const entry = history.schemes[code];
  if (!entry?.actual?.length || !entry.planned_pns?.length) return null;

  const planned = new Map(entry.planned_pns.map((p) => [p.year, p.value]));
  const ratios = entry.actual
    .filter((a) => !a.is_reference && planned.has(a.year))
    .map((a) => a.value / (planned.get(a.year) as number));

  if (ratios.length === 0) return null;
  return { min: Math.min(...ratios), max: Math.max(1, ...ratios) };
}

export function computeRangeFactors(history: HistoryFile, code: string): RangeFactors {
  const own = factorsFor(history, code);
  if (own) return { ...own, basedOn: code, isFallback: false };

  const fallbackCode = history.range_policy.fallback_scheme;
  const fallback = factorsFor(history, fallbackCode);
  if (!fallback) throw new Error(`Fallback scheme ${fallbackCode} has no usable history`);
  return { ...fallback, basedOn: fallbackCode, isFallback: true };
}
