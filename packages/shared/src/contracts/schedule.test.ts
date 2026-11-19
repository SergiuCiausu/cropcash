/* A contract's money schedule as dated flows (docs/contracts-plan.md §2.2). */
import { describe, expect, it } from 'vitest';
import type { StoredContractPayment, StoredFarmContract } from './model';
import { farmContractFlows, paymentAmount, paymentDates } from './schedule';

const pay = (over: Partial<StoredContractPayment>): StoredContractPayment => ({
  id: 'p1',
  contract_id: 'c1',
  direction: 'out',
  label: null,
  first_on: '2027-01-31',
  repeat: 'none',
  times: null,
  amount_bani: 100_000,
  per_ha: false,
  kg: null,
  crop_id: null,
  ...over,
});
const contract = { id: 'c1', kind: 'service', area_ari: null, residual_bani: null, decision: null } as Pick<StoredFarmContract, 'id' | 'kind' | 'area_ari' | 'residual_bani' | 'decision'>;

describe('the days a row falls on', () => {
  it('monthly from the 31st: the month’s last day, then back to the 31st', () => {
    expect(paymentDates(pay({ repeat: 'monthly', times: 4 }), null, '2027-01-01', '2027-12-31')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('yearly from 29 February: 28 February, and 29 again in a leap year', () => {
    expect(paymentDates(pay({ first_on: '2028-02-29', repeat: 'yearly' }), null, '2028-01-01', '2032-12-31')).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
  });

  it('quarterly, only inside the window, and fast from far ahead', () => {
    expect(paymentDates(pay({ first_on: '2027-01-15', repeat: 'quarterly' }), null, '2027-05-01', '2027-12-31')).toEqual(['2027-07-15', '2027-10-15']);
    const far = paymentDates(pay({ first_on: '2027-01-15', repeat: 'monthly' }), null, '2077-01-01', '2077-03-31');
    expect(far).toEqual(['2077-01-15', '2077-02-15', '2077-03-15']);
  });

  it('a fixed number of times: 48 leasing rates end with the 48th', () => {
    const rates = paymentDates(pay({ first_on: '2023-07-31', repeat: 'monthly', times: 48 }), null, '2023-01-01', '2030-12-31');
    expect(rates).toHaveLength(48);
    expect(rates.at(-1)).toBe('2027-06-30');
  });

  it('a repeat never runs past the day the contract stops; a one-off isn’t its business', () => {
    expect(paymentDates(pay({ first_on: '2027-03-01', repeat: 'yearly' }), '2028-12-31', '2027-01-01', '2032-12-31')).toEqual(['2027-03-01', '2028-03-01']);
  });
});

describe('amounts', () => {
  it('per ha times the contract’s area; unknown without it, never 0', () => {
    expect(paymentAmount({ amount_bani: 35_000, per_ha: true }, 12_050)).toBe(4_217_500);
    expect(paymentAmount({ amount_bani: 35_000, per_ha: true }, null)).toBeNull();
    expect(paymentAmount({ amount_bani: 35_000, per_ha: false }, null)).toBe(35_000);
  });
});

describe('a contract’s flows', () => {
  it('a sale: the advance at signing (before the window starts it’s left out) and the deliveries in kind', () => {
    const rows = [
      pay({ id: 'adv', direction: 'in', label: 'Avans', first_on: '2026-11-10', amount_bani: 4_200_000 }),
      pay({ id: 'd1', direction: 'in', first_on: '2027-07-15', amount_bani: 8_400_000, kg: 100_000, crop_id: 'grau' }),
      pay({ id: 'd2', direction: 'in', first_on: '2027-08-10', amount_bani: 8_400_000, kg: 100_000, crop_id: 'grau' }),
      pay({ id: 'other', contract_id: 'c2', first_on: '2027-07-01' }),
    ];
    const flows = farmContractFlows({ ...contract, kind: 'sale' }, rows, '2027-08-31', '2026-11-18', '2027-12-31');
    expect(flows.map((f) => [f.paymentId, f.date, f.amountBani, f.kg])).toEqual([
      ['d1', '2027-07-15', 8_400_000, 100_000],
      ['d2', '2027-08-10', 8_400_000, 100_000],
    ]);
    expect(flows.every((f) => f.direction === 'in' && f.source === 'contract' && f.cropId === 'grau')).toBe(true);
  });

  it('a leasing bought out adds its residual value on the last day; without the decision it doesn’t', () => {
    const leasing = { ...contract, kind: 'leasing' as const, residual_bani: 1_500_000 };
    const rates = [pay({ first_on: '2027-01-31', repeat: 'monthly', times: 6 })];
    expect(farmContractFlows({ ...leasing, decision: 'buy_out' }, rates, '2027-06-30', '2027-01-01', '2027-12-31').at(-1)).toMatchObject({ date: '2027-06-30', amountBani: 1_500_000, label: 'residual', paymentId: null });
    expect(farmContractFlows(leasing, rates, '2027-06-30', '2027-01-01', '2027-12-31')).toHaveLength(6);
  });
});
