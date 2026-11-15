import { z } from 'zod';
import { EDITABLE_FACTORS, type Factor } from './factors';
import { buildData, FILE_NAMES, RAW_FILES, loadData, type AppData, type FileName, type RawFiles } from './files';

/*
 * The admin panel's changes, laid over docs/data (docs/admin-panel-plan.md). The files stay the base:
 * a change names a path (data/factors.ts), a new value and why. Applying them patches a copy of the
 * files and runs the very checks loadData() runs, so a bad change can't reach a forecast.
 */

export const OverrideValueSchema = z.union([z.number().finite(), z.string().max(100), z.boolean(), z.null()]);
export type OverrideValue = z.infer<typeof OverrideValueSchema>;

export const OverrideSchema = z.object({
  path: z.string().min(1).max(300),
  value: OverrideValueSchema,
  /** Why, or where the new figure comes from. Required: no figure without a reason (CLAUDE.md). */
  reason: z.string().trim().min(3).max(500),
});
export type Override = z.infer<typeof OverrideSchema>;

/** GET /api/prediction-data: the published version and its changes, and whether the caller is an admin. */
export const PredictionDataSchema = z.object({
  version: z.number().int().min(0),
  overrides: z.array(OverrideSchema),
  admin: z.boolean(),
});
export type PredictionData = z.infer<typeof PredictionDataSchema>;

export type OverrideErrorCode =
  | 'bad_path'
  | 'not_editable'
  | 'unknown_path'
  | 'ambiguous_path'
  | 'duplicate_path'
  | 'invalid_value'
  | 'check_failed'
  | 'invalid_data';

export class OverrideError extends Error {
  constructor(
    readonly code: OverrideErrorCode,
    readonly path: string | null,
    message: string,
  ) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'OverrideError';
  }
}

// ── Paths ───────────────────────────────────────────────────────────────────

export interface PathSegment {
  key: string;
  /** `[a=1,b=2]`: the one array item whose fields have these values (compared as text). */
  select: [string, string][] | null;
}

const SEGMENT = /^([^.[\]=,]+)(?:\[([^\]]+)\])?$/;

/** Splits on dots outside brackets. Throws 'bad_path' on anything malformed. */
export function parsePath(path: string): PathSegment[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of path) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (depth < 0 || depth > 1) throw new OverrideError('bad_path', path, 'brackets do not match');
    if (ch === '.' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  if (depth !== 0) throw new OverrideError('bad_path', path, 'brackets do not match');
  parts.push(current);
  return parts.map((part) => {
    const m = SEGMENT.exec(part);
    if (!m) throw new OverrideError('bad_path', path, `bad segment "${part}"`);
    const select = m[2]
      ? m[2].split(',').map((pair): [string, string] => {
          const eq = pair.indexOf('=');
          if (eq <= 0) throw new OverrideError('bad_path', path, `bad selector "${pair}"`);
          return [pair.slice(0, eq), pair.slice(eq + 1)];
        })
      : null;
    return { key: m[1]!, select };
  });
}

