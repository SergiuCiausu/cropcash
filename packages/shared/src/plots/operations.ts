/* Work on a parcel: what's done, what's still to do, what's late. "To do" is what the farmer planned,
   plus a crop's typical work from docs/data when it has a cited source and nothing covers it yet. */
import type { OperationKind, OperationTemplate, StoredOperation } from './model';

export interface TodoItem {
  kind: OperationKind;
  /** The planned row, or null for a suggestion from the crop's typical work. */
  operationId: string | null;
  templateId: string | null;
  /** The target day for a planned row; the last day it fits for a suggestion. Null when not known. */
  due: string | null;
  overdue: boolean;
}

export interface OperationsStatus {
  done: StoredOperation[];
  todo: TodoItem[];
  overdue: TodoItem[];
  /** The earliest thing to do that isn't late. */
  next: TodoItem | null;
}

const lastDayOf = (year: number, month: number) => {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
};

/**
 * Status of one parcel's work in a harvest year. `templates` are for the crop growing on it; a
 * template counts as covered once an operation carries its id.
 */
export function operationsStatus(
  plotId: string,
  harvestYear: number,
  operations: readonly StoredOperation[],
  templates: readonly OperationTemplate[],
  today: string,
): OperationsStatus {
  const mine = operations.filter((o) => o.plot_id === plotId && o.harvest_year === harvestYear);
  const done = mine.filter((o) => o.status === 'done').sort((a, b) => (a.on_date ?? '').localeCompare(b.on_date ?? ''));
  const covered = new Set(mine.map((o) => o.template_id).filter(Boolean));

  const planned: TodoItem[] = mine
    .filter((o) => o.status === 'planned')
    .map((o) => ({ kind: o.kind, operationId: o.id, templateId: o.template_id, due: o.on_date, overdue: !!o.on_date && o.on_date < today }));

  const suggested: TodoItem[] = templates
    .filter((t) => !covered.has(t.id))
    .map((t) => {
      // November and December belong to the autumn before the harvest year (harvestYear in farm/harvests.ts).
      const year = t.to_month >= 11 ? harvestYear - 1 : harvestYear;
      const due = lastDayOf(year, t.to_month);
      return { kind: t.kind, operationId: null, templateId: t.id, due, overdue: due < today };
    });

  const todo = [...planned, ...suggested].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  const overdue = todo.filter((t) => t.overdue);
  return { done, todo, overdue, next: todo.find((t) => !t.overdue) ?? null };
}

/** True when something is due within `days` of today (and isn't late). */
export function dueWithin(item: TodoItem | null, today: string, days: number): boolean {
  if (!item?.due || item.overdue) return false;
  const ms = Date.parse(`${item.due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return ms <= days * 86_400_000;
}
