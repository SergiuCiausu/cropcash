import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ion from '../../docs/data/demo-ion.json';
import { loadData } from '../../packages/shared/src/data/index';
import type { StoredFarm } from '../../packages/shared/src/farm/index';
import { leiToBani } from '../../packages/shared/src/money/index';
import { ASSISTANT_CARDS, type CardType } from '../../packages/shared/src/functions/cards';
import { buildFarmPlan } from '../../packages/shared/src/functions/plan';
import { findRead } from '../../packages/shared/src/functions/registry';
import { forApi } from '../components/app/Assistant';
import { AssistantCards, AssistantCardView } from '../components/assistant-cards';
import { exact, signedLei } from './cc/format';

/* Ion's demo farm on the demo's first day, as in packages/shared/src/functions/cards.test.ts. */
const data = loadData();
const farm = {
  id: 'farm-ion',
  name: ion.name,
  county: ion.county,
  birth_year: data.subsidies.meta.campaign_year - ion.age,
  start_balance_bani: leiToBani(ion.start_balance_lei),
  parcels: ion.parcels.map((p) => ({ crop_id: p.crop_id, area_ari: p.area_ha * 100, is_arable: true })),
} as StoredFarm;
const today = ion.demo_start.value;
const plan = buildFarmPlan(farm, data, { month: today.slice(0, 7) });
const ctx = { farm, plan, data, today };
const months = plan.timelines.medium.months.map((m) => m.key);

