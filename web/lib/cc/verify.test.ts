import { describe, expect, it } from 'vitest';
import type { VerifyAnswer } from '../../../packages/shared/src/verify/index';
import { allRows, applyFilter, counts, filterFromSearch, handOverText, NO_FILTER, parseRightValue, relatedRows, rowViews, searchOfFilter, valueText } from './verify';

const rows = allRows();
const row = (key: string) => rows.find((r) => r.key === key)!;
const SALARY = 'plan-params.json:salary_round_lei#status';
const answer = (over: Partial<VerifyAnswer> = {}): VerifyAnswer => ({
  id: 'a1',
  itemKey: SALARY,
  verdict: 'confirmed',
  sourceUrl: 'https://cropcash.ro/d',
  note: 'decis',
  byEmail: null,
  at: '2026-11-20T09:00:00Z',
  ...over,
});

describe('the rows', () => {
  it('lists the data items and only the open questions', () => {
    expect(rows.some((r) => r.level === 'check')).toBe(true);
    expect(rows.filter((r) => r.question).every((r) => !r.question!.closed)).toBe(true);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('marks an /admin figure as changing money', () => {
    expect(row(SALARY)).toMatchObject({ factorPath: 'params.salary_round_lei.value', money: true });
    expect(rows.find((r) => r.where.startsWith('oblio.json'))?.money).toBe(false);
  });

  it('links a question to the data items it names', () => {
    const wind = rows.find((r) => r.question && r.question.refs.includes('weather.spray_wind_max_kmh'));
    expect(wind).toBeTruthy();
    expect(relatedRows(wind!, rows).some((r) => r.item?.path === 'weather.spray_wind_max_kmh')).toBe(true);
  });
});

describe('the filters', () => {
  it('go to the address and back, ignoring what is not a known value', () => {
    const f = { level: 'check' as const, area: 'fuel' as const, state: 'waiting' as const, money: true, search: 'motorină T3' };
    expect(filterFromSearch(searchOfFilter(f))).toEqual(f);
    expect(searchOfFilter(NO_FILTER)).toBe('');
    expect(filterFromSearch('?nivel=nimic&zona=luna')).toEqual(NO_FILTER);
  });

  it('narrow the rows by level, state and words', () => {
    const views = rowViews(rows, [answer()]);
    expect(applyFilter(views, { ...NO_FILTER, state: 'waiting' }).map((v) => v.row.key)).toEqual([SALARY]);
    expect(applyFilter(views, { ...NO_FILTER, search: 'SALARY_ROUND' }).map((v) => v.row.key)).toContain(SALARY);
    expect(applyFilter(views, { ...NO_FILTER, level: 'question' }).every((v) => v.row.question)).toBe(true);
  });
});

describe('answers', () => {
  it('count per level, waiting and lately', () => {
    const c = counts(rowViews(rows, [answer(), answer({ id: 'a0', at: '2026-01-01T00:00:00Z', itemKey: rows[0]!.key, verdict: 'open' })]), new Date('2026-11-20T12:00:00Z'));
    expect(c.waiting).toBe(1);
    expect(c.answeredLately).toBe(1);
    expect(Object.values(c.byLevel).reduce((a, b) => a + b, 0)).toBe(rows.length);
  });

  it('hand over every waiting answer as text', () => {
    expect(handOverText(rowViews(rows, [answer()]))).toContain('docs/data/plan-params.json → salary_round_lei');
  });

  it('take the right value the way /admin does for its figures, and loosely otherwise', () => {
    expect(parseRightValue(row(SALARY), '100')).toEqual({ ok: true, value: 100 });
    expect(parseRightValue(row(SALARY), 'o sută').ok).toBe(false);
    const text = rows.find((r) => r.item && !r.factorPath)!;
    expect(parseRightValue(text, '5,5')).toEqual({ ok: true, value: 5.5 });
    expect(parseRightValue(text, '')).toEqual({ ok: true, value: null });
    expect(parseRightValue(text, '["a"]')).toEqual({ ok: true, value: ['a'] });
    expect(parseRightValue(text, '{a')).toMatchObject({ ok: false });
    expect(parseRightValue(text, '31 martie 2027')).toEqual({ ok: true, value: '31 martie 2027' });
  });

  it('show values in words', () => {
    expect(valueText(5.2788)).toBe('5,2788');
    expect(valueText(null)).toBe('fără cifră');
    expect(valueText(undefined)).toBe('');
    expect(valueText(true)).toBe('da');
  });
});
