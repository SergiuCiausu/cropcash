/* „De verificat” (docs/admin-verificari-plan.md, steps 4–6): the rows the page lists, the filters kept in
   the address, what an admin may type as the right value, the hand-over to the files and to /admin's draft,
   and the last answers kept on the phone. No React and no network, so the tests drive it directly.
   The page is components/pages/AdminVerify.tsx. */
import { factorFor, listFactors, type Factor, type OverrideValue } from '../../../packages/shared/src/data/index';
import {
  answersByKey,
  answersWithoutItem,
  factorPathOf,
  fileEditText,
  itemState,
  OPEN_QUESTIONS,
  questionEditText,
  scanData,
  type ItemState,
  type OpenQuestion,
  type VerifyAnswer,
  type VerifyArea,
  type VerifyItem,
  type VerifyLevel,
} from '../../../packages/shared/src/verify/index';
import { parseValue, readDraft, saveDraft } from './admin';
import { KEYS, readJson, writeJson, type KeyStore } from './storage';

/** A to-check level, plus the open questions of the doc. */
export type RowLevel = VerifyLevel | 'question';

export const LEVEL_LABELS: Record<RowLevel, string> = {
  check: 'De verificat',
  weak: 'Sursă slabă',
  assumption: 'Presupunere',
  question: 'Întrebare deschisă',
};
export const ROW_LEVELS = Object.keys(LEVEL_LABELS) as RowLevel[];

export const AREA_LABELS: Record<VerifyArea, string> = {
  subsidies: 'Subvenții APIA',
  taxes: 'Taxe și TVA',
  fuel: 'Motorină și accize',
  arenda: 'Arendă',
  calendar: 'Calendar și termene',
  pension: 'Pensie',
  crops: 'Culturi și îngrășăminte',
  contracts: 'Contracte',
  map: 'Hartă',
  plan: 'Planul și salariul',
  questions: 'Întrebări deschise',
};
export const AREAS = Object.keys(AREA_LABELS) as VerifyArea[];

export const STATE_LABELS: Record<ItemState, string> = {
  open: 'Fără răspuns',
  waiting: 'De pus în fișiere',
  done: 'Gata',
};

export const VERDICT_LABELS: Record<VerifyAnswer['verdict'], string> = {
  confirmed: 'Confirmat',
  wrong: 'Greșit',
  open: 'Încă deschis',
  not_needed: 'Nu mai e nevoie',
};

/** Files whose figures go into the money plan (salary, subsidy, pension, diesel refund, rent in kind). */
const MONEY_FILES = new Set(['subsidies-2026.json', 'subsidies-history.json', 'crops-reference.json', 'plan-params.json', 'fuel-excise.json', 'excise-schemes.json', 'arenda-prices-2026.json', 'pension-funds.json']);

export interface VerifyRow {
  key: string;
  level: RowLevel;
  area: VerifyArea;
  name: string;
  /** Where it sits: `subsidies-2026.json · schemes[code=PD-05]`, or `11-open-questions.md · A.15`. */
  where: string;
  /** The figure or text in use now, as words; '' when there is none to show. */
  value: string;
  status: string | null;
  note: string | null;
  sourceUrl: string | null;
  source: string | null;
  /** The /admin figure it is about, when /admin can change it. */
  factorPath: string | null;
  /** Changes a sum in the farmer's plan. */
  money: boolean;
  item: VerifyItem | null;
  question: OpenQuestion | null;
}

const decimal = (n: number) => String(n).replace('.', ',');