/** What the API would send: the card's own function run on Ion's farm. */
const real = (type: CardType, input: unknown) => findRead(ASSISTANT_CARDS[type].fn)!.execute(input, ctx).data as Record<string, unknown>;
const html = (type: CardType, d: unknown) => renderToStaticMarkup(createElement(AssistantCardView, { type, data: d }));
const clean = (out: string) => {
  expect(out).not.toMatch(/undefined|NaN|null|\[object/);
  return out;
};

describe('assistant cards on screen', () => {
  it('draws a purchase with the figures check_purchase gave', () => {
    const d = real('purchase', { amount: plan.salary.salary, month: months[4] });
    const out = clean(html('purchase', d));
    expect(out).toContain(`${exact(d.amount as number)} lei`);
    expect(out).toContain(`${exact(d.salaryBefore as number)} lei`);
    expect(out).toContain(`${exact(d.salaryAfter as number)} lei`);
    expect(out).toContain(signedLei((d.lowestAfter as { balance: number }).balance));
    expect(out).not.toMatch(/\b(Da|Nu),? (poți|cumpără)/);
  });

  it('warns when a purchase leaves the account short', () => {
    const d = real('purchase', { amount: leiToBani(ion.start_balance_lei) * 10 });
    expect(d.goesShort).toBe(true);
    expect(clean(html('purchase', d))).toContain('ți-ar lipsi bani');
  });

  it.each(['bad', 'medium', 'good'] as const)('draws the salary and the months for a %s year', (scenario) => {
    const salary = real('salary', { scenario });
    expect(clean(html('salary', salary))).toContain(`${exact(salary.salary as number)} lei`);
    const forecast = real('months', { scenario });
    const out = clean(html('months', forecast));
    expect(out.match(/<rect /g)).toHaveLength(12);
    expect(out).toContain(signedLei(forecast.endBalance as number));
  });

  it('says so instead of drawing data that does not check out', () => {
    const out = html('salary', { salary: '850 lei' });
    expect(out).toContain('Nu pot arăta cardul');
    expect(out).not.toContain('850');
  });

  it('shows nothing for no cards', () => {
    expect(renderToStaticMarkup(createElement(AssistantCards, { cards: undefined }))).toBe('');
    expect(renderToStaticMarkup(createElement(AssistantCards, { cards: [] }))).toBe('');
  });

  /* Inputs the model could send, from Ion's own plan; every card type is listed, so a new one fails here first. */
  const salary = plan.salary.salary;
  const minLei = data.params.pension_suggest_min_lei.value;
  const INPUTS: Record<CardType, unknown[]> = {
    purchase: [{ amount: salary }],
    salary: [{ scenario: 'bad' }, { scenario: 'good' }],
    months: [{ scenario: 'medium' }],
    tight_months: [{ scenario: 'bad' }, { scenario: 'medium' }, { scenario: 'good' }],
    subsidy: [{}],
    credit: [
      { amountLei: Math.round(salary / 100), takeMonth: months[3], repayMonth: months[9] },
      { amountLei: 9_000_000, takeMonth: months[0], repayMonth: months[9] },
    ],
    upcoming: [{}, { days: 366 }],
    pension: [{ monthly: leiToBani(minLei) }, { monthly: leiToBani(minLei) - 100 }],
    pension_change: [{ monthlyLei: 0 }, { monthlyLei: minLei }],
  };

  it.each(Object.keys(INPUTS) as CardType[])("draws %s from its function's real output", (type) => {
    for (const input of INPUTS[type]) {
      const out = clean(html(type, real(type, input)));
      expect(out, JSON.stringify(input)).toContain('ask-card');
      expect(out).not.toContain('Nu pot arăta cardul');
    }
  });

  it('shows the subsidy as a range, with advance and balance that add up to the probable total', () => {
    const d = real('subsidy', {}) as { totals: { lei: { min: number; probable: number; max: number }; advanceLei: number; balanceLei: { probable: number } } };
    const out = clean(html('subsidy', d));
    for (const v of [d.totals.lei.min, d.totals.lei.probable, d.totals.lei.max, d.totals.advanceLei]) expect(out).toContain(`${exact(v)} lei`);
    expect(d.totals.advanceLei + d.totals.balanceLei.probable).toBe(d.totals.lei.probable);
  });

  it('warns when a credit is over the APIA certificate limit', () => {
    const d = real('credit', INPUTS.credit[1]);
    expect(d.withinLimit).toBe(false);
    expect(clean(html('credit', d))).toContain('mai mare decât se poate lua');
  });

  it('names what comes next as the calendar does, never by id', () => {
    const entries = real('upcoming', { days: 366 }) as unknown as { id: string; eventId?: string; kind: string }[];
    const out = clean(html('upcoming', entries));
    /* Payments are named by kind ("Avansul de la APIA"); deadlines and paperwork by their calendar event. */
    const titled = entries.slice(0, 6).filter((e) => e.eventId && (e.kind === 'deadline' || e.kind === 'admin'));
    expect(titled.length).toBeGreaterThan(0);
    for (const e of titled) expect(out).toContain(data.calendar.events.find((x) => x.id === e.eventId)!.title_ro.replace(/&/g, '&amp;'));
    expect(out).not.toContain('>Termen<');
  });

  it('says a pension under the fund minimum is under it', () => {
    expect(clean(html('pension', real('pension', INPUTS.pension[1])))).toContain('sub minimul fondului');
    expect(clean(html('pension', real('pension', INPUTS.pension[0])))).not.toContain('sub minimul fondului');
  });

  it('survives whatever a saved conversation holds', () => {
    const out = renderToStaticMarkup(createElement(AssistantCards, { cards: [null, 'x', 42, { type: 'salary' }] }));
    expect(out.match(/Nu pot arăta cardul/g)).toHaveLength(4);
    expect(renderToStaticMarkup(createElement(AssistantCards, { cards: { type: 'salary' } }))).toBe('');
  });

  it('never sends cards back to the API, whose messages hold only role and text', () => {
    const turns = [
      { role: 'user' as const, text: 'Cât am salariu?' },
      { role: 'assistant' as const, text: 'Uite.', cards: [{ type: 'salary', data: real('salary', { scenario: 'medium' }) }] },
      { role: 'user' as const, text: 'Și într-un an slab?' },
    ];
    expect(forApi(turns)).toEqual(turns.map(({ role, text }) => ({ role, text })));
  });
});