export function formatPath(segments: readonly PathSegment[]): string {
  return segments.map((s) => (s.select ? `${s.key}[${s.select.map(([k, v]) => `${k}=${v}`).join(',')}]` : s.key)).join('.');
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `if.field` on an item: a dotted key reads nested fields. */
function field(item: unknown, dotted: string): unknown {
  let at = item;
  for (const k of dotted.split('.')) {
    if (!isRecord(at) || !Object.hasOwn(at, k)) return undefined;
    at = at[k];
  }
  return at;
}

const selects = (item: unknown, select: [string, string][]) =>
  select.every(([k, v]) => {
    const f = field(item, k);
    return (typeof f === 'string' || typeof f === 'number') && String(f) === v;
  });

/** The object holding the last segment, and its key. Throws when the path leads nowhere. */
function locate(files: Record<string, unknown>, path: string, segments: PathSegment[]): { holder: Record<string, unknown>; key: string } {
  let at: unknown = files;
  for (let i = 0; i < segments.length; i++) {
    const { key, select } = segments[i]!;
    if (!isRecord(at) || !Object.hasOwn(at, key)) throw new OverrideError('unknown_path', path, `"${key}" is not there`);
    if (i === segments.length - 1) {
      if (select) throw new OverrideError('bad_path', path, 'the last part must name a value, not pick an item');
      return { holder: at, key };
    }
    at = at[key];
    if (select) {
      if (!Array.isArray(at)) throw new OverrideError('unknown_path', path, `"${key}" is not a list`);
      const found = at.filter((item) => selects(item, select));
      if (found.length === 0) throw new OverrideError('unknown_path', path, `no item of "${key}" matches`);
      if (found.length > 1) throw new OverrideError('ambiguous_path', path, `${found.length} items of "${key}" match`);
      at = found[0];
    }
  }
  throw new OverrideError('bad_path', path, 'empty path');
}

// ── Which paths are editable ────────────────────────────────────────────────

const PATTERNS = EDITABLE_FACTORS.map((factor) => ({ factor, segments: parsePath(factor.pattern) }));

function matches(pattern: PathSegment[], path: PathSegment[]): boolean {
  if (pattern.length !== path.length) return false;
  return pattern.every((p, i) => {
    const s = path[i]!;
    if (p.key !== '*' && p.key !== s.key) return false;
    if (!p.select || !s.select) return !p.select && !s.select;
    if (p.select.length !== s.select.length) return false;
    return p.select.every(([k, v], j) => k === s.select![j]![0] && (v === '*' || v === s.select![j]![1]));
  });
}

/** The factor a concrete path belongs to, or null when that path can't be changed. */
export function factorFor(path: string): Factor | null {
  const segments = parsePath(path);
  return PATTERNS.find((p) => matches(p.segments, segments))?.factor ?? null;
}

function checkValue(factor: Factor, value: OverrideValue, files: Record<string, unknown>, path: string): void {
  const bad = (why: string) => new OverrideError('invalid_value', path, why);
  switch (factor.type) {
    case 'number': {
      if (value === null) {
        if (!factor.nullable) throw bad('needs a number');
        return;
      }
      if (typeof value !== 'number') throw bad('needs a number');
      if (factor.min !== undefined && value < factor.min) throw bad(`must be at least ${factor.min}`);
      if (factor.max !== undefined && value > factor.max) throw bad(`must be at most ${factor.max}`);
      if (Number(value.toFixed(factor.decimals)) !== value) throw bad(`at most ${factor.decimals} digits after the point`);
      return;
    }
    case 'boolean':
      if (typeof value !== 'boolean') throw bad('needs yes or no');
      return;
    case 'choice':
      if (typeof value !== 'string' || !factor.options.includes(value)) throw bad(`must be one of ${factor.options.join(', ')}`);
      return;
    case 'key': {
      const segments = parsePath(factor.keysAt);
      const { holder, key } = locate(files, factor.keysAt, segments);
      const keys = isRecord(holder[key]) ? Object.keys(holder[key]) : [];
      if (typeof value !== 'string' || !keys.includes(value)) throw bad(`must be one of ${keys.join(', ')}`);
      return;
    }
  }
}

// ── Checks the schemas don't make, across fields ─────────────────────────────

export interface CheckIssue {
  path: string;
  message: string;
}

/** Things that must hold together after any change. The files as written pass them all. */
export function crossChecks(files: RawFiles): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const ordered = (path: string, values: unknown[], what: string) => {
    const nums = values.filter((v): v is number => typeof v === 'number');
    if (nums.length === values.length && nums.some((v, i) => i > 0 && v < nums[i - 1]!))
      issues.push({ path, message: `${what} must go from the smallest to the largest` });
  };
  const crops = field(files.crops, 'crops');
  for (const crop of Array.isArray(crops) ? crops : []) {
    const at = `crops.crops[id=${String(field(crop, 'id'))}]`;
    for (const f of ['cost_lei_per_ha', 'yield_t_per_ha', 'price_lei_per_kg'])
      ordered(`${at}.${f}`, ['min', 'mean', 'max'].map((e) => field(crop, `${f}.${e}`)), 'min, mean and max');
    const months = field(crop, 'expense_months');
    if (Array.isArray(months) && months.length > 0) {
      const sum = months.reduce((s: number, m) => s + Number(field(m, 'share_pct') ?? 0), 0);
      if (Math.abs(sum - 100) > 1e-9) issues.push({ path: `${at}.expense_months`, message: `the monthly shares add up to ${sum}%, not 100%` });
    }
  }
  for (const base of ['pension.annual_return_pct', 'pension_return_pct'])
    ordered(`params.${base}`, ['low', 'probable', 'high'].map((e) => field(files.params, `${base}.${e}`)), 'low, probable and high');
  const n = (p: string) => field(files.params, p) as number;
  if (n('pension.slider_min_lei.value') >= n('pension.slider_max_lei.value'))
    issues.push({ path: 'params.pension.slider_min_lei.value', message: 'the slider must start below where it ends' });
  if (n('yield_history.min_years.value') > n('yield_history.window_years.value'))
    issues.push({ path: 'params.yield_history.min_years.value', message: 'cannot ask for more harvests than are counted' });
  if (n('yield_history.extreme_years.value') * 2 > n('yield_history.window_years.value'))
    issues.push({ path: 'params.yield_history.extreme_years.value', message: 'the bad and good years would overlap' });
  if (n('crop_loss.min_years.value') > n('crop_loss.window_years.value'))
    issues.push({ path: 'params.crop_loss.min_years.value', message: 'cannot ask for more harvests than are counted' });
  return issues;
}

// ── Applying ─────────────────────────────────────────────────────────────────

