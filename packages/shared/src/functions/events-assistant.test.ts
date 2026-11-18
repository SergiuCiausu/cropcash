import { describe, expect, it } from 'vitest';
import type { StoredEvent } from '../calendar/events';
import { loadData } from '../data';
import type { ReadContext } from './define';
import { buildFarmPlan } from './plan';
import { addEvent } from './events';
import { explainDriversFn, listUpcoming } from './registry';

/* What the assistant can see and do with the farmer's own calendar (docs/calendar-events-plan.md, step 12). */
const data = loadData();
const event = (e: Partial<StoredEvent>): StoredEvent =>
  ({ id: 'e', category: 'other', title: 'x', note: null, starts_on: '2027-03-20', ends_on: null, at_time: null, repeat: 'none', repeat_until: null, remind_days_before: null, crop_id: null, plot_id: null, direction: null, amount_bani: null, expense_category: null, replaces_estimate: false, created_at: '2027-03-01T00:00:00Z', farm_event_occurrences: [], ...e }) as StoredEvent;
const farm = {
  birth_year: data.subsidies.meta.campaign_year - 55,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
  farm_events: [
    event({ id: 'vet', category: 'animals', title: 'Vine veterinarul', starts_on: '2027-03-20' }),
    event({ id: 'rata', category: 'money', title: 'Rata la bancă', starts_on: '2027-03-25', repeat: 'monthly', direction: 'out', amount_bani: 150_000, expense_category: 'other' }),
  ],
};
const ctx = (): ReadContext => ({ farm, plan: buildFarmPlan(farm, data, { month: '2027-03' }), data, today: '2027-03-10' });

describe('the assistant and the farmer’s calendar', () => {
  it('lists the farmer’s notes and sums among what comes next, in date order', () => {
    const list = listUpcoming.execute({ scenario: 'medium', days: 30 }, ctx()).data!;
    expect(list.find((e) => e.kind === 'farmer_note')).toMatchObject({ what: 'Vine veterinarul', date: '2027-03-20', value: 0, direction: 'none' });
    expect(list.find((e) => e.kind === 'farmer_out')).toMatchObject({ what: 'Rata la bancă', date: '2027-03-25', value: 150_000 });
    expect(list.map((e) => e.date)).toEqual([...list.map((e) => e.date)].sort());
  });

  it('ranks what moves the salary, with the farmer’s rate marked as theirs', () => {
    const out = explainDriversFn.execute({}, ctx()).data!;
    expect(out.salaryFixed).toBe(false);
    expect(out.drivers.length).toBeLessThanOrEqual(8);
    expect(out.drivers.length).toBe(Math.min(8, out.total));
    const effects = out.drivers.map((d) => Math.abs(d.salaryEffect));
    expect(effects).toEqual([...effects].sort((a, b) => b - a));
    const all = explainDriversFn.execute({ limit: 30 }, ctx()).data!.drivers;
    expect(all.find((d) => d.eventId === 'rata')).toMatchObject({ own: true, direction: 'out' });
  });

  it('lets the assistant propose a calendar event, never the other event changes', () => {
    expect(addEvent.access).toBe('confirm');
    // The schema still guards what the model sends: a sum only on money, money always with a direction.
    expect(addEvent.input.safeParse({ category: 'animals', title: 'Vaccin', startsOn: '2027-04-15', repeat: 'none', amountLei: 200 }).success).toBe(false);
    expect(addEvent.input.safeParse({ category: 'money', title: 'Rata', startsOn: '2027-04-15', repeat: 'none', amountLei: 1500 }).success).toBe(false);
  });
});
