import { describe, expect, it } from 'vitest';
import { loadData, type AppData } from '../data';
import { pensionOptions } from './options';

const data = loadData();

describe('pensionOptions', () => {
  it('takes the state figures from pension-options.json, in bani', () => {
    const o = pensionOptions(data, 55);
    expect(o.state.contractMonthly).toBe(108_100);
    expect(o.state.declarationYearly).toBe(1_215_000);
    expect(o.state.minimumPension).toBe(128_100);
    expect(o.state.minimumYears).toBe(15);
  });

  it('flags the Declarația Unică figure, which is still to check', () => {
    expect(pensionOptions(data, 55).state.declarationVerified).toBe(false);
  });

  it('gives the lowest confirmed fund minimum, never an unconfirmed one', () => {
    const o = pensionOptions(data, 55);
    const confirmed = data.pensionFunds.funds.filter((f) => f.status !== 'DE-VERIFICAT' && f.min_monthly_lei !== null);
    expect(o.pilon3.lowestMonthly).toBe(Math.min(...confirmed.map((f) => f.min_monthly_lei!)) * 100);
    const cheaperButShaky: AppData = {
      ...data,
      pensionFunds: { ...data.pensionFunds, funds: [...data.pensionFunds.funds, { id: 'x', name: 'X', administrator: null, min_monthly_lei: 1, status: 'DE-VERIFICAT', source_url: 'https://x.ro' }] },
    };
    expect(pensionOptions(cheaperButShaky, 55).pilon3.lowestMonthly).toBe(o.pilon3.lowestMonthly);
  });

  it('lists every fund A to Z, with its minimum in bani and whether it is confirmed', () => {
    const funds = pensionOptions(data, 55).pilon3.funds;
    expect(funds).toHaveLength(data.pensionFunds.funds.length);
    expect(funds.map((f) => f.name)).toEqual([...funds.map((f) => f.name)].sort((a, b) => a.localeCompare(b, 'ro')));
    expect(funds.find((f) => f.name === 'Stabil')).toMatchObject({ minMonthly: 2_500, verified: true });
    expect(funds.find((f) => f.name === 'AZT Moderato')).toMatchObject({ minMonthly: 5_000, verified: false });
    expect(funds.find((f) => f.name === 'Pensia Mea')).toMatchObject({ minMonthly: null, verified: false });
  });

  it('keeps the CEI ceiling null while no source gives it', () => {
    expect(pensionOptions(data, 55).cei).toEqual({ availableFrom: '2027-01-01', ceilingYearly: null });
  });

  it('says when starting now is too late for the minimum state pension', () => {
    expect(pensionOptions(data, 55)).toMatchObject({ yearsLeft: 10, enoughYearsForMinimum: false });
    expect(pensionOptions(data, 45)).toMatchObject({ yearsLeft: 20, enoughYearsForMinimum: true });
    expect(pensionOptions(data, 70).yearsLeft).toBe(0);
  });
});