/** A deep copy of only the files the changes touch; the others are shared, never written. */
function copyTouched(raw: RawFiles, overrides: readonly Override[]): Record<FileName, unknown> {
  const touched = new Set(overrides.map((o) => o.path.split(/[.[]/, 1)[0]));
  return Object.fromEntries(FILE_NAMES.map((name) => [name, touched.has(name) ? JSON.parse(JSON.stringify(raw[name])) : raw[name]])) as Record<FileName, unknown>;
}

/** The files with the changes made and checked. Throws OverrideError on the first problem. */
export function patchFiles(overrides: readonly Override[], raw: RawFiles = RAW_FILES): RawFiles {
  const files = copyTouched(raw, overrides);
  const seen = new Set<string>();
  for (const o of overrides) {
    const segments = parsePath(o.path);
    const path = formatPath(segments);
    if (seen.has(path)) throw new OverrideError('duplicate_path', path, 'changed twice');
    seen.add(path);
    const factor = factorFor(path);
    if (!factor) throw new OverrideError('not_editable', path, 'this figure cannot be changed from the panel');
    const { holder, key } = locate(files, path, segments);
    checkValue(factor, o.value, files, path);
    holder[key] = o.value;
  }
  const [issue] = crossChecks(files);
  if (issue) throw new OverrideError('check_failed', issue.path, issue.message);
  return files;
}

/**
 * docs/data with the changes on top, checked like loadData(). No changes = loadData() itself.
 * Throws OverrideError, so a publish with one bad change publishes nothing.
 */
export function applyOverrides(overrides: readonly Override[], raw: RawFiles = RAW_FILES): AppData {
  if (overrides.length === 0 && raw === RAW_FILES) return loadData();
  const files = patchFiles(overrides, raw);
  try {
    return buildData(files);
  } catch (e) {
    const issue = e instanceof z.ZodError ? e.issues[0] : undefined;
    const where = issue ? issue.path.join('.') : null;
    throw new OverrideError('invalid_data', where, issue?.message ?? (e as Error).message);
  }
}

export interface AppliedOverrides {
  data: AppData;
  applied: Override[];
  rejected: { override: Override; error: OverrideError }[];
}

/**
 * The changes that still apply, and the ones that don't, one by one. For data already published:
 * after docs/data changes, a stale change is left out (and reported) instead of breaking the app.
 */
export function applyValidOverrides(overrides: readonly Override[], raw: RawFiles = RAW_FILES): AppliedOverrides {
  // Usually every change applies: one build instead of one per change (this also runs on the phone).
  try {
    return { data: applyOverrides(overrides, raw), applied: [...overrides], rejected: [] };
  } catch (e) {
    if (!(e instanceof OverrideError)) throw e;
  }
  const applied: Override[] = [];
  const rejected: AppliedOverrides['rejected'] = [];
  let data = applyOverrides([], raw);
  for (const o of overrides) {
    try {
      data = applyOverrides([...applied, o], raw);
      applied.push(o);
    } catch (e) {
      if (!(e instanceof OverrideError)) throw e;
      rejected.push({ override: o, error: e });
    }
  }
  return { data, applied, rejected };
}

// ── Reading, for the panel ───────────────────────────────────────────────────

export interface FactorValue {
  path: string;
  factor: Factor;
  value: unknown;
}

/** Every concrete path behind a pattern, with its value in these files. */
function expand(at: unknown, pattern: PathSegment[], done: PathSegment[], out: { segments: PathSegment[]; value: unknown }[]) {
  if (pattern.length === 0) {
    out.push({ segments: done, value: at });
    return;
  }
  const [head, ...rest] = pattern as [PathSegment, ...PathSegment[]];
  if (!isRecord(at)) return;
  const keys = head.key === '*' ? Object.keys(at) : Object.hasOwn(at, head.key) ? [head.key] : [];
  for (const key of keys) {
    const next = at[key];
    if (!head.select) {
      expand(next, rest, [...done, { key, select: null }], out);
      continue;
    }
    if (!Array.isArray(next)) continue;
    for (const item of next) {
      const values = head.select.map(([k]) => field(item, k));
      if (!values.every((v) => typeof v === 'string' || typeof v === 'number')) continue;
      const select: [string, string][] = head.select.map(([k], i): [string, string] => [k, String(values[i])]);
      if (!head.select.every(([, v], i) => v === '*' || v === select[i]![1])) continue;
      expand(item, rest, [...done, { key, select }], out);
    }
  }
}

/**
 * Every editable figure in these files, with its value: what the panel lists. A path that would
 * pick two items of a list is left out, because a change to it couldn't say which one it means.
 */
export function listFactors(raw: RawFiles = RAW_FILES): FactorValue[] {
  const out: FactorValue[] = [];
  for (const { factor, segments } of PATTERNS) {
    const found: { segments: PathSegment[]; value: unknown }[] = [];
    expand(raw, segments, [], found);
    const paths = found.map((f) => formatPath(f.segments));
    found.forEach((f, i) => {
      const path = paths[i]!;
      if (paths.indexOf(path) === paths.lastIndexOf(path) && f.value !== undefined) out.push({ path, factor, value: f.value });
    });
  }
  return out;
}