/** A value from a data file, as words: 5,2788 · „2027-03-31” · da · fără cifră · {…} shortened. */
export function valueText(v: unknown): string {
  if (v === undefined) return '';
  if (v === null) return 'fără cifră';
  if (typeof v === 'number') return decimal(v);
  if (typeof v === 'boolean') return v ? 'da' : 'nu';
  if (typeof v === 'string') return v;
  const s = JSON.stringify(v);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

let factorPathsCache: Set<string> | null = null;
const factorPaths = () => (factorPathsCache ??= new Set(listFactors().map((f) => f.path)));

export function rowOfItem(item: VerifyItem, paths: ReadonlySet<string> = factorPaths()): VerifyRow {
  const factorPath = factorPathOf(item, paths);
  return {
    key: item.key,
    level: item.level,
    area: item.area,
    name: item.name,
    where: `${item.file}${item.path ? ` · ${item.path}` : ''}`,
    value: valueText(item.value),
    status: item.status,
    note: item.note,
    sourceUrl: item.sourceUrl,
    source: item.source,
    factorPath,
    money: !!factorPath || MONEY_FILES.has(item.file),
    item,
    question: null,
  };
}

export function rowOfQuestion(q: OpenQuestion): VerifyRow {
  return {
    key: q.key,
    level: 'question',
    area: 'questions',
    name: q.title,
    where: `11-open-questions.md · ${q.section}.${q.number}`,
    value: '',
    status: null,
    note: q.text || null,
    sourceUrl: null,
    source: null,
    factorPath: null,
    money: false,
    item: null,
    question: q,
  };
}

/** Every row the page lists: the data items in file order, then the questions still open in the doc. */
export function allRows(items: readonly VerifyItem[] = scanData(), questions: readonly OpenQuestion[] = OPEN_QUESTIONS): VerifyRow[] {
  return [...items.map((i) => rowOfItem(i)), ...questions.filter((q) => !q.closed).map(rowOfQuestion)];
}

/** How a doc question names this item: by its path (2), by its file only (1), or not at all (0). */
function mentions(q: OpenQuestion, item: VerifyItem): 0 | 1 | 2 {
  const tail = (p: string | null, r: string) => !!p && (p === r || p.endsWith(`.${r}`) || `${p}.${item.valueField ?? ''}`.endsWith(r));
  if (q.refs.some((r) => !r.endsWith('.json') && (tail(item.path, r) || tail(item.appPath, r)))) return 2;
  return q.refs.includes(item.file) ? 1 : 0;
}

/**
 * For a data row, the open questions that name it, those naming its path first. For a question, the data
 * rows it names by path, or else (when it names only files) the first 20 rows of those files.
 */
export function relatedRows(row: VerifyRow, rows: readonly VerifyRow[]): VerifyRow[] {
  if (row.item) {
    const scored = rows.filter((r) => r.question).map((r) => ({ r, s: mentions(r.question!, row.item!) }));
    return scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.r);
  }
  if (row.question) {
    const scored = rows.filter((r) => r.item).map((r) => ({ r, s: mentions(row.question!, r.item!) }));
    const exact = scored.filter((x) => x.s === 2).map((x) => x.r);
    return exact.length ? exact : scored.filter((x) => x.s === 1).slice(0, 20).map((x) => x.r);
  }
  return [];
}

// ── Filters, kept in the address ─────────────────────────────────────────────

export interface VerifyFilter {
  level: RowLevel | null;
  area: VerifyArea | null;
  state: ItemState | null;
  money: boolean;
  search: string;
}
export const NO_FILTER: VerifyFilter = { level: null, area: null, state: null, money: false, search: '' };

const pick = <T extends string>(v: string | null, options: readonly T[]): T | null => (v && (options as readonly string[]).includes(v) ? (v as T) : null);

export function filterFromSearch(search: string): VerifyFilter {
  const p = new URLSearchParams(search);
  return {
    level: pick(p.get('nivel'), ROW_LEVELS),
    area: pick(p.get('zona'), AREAS),
    state: pick(p.get('stare'), Object.keys(STATE_LABELS) as ItemState[]),
    money: p.get('bani') === '1',
    search: (p.get('caut') ?? '').slice(0, 100),
  };
}

export function searchOfFilter(f: VerifyFilter): string {
  const p = new URLSearchParams();
  if (f.level) p.set('nivel', f.level);
  if (f.area) p.set('zona', f.area);
  if (f.state) p.set('stare', f.state);
  if (f.money) p.set('bani', '1');
  if (f.search.trim()) p.set('caut', f.search.trim());
  const s = p.toString();
  return s ? `?${s}` : '';
}

export interface RowView {
  row: VerifyRow;
  state: ItemState;
  answers: VerifyAnswer[];
}

/** The rows with their answers and state, newest answer first. Every row listed is still in the files. */
export function rowViews(rows: readonly VerifyRow[], answers: readonly VerifyAnswer[]): RowView[] {
  const by = answersByKey(answers);
  return rows.map((row) => {
    const list = by.get(row.key) ?? [];
    return { row, answers: list, state: itemState(true, list[0]) };
  });
}

const words = (s: string) => s.trim().toLocaleLowerCase('ro').split(/\s+/).filter(Boolean);

export function applyFilter(views: readonly RowView[], f: VerifyFilter): RowView[] {
  const w = words(f.search);
  return views.filter(({ row, state }) => {
    if (f.level && row.level !== f.level) return false;
    if (f.area && row.area !== f.area) return false;
    if (f.state && state !== f.state) return false;
    if (f.money && !row.money) return false;
    if (!w.length) return true;
    const text = `${row.name} ${row.where} ${row.value} ${row.note ?? ''}`.toLocaleLowerCase('ro');
    return w.every((x) => text.includes(x));
  });
}

export interface Counts {
  byLevel: Record<RowLevel, number>;
  waiting: number;
  answeredLately: number;
}

/** The figures at the top: rows per level, answers waiting for the files, rows answered in the last 30 days. */
export function counts(views: readonly RowView[], now: Date): Counts {
  const byLevel = Object.fromEntries(ROW_LEVELS.map((l) => [l, 0])) as Record<RowLevel, number>;
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  let waiting = 0;
  let answeredLately = 0;
  for (const v of views) {
    byLevel[v.row.level]++;
    if (v.state === 'waiting') waiting++;
    if (v.answers[0] && v.answers[0].at >= since) answeredLately++;
  }
  return { byLevel, waiting, answeredLately };
}

