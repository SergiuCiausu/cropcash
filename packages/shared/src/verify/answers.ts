/* An admin's answer to a to-check item, where the item stands, and the edit handed to a developer
   (docs/admin-verificari-plan.md). The files stay the truth: an answer never changes them by itself. */
import { z } from 'zod';
import type { OpenQuestion } from './questions';
import type { VerifyItem } from './scan';

export const VERDICTS = ['confirmed', 'wrong', 'open', 'not_needed'] as const;
export type Verdict = (typeof VERDICTS)[number];

const httpsUrl = z
  .string()
  .trim()
  .max(1000)
  .regex(/^https:\/\/[^\s]+$/, 'https_url');

/** What the page sends. A confirmed or wrong answer names its source; a wrong one gives the right value. */
export const AnswerInputSchema = z
  .object({
    itemKey: z.string().trim().min(3).max(400),
    verdict: z.enum(VERDICTS),
    newValue: z.unknown().optional(),
    sourceUrl: httpsUrl.nullish(),
    note: z.string().trim().min(3).max(2000),
  })
  .superRefine((a, ctx) => {
    if ((a.verdict === 'confirmed' || a.verdict === 'wrong') && !a.sourceUrl) ctx.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'source_required' });
    if (a.verdict === 'wrong' && a.newValue === undefined) ctx.addIssue({ code: 'custom', path: ['newValue'], message: 'value_required' });
    if (a.verdict !== 'wrong' && a.newValue !== undefined) ctx.addIssue({ code: 'custom', path: ['newValue'], message: 'value_only_when_wrong' });
  });
export type AnswerInput = z.infer<typeof AnswerInputSchema>;

/** A stored answer, as the API returns it. */
export interface VerifyAnswer {
  id: string;
  itemKey: string;
  verdict: Verdict;
  newValue?: unknown;
  sourceUrl: string | null;
  note: string;
  byEmail: string | null;
  at: string;
}

/**
 * open: nobody answered, or the last answer says still open.
 * waiting: answered, but the file (or the doc) still says it isn't firm: a developer has to put the answer in.
 * done: the file or the doc changed, so the item is gone or closed.
 */
export type ItemState = 'open' | 'waiting' | 'done';

/** The answers of every key, newest first. */
export function answersByKey(answers: readonly VerifyAnswer[]): Map<string, VerifyAnswer[]> {
  const by = new Map<string, VerifyAnswer[]>();
  for (const a of [...answers].sort((x, y) => y.at.localeCompare(x.at))) {
    const list = by.get(a.itemKey) ?? [];
    list.push(a);
    by.set(a.itemKey, list);
  }
  return by;
}

/** Where an item stands. `present` is false when the item is no longer in the files (or is closed in the doc). */
export function itemState(present: boolean, latest: VerifyAnswer | undefined): ItemState {
  if (!present) return 'done';
  if (!latest || latest.verdict === 'open') return 'open';
  return 'waiting';
}

/** Answers to keys that are no longer in the files or the doc: done, or pointing at something renamed. */
export function answersWithoutItem(answers: readonly VerifyAnswer[], keys: ReadonlySet<string>): VerifyAnswer[] {
  const by = answersByKey(answers);
  return [...by.entries()].filter(([k]) => !keys.has(k)).map(([, list]) => list[0]!);
}

/** The /admin figure an item is about, when /admin can change it: its path in `factorPaths` (listFactors). */
export function factorPathOf(item: VerifyItem, factorPaths: ReadonlySet<string>): string | null {
  if (!item.appPath || !item.valueField) return null;
  const path = `${item.appPath}.${item.valueField}`;
  return factorPaths.has(path) ? path : null;
}

const json = (v: unknown) => JSON.stringify(v ?? null);
const day = (iso: string) => iso.slice(0, 10);

/**
 * The edit a developer makes in the file, as text to copy: which object, then each field with its new value
 * and the old one. A not-needed item gets a line saying what to do instead, since that is a judgement call.
 */
export function fileEditText(item: VerifyItem, answer: VerifyAnswer): string {
  const where = `docs/data/${item.file} → ${item.path || '(sus în fișier)'}`;
  if (answer.verdict === 'open') return `${where}\nÎncă deschis: ${answer.note}`;
  if (answer.verdict === 'not_needed') return `${where}\nNu mai e nevoie: ${answer.note}\nScoate câmpul sau pune ${json(item.statusKey)}: "confirmat" cu o notă că nu se mai folosește.`;
  const prefix = item.statusKey === 'status' ? '' : item.statusKey.replace(/status$/, '');
  const noteKey = `${prefix}note` in item.holder ? `${prefix}note` : 'note';
  const sourceKey = `${prefix}source_url` in item.holder ? `${prefix}source_url` : 'source_url';
  const lines = [where, `  ${json(item.statusKey)}: "confirmat",   (era ${json(item.status)})`];
  if (answer.verdict === 'wrong') {
    const field = item.valueField ?? (item.statusKey === 'status' ? 'value' : item.statusKey.replace(/_status$/, ''));
    lines.push(`  ${json(field)}: ${json(answer.newValue)},   (era ${json(item.value)})`);
  }
  lines.push(`  ${json(sourceKey)}: ${json(answer.sourceUrl)},`);
  lines.push(`  ${json(noteKey)}: ${json(`${answer.note} (verificat pe ${day(answer.at)})`)}`);
  return lines.join('\n');
}

/** The same for an item of docs/11-open-questions.md: the doc is edited by hand. */
export function questionEditText(q: OpenQuestion, answer: VerifyAnswer): string {
  const where = `docs/11-open-questions.md → ${q.section}.${q.number} ${q.title}`;
  const said: Record<typeof answer.verdict, string> = {
    confirmed: `**Rezolvat (${day(answer.at)}):** ${answer.note}`,
    wrong: `**Rezolvat (${day(answer.at)}):** valoarea corectă e ${json(answer.newValue)}. ${answer.note}`,
    not_needed: `**Nu mai e nevoie (${day(answer.at)}):** ${answer.note}`,
    open: `Încercat pe ${day(answer.at)}: ${answer.note}`,
  };
  return [where, `  ${said[answer.verdict]}${answer.sourceUrl ? ` Sursa: ${answer.sourceUrl}` : ''}`].join('\n');
}
