/* The next money the plan expects, for any page that names it. */
import { daysLeft } from '../cc/format';
import type { FarmView } from '../cc/plan';

export function nextMoneyIn(view: FarmView) {
  return (
    view
      .farmPlan()
      .timelines.medium.months.flatMap((m) => m.entries.map((e) => view.planItem(e, m.key)))
      .filter((item) => item.direction === 'in' && item.date && daysLeft(item.date, view.today) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  );
}
