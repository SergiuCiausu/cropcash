import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { FAIL_TEXT, failText, type FailKind } from './fail-text';
import { moneyOutcome } from './money-check';

const KINDS: FailKind[] = ['record', 'plan', 'money', 'read', 'ai', 'paper'];

function allTexts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return value && typeof value === 'object' ? Object.values(value).flatMap(allTexts) : [];
}

describe('failText (FAIL-13)', () => {
  it('says "no internet" only when there is none', () => {
    expect(failText(new ApiError(0, 'offline'), 'record')).toBe(FAIL_TEXT.offline.record);
    expect(failText(new ApiError(0, 'network'), 'record', false)).toBe(FAIL_TEXT.offline.record);
    expect(failText(new ApiError(0, 'network'), 'record', true)).toBe(FAIL_TEXT.network);
  });

  it('never tells the farmer to tap again when money may have moved (FAIL-03)', () => {
    for (const e of [new ApiError(0, 'timeout'), new ApiError(0, 'network'), new ApiError(502, 'unknown')]) {
      expect(failText(e, 'money')).toBe(FAIL_TEXT.moneyUnknown);
    }
  });

  it('uses what the server said', () => {
    expect(failText(new ApiError(409, 'busy'), 'money')).toBe(FAIL_TEXT.codes.busy);
    expect(failText(new ApiError(404, 'no_farm'), 'plan')).toBe(FAIL_TEXT.codes.no_farm);
    expect(failText(new ApiError(401, 'unauthorized'), 'record')).toBe(FAIL_TEXT.signIn);
    expect(failText(new ApiError(429, 'rate_limited'), 'ai')).toBe(FAIL_TEXT.tooMany);
    expect(failText(new ApiError(500, 'unknown'), 'record')).toBe(FAIL_TEXT.server);
  });

  it('has a sentence for every kind, timeouts included, and copes with anything', () => {
    for (const kind of KINDS) {
      expect(failText(new ApiError(0, 'timeout'), kind)).toBeTruthy();
      expect(failText(new ApiError(400, 'invalid_input'), kind)).toBe(FAIL_TEXT.generic[kind]);
      expect(failText(null, kind)).toBe(FAIL_TEXT.generic[kind]);
      expect(failText(new TypeError('x'), kind)).toBe(FAIL_TEXT.generic[kind]);
    }
  });

  /* The same rules as web/lib/language.test.ts, which covers the page folders, not lib/live. */
  it('uses plain words, with diacritics', () => {
    const texts = allTexts(FAIL_TEXT);
    for (const t of texts) {
      expect(t).not.toMatch(/lichidit|cash[\s-]?flow|portofoli|randament|b[ăa]tr[âa]ne[țţt]/i);
      expect(t).not.toMatch(/\bcam \d/);
    }
    expect(texts.join(' ')).toMatch(/[ăâîșț]/);
  });
});

describe('moneyOutcome (FAIL-03)', () => {
  const before = { pension_plans: null, envelopes: [], transactions: [], demo_now: '2026-11-15', stripe_account_id: null, pension_fund_id: null };

  it('sees a pension that started, or not', () => {
    const running = { ...before, pension_plans: { monthly_bani: 30000, status: 'active' } };
    expect(moneyOutcome('start_pension', { monthlyLei: 300 }, before, running)).toBe('done');
    expect(moneyOutcome('start_pension', { monthlyLei: 300 }, before, before)).toBe('not_done');
    expect(moneyOutcome('change_pension', { monthlyLei: 400 }, running, running)).toBe('not_done');
    expect(moneyOutcome('stop_pension', {}, running, { ...running, pension_plans: { monthly_bani: 30000, status: 'stopped' } })).toBe('done');
  });

  it('sees envelopes, the advance, the clock, the fund and the account', () => {
    expect(moneyOutcome('save_envelopes', { salary: 100, spring: 50 }, before, { ...before, envelopes: [{ kind: 'salary', balance_bani: 100 }, { kind: 'spring', balance_bani: 50 }] })).toBe('done');
    expect(moneyOutcome('save_envelopes', { salary: 100 }, before, before)).toBe('not_done');
    const advance = { kind: 'apia_advance', amount_bani: 1, occurred_at: '2026-11-16T00:00:00Z' };
    expect(moneyOutcome('simulate_apia_advance', {}, before, { ...before, transactions: [advance] as never })).toBe('done');
    expect(moneyOutcome('advance_clock', { months: 1 }, before, { ...before, demo_now: '2026-12-15' })).toBe('done');
    expect(moneyOutcome('advance_clock', { months: 1 }, before, before)).toBe('not_done');
    expect(moneyOutcome('set_pension_fund', { fundId: 'nn' }, before, { ...before, pension_fund_id: 'nn' })).toBe('done');
    expect(moneyOutcome('stripe_setup', {}, before, { ...before, stripe_account_id: 'acct_1' })).toBe('done');
  });
});
