import type { FailedCondition } from '@cropcash/shared';
import { t } from '../i18n';
import { formatHa } from './format';

const AREA = new Set(['total_ha', 'arable_ha', 'unproductive_ha']);

/** Turns a failed eligibility condition into a plain-Romanian reason from ro.json. */
export function failedConditionText(c: FailedCondition): string {
  const fmt = (v: number) => (AREA.has(c.field) ? formatHa(v) : String(v));
  const key = `subsidy.reasons.${c.field}.${opKey(c.op)}`;
  const text = t(key, { expected: fmt(c.expected), actual: fmt(c.actual) });
  return text === key ? t('subsidy.reasons.generic') : text;
}

function opKey(op: FailedCondition['op']): string {
  return { '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte', '==': 'eq', '!=': 'neq' }[op];
}