// ── The hand-over ────────────────────────────────────────────────────────────

/** The edit a developer makes for one answered row. */
export function editText(row: VerifyRow, answer: VerifyAnswer): string {
  if (row.item) return fileEditText(row.item, answer);
  return questionEditText(row.question!, answer);
}

/** Every answered row whose file or doc still says it isn't firm, as one text to copy. */
export function handOverText(views: readonly RowView[]): string {
  return views
    .filter((v) => v.state === 'waiting')
    .map((v) => editText(v.row, v.answers[0]!))
    .join('\n\n');
}

/** Answers to keys no longer listed: the file changed (done) or the item was renamed. */
export function answersGone(views: readonly RowView[], answers: readonly VerifyAnswer[]): VerifyAnswer[] {
  return answersWithoutItem(answers, new Set(views.map((v) => v.row.key)));
}

/** The /admin figure of a row, to type the right value the way /admin takes it. */
export const factorOf = (row: VerifyRow): Factor | null => (row.factorPath ? factorFor(row.factorPath) : null);

export type ValueParsed = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * The right value an admin typed. For an /admin figure, its own rules (comma decimals, limits). Otherwise
 * a number, da/nu, an empty field for "no figure", JSON for a list or an object, or else the text itself.
 */
export function parseRightValue(row: VerifyRow, input: string): ValueParsed {
  const factor = factorOf(row);
  if (factor) {
    const t = input.trim().toLocaleLowerCase('ro');
    const parsed = parseValue(factor, factor.type === 'boolean' ? (t === 'da' ? true : t === 'nu' ? false : input) : input);
    return parsed;
  }
  const t = input.trim();
  if (t === '') return { ok: true, value: null };
  if (/^-?\d+([.,]\d+)?$/.test(t)) return { ok: true, value: Number(t.replace(',', '.')) };
  if (t === 'da' || t === 'nu') return { ok: true, value: t === 'da' };
  if (/^[[{]/.test(t)) {
    try {
      return { ok: true, value: JSON.parse(t) as unknown };
    } catch {
      return { ok: false, error: 'Lista sau obiectul nu e JSON corect.' };
    }
  }
  return { ok: true, value: t };
}

/**
 * Puts a wrong /admin figure's right value in /admin's draft, with the answer as its reason, so it can be
 * previewed and published for every farm. Returns false when the value isn't one /admin takes.
 */
export function putInAdminDraft(store: KeyStore, row: VerifyRow, answer: VerifyAnswer, publishedVersion: number): boolean {
  const v = answer.newValue;
  if (!row.factorPath || !(v === null || ['number', 'string', 'boolean'].includes(typeof v))) return false;
  const draft = readDraft(store) ?? { base: publishedVersion, edits: {} };
  const reason = `${answer.note} (${answer.sourceUrl ?? 'fără sursă'})`.slice(0, 500);
  saveDraft(store, { base: Object.keys(draft.edits).length ? draft.base : publishedVersion, edits: { ...draft.edits, [row.factorPath]: { value: v as OverrideValue, reason } } });
  return true;
}

// ── The last answers, on the phone ───────────────────────────────────────────

export interface SavedAnswers {
  answers: VerifyAnswer[];
  at: string;
}

export function readSavedAnswers(store: KeyStore): SavedAnswers | null {
  const s = readJson<SavedAnswers>(store, KEYS.verifyAnswers);
  if (!s || !Array.isArray(s.answers) || typeof s.at !== 'string') return null;
  return { answers: s.answers.filter((a) => a && typeof a.itemKey === 'string' && typeof a.at === 'string'), at: s.at };
}
export const saveAnswers = (store: KeyStore, answers: VerifyAnswer[], now: Date) => writeJson(store, KEYS.verifyAnswers, { answers, at: now.toISOString() });

/** A failed save, in words. */
export function answerErrorText(e: unknown): string {
  const err = e as { status?: number; code?: string; body?: { error?: string; issues?: { path: string; message: string }[] } };
  if (err?.status === 0) return 'Serverul nu a putut fi contactat. Încearcă iar peste un minut.';
  if (err?.status === 403) return 'Contul tău nu mai e de administrator.';
  if (err?.body?.error === 'unknown_item') return 'Elementul nu mai e în fișierele serverului. Reîncarcă pagina.';
  if (err?.body?.error === 'invalid_answer') {
    const m = err.body.issues?.[0];
    if (m?.message === 'source_required' || m?.path === 'sourceUrl') return 'Pune linkul sursei, care începe cu https://.';
    if (m?.message === 'value_required') return 'Scrie valoarea corectă.';
    if (m?.path === 'note') return 'Scrie ce spune sursa (cel puțin 3 semne).';
    return 'Răspunsul nu e complet.';
  }
  return 'Răspunsul nu s-a salvat. Încearcă iar.';
}
