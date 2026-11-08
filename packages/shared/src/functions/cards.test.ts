import { describe, expect, it } from 'vitest';
import ion from '../../../../docs/data/demo-ion.json';
import { loadData } from '../data';
import type { StoredFarm } from '../farm';
import { leiToBani } from '../money';
import { ASSISTANT_CARDS, CARD_TYPES, isCardType, parseCard, type CardType } from './cards';
import { buildFarmPlan } from './plan';
import { findRead } from './registry';

/* Ion's demo farm, as seed:demo stores it, on the demo's first day. */
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
const salary = plan.salary.salary;

/* Inputs the model could send, built from Ion's own plan (no amounts of our own). */
const inputs: Record<CardType, unknown[]> = {
  purchase: [{ amount: salary }, { amount: salary, month: months.at(-1) }],
  salary: [{ scenario: 'bad' }, { scenario: 'medium' }, { scenario: 'good' }],
  months: [{ scenario: 'bad' }, { scenario: 'medium' }, { scenario: 'good' }],
  tight_months: [{ scenario: 'bad' }, { scenario: 'medium' }, { scenario: 'good' }],
  subsidy: [{}],
  credit: [{ amountLei: Math.round(salary / 100), takeMonth: months[3], repayMonth: months[9] }],
  upcoming: [{}, { days: 366 }],
  pension: [{ monthly: data.params.pension_suggest_min_lei.value * 100 }],
  pension_change: [{ monthlyLei: 0 }, { monthlyLei: data.params.pension_suggest_min_lei.value }],
};

describe('assistant cards', () => {
  it('names only read functions from the registry', () => {
    for (const type of CARD_TYPES) expect(findRead(ASSISTANT_CARDS[type].fn), type).toBeDefined();
  });

  it.each(CARD_TYPES)("accepts what %s's function returns for Ion's farm", (type) => {
    for (const input of inputs[type]) {
      const out = findRead(ASSISTANT_CARDS[type].fn)!.execute(input, ctx).data;
      expect(out, `${type} ${JSON.stringify(input)}`).not.toBeNull();
      const card = parseCard(type, out);
      if (!card) throw ASSISTANT_CARDS[type].data.safeParse(out).error;
      expect(card.type).toBe(type);
    }
  });

  it('keeps the figures exactly as the function gave them', () => {
    const out = findRead('check_purchase')!.execute({ amount: salary }, ctx).data as Record<string, unknown>;
    const card = parseCard('purchase', out)!;
    expect(card.data).toMatchObject({ amount: out.amount, salaryBefore: out.salaryBefore, salaryAfter: out.salaryAfter });
  });

  it('refuses unknown types, missing data and amounts that are not whole bani', () => {
    expect(isCardType('toString')).toBe(false);
    expect(parseCard('chart', {})).toBeNull();
    expect(parseCard('purchase', null)).toBeNull();
    const out = findRead('check_purchase')!.execute({ amount: salary }, ctx).data as Record<string, unknown>;
    expect(parseCard('purchase', { ...out, salaryAfter: 1.5 })).toBeNull();
    expect(parseCard('purchase', { ...out, salaryAfter: '1.686.577 lei' })).toBeNull();
  });
});
