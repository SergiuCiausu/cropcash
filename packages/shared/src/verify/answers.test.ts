import { describe, expect, it } from 'vitest';
import { listFactors } from '../data/overrides';
import { AnswerInputSchema, answersByKey, answersWithoutItem, factorPathOf, fileEditText, itemState, questionEditText, type VerifyAnswer } from './answers';
import { scanData } from './scan';

const answer = (over: Partial<VerifyAnswer>): VerifyAnswer => ({
  id: 'a1',
  itemKey: 'x.json:schemes[id=A]#status',
  verdict: 'confirmed',
  sourceUrl: 'https://apia.org.ro/anunt',
  note: 'Anunțul APIA din 2 nov 2026 dă 100 €',
  byEmail: 'admin@x.ro',
  at: '2026-11-20T10:00:00Z',
  ...over,
});

describe('AnswerInputSchema', () => {
  const ok = { itemKey: 'x.json:a#status', verdict: 'confirmed', sourceUrl: 'https://apia.org.ro', note: 'scrie 100 €' };

  it('takes a confirmed answer with a source', () => {
    expect(AnswerInputSchema.safeParse(ok).success).toBe(true);
  });

  it('wants a source for confirmed and wrong, an https one', () => {
    expect(AnswerInputSchema.safeParse({ ...ok, sourceUrl: null }).success).toBe(false);
    expect(AnswerInputSchema.safeParse({ ...ok, sourceUrl: 'http://apia.org.ro' }).success).toBe(false);
    expect(AnswerInputSchema.safeParse({ ...ok, verdict: 'open', sourceUrl: null, note: 'pagina APIA nu se deschide' }).success).toBe(true);
  });

  it('wants the right value only for a wrong answer', () => {
    expect(AnswerInputSchema.safeParse({ ...ok, verdict: 'wrong' }).success).toBe(false);
    expect(AnswerInputSchema.safeParse({ ...ok, verdict: 'wrong', newValue: 120 }).success).toBe(true);
    expect(AnswerInputSchema.safeParse({ ...ok, verdict: 'wrong', newValue: null }).success).toBe(true);
    expect(AnswerInputSchema.safeParse({ ...ok, newValue: 120 }).success).toBe(false);
  });

  it('wants a note', () => {
    expect(AnswerInputSchema.safeParse({ ...ok, note: ' ' }).success).toBe(false);
  });
});

describe('item state', () => {
  it('is open without an answer or with a still-open one, waiting once answered, done once the file changed', () => {
    expect(itemState(true, undefined)).toBe('open');
    expect(itemState(true, answer({ verdict: 'open' }))).toBe('open');
    expect(itemState(true, answer({}))).toBe('waiting');
    expect(itemState(false, answer({}))).toBe('done');
  });

  it('sorts answers newest first and finds those whose item is gone', () => {
    const older = answer({ id: 'a0', at: '2026-11-19T10:00:00Z', verdict: 'open' });
    const newer = answer({ id: 'a1' });
    const gone = answer({ id: 'a2', itemKey: 'x.json:old#status' });
    expect(answersByKey([older, newer, gone]).get(newer.itemKey)!.map((a) => a.id)).toEqual(['a1', 'a0']);
    expect(answersWithoutItem([older, newer, gone], new Set([newer.itemKey])).map((a) => a.id)).toEqual(['a2']);
  });
});

describe('the edit handed to a developer', () => {
  const [item, deadline] = scanData({
    'x.json': {
      schemes: [
        { id: 'A', value: 5, status: 'DE-VERIFICAT', note: 'de citit' },
        { id: 'C', deadline: '2027-03-31', deadline_status: 'DE-VERIFICAT', deadline_note: 'doar la sfeclă' },
      ],
    },
  });

  it('sets the status, the value, the source and the note, saying what they were', () => {
    expect(fileEditText(item!, answer({ verdict: 'wrong', newValue: 6 }))).toBe(
      [
        'docs/data/x.json → schemes[id=A]',
        '  "status": "confirmat",   (era "DE-VERIFICAT")',
        '  "value": 6,   (era 5)',
        '  "source_url": "https://apia.org.ro/anunt",',
        '  "note": "Anunțul APIA din 2 nov 2026 dă 100 € (verificat pe 2026-11-20)"',
      ].join('\n'),
    );
  });

  it('uses the field-named note for a field status', () => {
    expect(fileEditText(deadline!, answer({ itemKey: deadline!.key }))).toContain('"deadline_note": "Anunțul');
    expect(fileEditText(deadline!, answer({ itemKey: deadline!.key }))).toContain('"deadline_status": "confirmat"');
  });

  it('writes a Rezolvat line for the open-questions doc', () => {
    const q = { key: 'q:A3', section: 'A' as const, number: '3', title: 'PD-05', text: '', closed: false, refs: [] };
    expect(questionEditText(q, answer({}))).toBe(
      'docs/11-open-questions.md → A.3 PD-05\n  **Rezolvat (2026-11-20):** Anunțul APIA din 2 nov 2026 dă 100 € Sursa: https://apia.org.ro/anunt',
    );
  });
});

describe('factorPathOf', () => {
  it('links the items /admin can change to their figure', () => {
    const paths = new Set(listFactors().map((f) => f.path));
    const linked = scanData().filter((i) => factorPathOf(i, paths));
    expect(linked.length).toBeGreaterThan(10);
    expect(linked.find((i) => i.file === 'plan-params.json' && i.path === 'salary_round_lei')).toBeTruthy();
    expect(linked.every((i) => i.appPath?.startsWith('params') || i.appPath?.startsWith('subsidies') || i.appPath)).toBe(true);
  });
});
