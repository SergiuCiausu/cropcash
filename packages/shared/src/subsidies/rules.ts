import { haToAri } from '../money';
import type { Condition, Op, Rule, Scheme } from '../data/schemas';
import { AREA_FIELDS, type FarmProfile } from './profile';

export interface FailedCondition {
  field: Condition['field'];
  op: Op;
  /** Expected value as written in the data (ha for area fields). */
  expected: number;
  /** Actual value in the same unit as expected (ha for area fields). */
  actual: number;
}

export interface UnverifiedRule {
  field: Condition['field'];
  op: Op;
  value: number;
  note?: string;
}

export interface EligibilityResult {
  eligible: boolean;
  failed: FailedCondition[];
  /** DE-VERIFICAT rules that were applied to reach the decision. */
  unverified: UnverifiedRule[];
}

function compare(actual: number, op: Op, expected: number): boolean {
  switch (op) {
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
  }
}

/** Compares in integer units: area fields are converted from ha to ari. */
export function evaluateCondition(cond: Condition, profile: FarmProfile): boolean {
  const isArea = AREA_FIELDS.has(cond.field);
  const expected = isArea ? haToAri(cond.value) : cond.value;
  return compare(profile[cond.field], cond.op, expected);
}

function toFailed(cond: Condition, profile: FarmProfile): FailedCondition {
  const isArea = AREA_FIELDS.has(cond.field);
  return {
    field: cond.field,
    op: cond.op,
    expected: cond.value,
    actual: isArea ? profile[cond.field] / 100 : profile[cond.field],
  };
}

function isConditional(rule: Rule): rule is Extract<Rule, { if: unknown }> {
  return 'if' in rule;
}

/** Evaluates one rule; returns the conditions that failed (empty = passed). */
export function evaluateRule(rule: Rule, profile: FarmProfile): FailedCondition[] {
  if (isConditional(rule)) {
    if (!evaluateCondition(rule.if, profile)) return [];
    return rule.then.filter((c) => !evaluateCondition(c, profile)).map((c) => toFailed(c, profile));
  }
  return evaluateCondition(rule, profile) ? [] : [toFailed(rule, profile)];
}

export function checkEligibility(scheme: Scheme, profile: FarmProfile): EligibilityResult {
  const failed: FailedCondition[] = [];
  const unverified: UnverifiedRule[] = [];

  for (const rule of scheme.eligibility.rules) {
    failed.push(...evaluateRule(rule, profile));

    if (isConditional(rule)) {
      // A conditional rule only matters when its "if" applies to this farm.
      if (rule.status === 'DE-VERIFICAT' && evaluateCondition(rule.if, profile)) {
        unverified.push({ ...pick(rule.if), note: rule.note });
      }
    } else if (rule.status === 'DE-VERIFICAT') {
      unverified.push({ ...pick(rule), note: rule.note });
    }
  }

  // A farm must have at least one unit the scheme pays for.
  if (profile[scheme.units_field] <= 0) {
    failed.push({ field: scheme.units_field, op: '>', expected: 0, actual: 0 });
  }

  return { eligible: failed.length === 0, failed, unverified };
}

function pick(c: Condition): Omit<UnverifiedRule, 'note'> {
  return { field: c.field, op: c.op, value: c.value };
}
