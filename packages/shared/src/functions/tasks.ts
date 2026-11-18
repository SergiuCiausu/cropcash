import type { AppData } from '../data';
import type { StoredFarm } from '../farm';
import type { FarmPlan } from './plan';

export type TaskStatus = 'open' | 'done' | 'all';

/** The deadlines and admin dates in the plan, soonest first, each marked done or not. */
export function tasksForFarm(plan: FarmPlan, farm: StoredFarm, data: AppData, status: TaskStatus) {
  const done = new Set((farm.task_completions ?? []).map((c) => c.task_id));
  const events = new Map(data.calendar.events.map((e) => [e.id, e]));
  const followedUrls = new Map<string, string>(
    (farm.opportunity_follows ?? []).flatMap(({ opportunities: o }) => (o ? [[`opportunity-${o.id}`, o.url] as const] : [])),
  );
  return plan.timelines.medium.months
    .flatMap((m) => m.entries)
    .filter((e) => (e.kind === 'deadline' || e.kind === 'admin') && e.eventId)
    .map((e) => {
      const event = events.get(e.eventId!);
      const id = `${e.eventId}:${(e.window?.end ?? e.date).slice(0, 4)}`;
      return {
        id,
        eventId: e.eventId!,
        titleRo: event?.title_ro ?? e.what ?? '',
        date: e.date,
        window: e.window,
        /** Projected from last year's dates. */
        estimated: e.estimated,
        unverified: e.unverified,
        done: done.has(id),
        sourceUrl: event?.source_url ?? followedUrls.get(e.eventId!) ?? null,
      };
    })
    .filter((task) => status === 'all' || task.done === (status === 'done'));
}
