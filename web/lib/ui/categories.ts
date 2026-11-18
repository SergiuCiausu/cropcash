/* The farmer's names for expense categories, in the picker's order. One list, so the record sheet,
   the cost table and the assistant always agree. */
import { expenseCategory, type ExpenseCategory } from '../../../packages/shared/src/farm/plan-inputs';

export const EXPENSE_LABELS: [ExpenseCategory, string][] = [
  ['seeds', 'Sămânță'],
  ['fertilizer', 'Îngrășăminte'],
  ['treatments', 'Tratamente'],
  ['diesel', 'Motorină'],
  ['field_work', 'Lucrări'],
  ['rent', 'Arendă'],
  ['salaries', 'Salarii'],
  ['constructions', 'Construcții'],
  ['machine_service', 'Service'],
  ['services', 'Alte servicii'],
  ['other', 'Altele'],
];

/** The label of a stored category. An old name (`repairs`) shows under the category that replaced it. */
export function expenseLabel(category: string | null | undefined): string | undefined {
  const current = expenseCategory(category);
  return EXPENSE_LABELS.find(([k]) => k === current)?.[1];
}
