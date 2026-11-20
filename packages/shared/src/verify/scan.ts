/* Everything in docs/data that isn't firm yet, found by walking the files (docs/admin-verificari-plan.md).
   Any key ending in `status` with a weak value (levels.ts) is one item. Pure: the files are passed in. */
import { APP_DATA_NAME, VERIFY_FILES } from './files';
import { areaOfFile, levelOf, type VerifyArea, type VerifyLevel } from './levels';

export interface VerifyItem {
  /** Stable across reorderings: `file:path#statusKey`, array items addressed by id or code, not by index. */
  key: string;
  file: string;
  /** Inside the file, e.g. `schemes[id=PD-05]`; '' for the file's top level. */
  path: string;
  /** The same place as an /admin figure path (`subsidies.schemes[id=PD-05]`), when the forecasts read the file. */
  appPath: string | null;
  statusKey: string;
  status: string;
  level: VerifyLevel;
  area: VerifyArea;
  /** What a person calls it: title, name, id, or the last part of the path. */
  name: string;
  /** The figure the status is about: the sibling `value`, or `deadline` for `deadline_status`. Undefined if none. */
  value: unknown;
  /** The field `value` was read from, for the edit handed to a developer; null when there is none. */
  valueField: string | null;
  note: string | null;
  sourceUrl: string | null;
  /** A source given as text (an article, a law), when it isn't a link. */
  source: string | null;
  /** The whole object the status sits in, to show in the detail. */
  holder: Readonly<Record<string, unknown>>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const isUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//.test(v);

/** Fields that identify an item in a list, tried in this order. */
const ID_FIELDS = ['id', 'code', 'county', 'key', 'period', 'from', 'for_year', 'campaign', 'year'] as const;

function segmentFor(key: string, item: unknown, index: number, list: readonly unknown[]): string {
  if (isRecord(item)) {
    for (const f of ID_FIELDS) {
      const v = item[f];
      if (typeof v !== 'string' && typeof v !== 'number') continue;
      const unique = list.filter((x) => isRecord(x) && x[f] === v).length === 1;
      if (unique && !/[[\]=,.]/.test(String(v))) return `${key}[${f}=${v}]`;
    }
  }
  return `${key}[${index}]`;
}

function nameOf(holder: Record<string, unknown>, path: string, statusKey: string): string {
  const named = text(holder.title_ro) ?? text(holder.name_ro) ?? text(holder.name) ?? text(holder.title);
  const field = statusKey === 'status' ? null : statusKey.replace(/_status$/, '');
  const last = path.split('.').pop() ?? '';
  const where = named ?? (typeof holder.id === 'string' ? holder.id : null) ?? (typeof holder.code === 'string' ? holder.code : null) ?? (last || 'tot fișierul');
  return field ? `${where} · ${field}` : where;
}

/** `field`, else the one field named `field_…` that isn't a note or a source (`minimum` → `minimum_kg_ha`). */
function valueFieldOf(holder: Record<string, unknown>, field: string): string | null {
  if (field in holder) return field;
  const near = Object.keys(holder).filter((k) => k.startsWith(`${field}_`) && !/(_status|_note|_source|_source_url|_ro)$/.test(k));
  return near.length === 1 ? near[0]! : null;
}

function itemOf(file: string, path: string, holder: Record<string, unknown>, statusKey: string, status: string, level: VerifyLevel): VerifyItem {
  const field = statusKey === 'status' ? 'value' : statusKey.replace(/_status$/, '');
  const prefix = statusKey === 'status' ? '' : statusKey.replace(/status$/, '');
  const app = APP_DATA_NAME[file];
  const valueField = valueFieldOf(holder, field);
  const sourceUrl = [holder[`${prefix}source_url`], holder.source_url, holder.source, holder.url].find(isUrl) ?? null;
  return {
    key: `${file}:${path}#${statusKey}`,
    file,
    path,
    appPath: app ? (path ? `${app}.${path}` : app) : null,
    statusKey,
    status,
    level,
    area: areaOfFile(file),
    name: nameOf(holder, path, statusKey),
    value: valueField ? holder[valueField] : undefined,
    valueField,
    note: text(holder[`${prefix}note`]) ?? text(holder.note),
    sourceUrl,
    source: isUrl(holder.source) ? null : text(holder.source),
    holder,
  };
}

/** Every item in the files, in file order. A status of an array (a list of allowed statuses) isn't an item. */
export function scanData(files: Readonly<Record<string, unknown>> = VERIFY_FILES): VerifyItem[] {
  const out: VerifyItem[] = [];
  const walk = (file: string, at: unknown, path: string) => {
    if (Array.isArray(at)) {
      at.forEach((x, i) => walk(file, x, segmentFor(path, x, i, at)));
      return;
    }
    if (!isRecord(at)) return;
    for (const [k, v] of Object.entries(at)) {
      if (/status$/.test(k) && typeof v === 'string') {
        const level = levelOf(v);
        if (level) out.push(itemOf(file, path, at, k, v, level));
        continue;
      }
      walk(file, v, path ? `${path}.${k}` : k);
    }
  };
  for (const [file, json] of Object.entries(files)) walk(file, json, '');
  return out;
}

/** Counts by level, for the top of the page. */
export function countByLevel(items: readonly VerifyItem[]): Record<VerifyLevel, number> {
  const c: Record<VerifyLevel, number> = { check: 0, weak: 0, assumption: 0 };
  for (const i of items) c[i.level]++;
  return c;
}
