import { Router, type Response } from 'express';
import {
  ConfirmOccurrenceSchema,
  EventInputSchema,
  EventPatchSchema,
  OccurrenceInputSchema,
  buildFarmPlan,
  eventPatchRow,
  eventRow,
  farmToday,
  isSeriesDate,
  leiToBani,
  monthKey,
  occurrenceRow,
  patchedEvent,
  rowsAfterSeriesChange,
  splitSeries,
  todayInRomania,
  type AppData,
  type StoredEvent,
  type SubsidyParams,
} from '@cropcash/shared';
import { EventsError, type EventStore } from '../db/events';
import type { Repo } from '../db/repo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The farmer's own calendar events (docs/calendar-events-plan.md). Nothing here moves money: a
 * planned sum only changes the plan, and „Ai plătit?” records a sale or expense that already
 * happened, through the same path as the forms. Each write answers with the new safe salary.
 */
export function eventsRouter(repo: Repo, events: EventStore, data: AppData, params: SubsidyParams, now: () => Date): Router {
  const r = Router();
  const knownCrop = (id: string | null | undefined, farm: { harvests?: { ownCrops?: { id: string }[] } | null }) =>
    !id || data.crops.crops.some((c) => c.id === id) || !!farm.harvests?.ownCrops?.some((c) => c.id === id);
  const todayFor = (farm: { demo_now?: string | null }) => farmToday(farm, todayInRomania(now()));
  const salaryNow = async (token: string) => {
    const farm = await repo.getMyFarm(token);
    return farm ? buildFarmPlan(farm, data, { month: monthKey(todayFor(farm)), params }).salary.salary : null;
  };
  const fail = (res: Response, err: unknown) => {
    if (!(err instanceof EventsError)) throw err;
    res.status(err.status).json({ error: err.code });
  };
  const bad = (res: Response, error = 'invalid_input') => res.status(400).json({ error });
  /** The event, or a 404 already sent. */
  const load = async (res: Response, id: string): Promise<StoredEvent | null> => {
    if (!UUID.test(id)) {
      bad(res);
      return null;
    }
    const event = await events.get(res.locals.auth.token, id);
    if (!event) res.status(404).json({ error: 'not_found' });
    return event;
  };

  r.post('/events', async (req, res) => {
    const parsed = EventInputSchema.safeParse(req.body);
    if (!parsed.success) return void bad(res);
    const { token } = res.locals.auth;
    const farm = await repo.getMyFarm(token);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    if (!knownCrop(parsed.data.cropId, farm)) return void bad(res);
    const { clientId, ...input } = parsed.data;
    try {
      const id = await events.add(token, farm.id, eventRow(input), clientId);
      res.status(201).json({ id, salary: await salaryNow(token) });
    } catch (err) {
      fail(res, err);
    }
  });

  /** „Toate” or „De acum înainte”. Answers how many one-day changes were lost. */
  r.put('/events/:id', async (req, res) => {
    const parsed = EventPatchSchema.safeParse(req.body);
    if (!parsed.success) return void bad(res);
    const event = await load(res, req.params.id);
    if (!event) return;
    const { token } = res.locals.auth;
    const farm = await repo.getMyFarm(token);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    const patch = parsed.data;
    if (patch.cropId !== undefined && !knownCrop(patch.cropId, farm)) return void bad(res);
    try {
      if (patch.scope === 'following') {
        const split = splitSeries(event, patch.from!, patch, patch.newId!);
        if (!split) return void bad(res);
        const { id: _id, farm_event_occurrences: _rows, created_at: _c, ...next } = split.next;
        await events.split(
          token,
          event.id,
          patch.from!,
          { ...next, id: split.next.id },
          (split.next.farm_event_occurrences ?? []).map((o) => o.original_date),
          split.lost.map((o) => o.original_date),
        );
        res.json({ lost: split.lost.length, id: split.next.id, salary: await salaryNow(token) });
        return;
      }
      const after = patchedEvent(event, patch);
      if (!after) return void bad(res);
      const { lost } = rowsAfterSeriesChange(event, after);
      await events.update(token, event.id, eventPatchRow(patch), lost.map((o) => o.original_date));
      res.json({ lost: lost.length, id: event.id, salary: await salaryNow(token) });
    } catch (err) {
      fail(res, err);
    }
  });

  r.delete('/events/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return void bad(res);
    const removed = await events.remove(res.locals.auth.token, req.params.id);
    res.status(removed ? 204 : 404).end();
  });

  /** „Doar asta”: one date's own changes, a tick, or a cancel. */
  r.put('/events/:id/occurrences/:date', async (req, res) => {
    const parsed = OccurrenceInputSchema.safeParse(req.body);
    if (!parsed.success || !DAY.test(req.params.date)) return void bad(res);
    const event = await load(res, req.params.id);
    if (!event) return;
    if (!isSeriesDate(event, req.params.date)) return void bad(res);
    if (parsed.data.amountLei != null && event.category !== 'money') return void bad(res);
    const { token } = res.locals.auth;
    const farm = await repo.getMyFarm(token);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    const old = event.farm_event_occurrences?.find((o) => o.original_date === req.params.date);
    try {
      await events.setOccurrence(token, farm.id, occurrenceRow(event.id, req.params.date, parsed.data, old, now()));
      res.json({ salary: await salaryNow(token) });
    } catch (err) {
      fail(res, err);
    }
  });

  /** „Da, am plătit / am primit”: records the real expense or sale and ties it to this date. */
  r.post('/events/:id/occurrences/:date/confirm', async (req, res) => {
    const parsed = ConfirmOccurrenceSchema.safeParse(req.body);
    if (!parsed.success || !DAY.test(req.params.date)) return void bad(res);
    const event = await load(res, req.params.id);
    if (!event) return;
    if (event.category !== 'money' || !event.direction || !isSeriesDate(event, req.params.date)) return void bad(res);
    const { token } = res.locals.auth;
    const farm = await repo.getMyFarm(token);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    const confirm = parsed.data;
    if (confirm.date > todayFor(farm)) return void bad(res, 'future_date');
    const old = event.farm_event_occurrences?.find((o) => o.original_date === req.params.date);
    if (old?.transaction_id) return void res.status(201).json({ transactionId: old.transaction_id, salary: await salaryNow(token) });
    const amountBani = leiToBani(confirm.amountLei);
    const common = { amountBani, date: confirm.date, cropId: event.crop_id ?? undefined, note: event.title, clientId: confirm.clientId };
    try {
      const transactionId =
        event.direction === 'out'
          ? await repo.addExpense(token, { ...common, category: event.expense_category ?? 'other', plotId: event.plot_id ?? undefined })
          : await repo.addSale(token, farm.id, { ...common, cropId: common.cropId as string });
      await events.setOccurrence(token, farm.id, { ...occurrenceRow(event.id, req.params.date, { done: true }, old, now()), transaction_id: transactionId });
      res.status(201).json({ transactionId, salary: await salaryNow(token) });
    } catch (err) {
      fail(res, err);
    }
  });

  return r;
}
