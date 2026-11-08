import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { computeSubsidies, normalizeParcels, type FarmInput } from '../subsidies';
import { addMonths, lastDay, midpoint } from './dates';
import { buildTimeline, cropSaleRange, type TimelineOptions } from './timeline';

const data = loadData();
const ion: FarmInput = {
  parcels: [
    { cropId: 'grau', areaHa: 8 },
    { cropId: 'porumb', areaHa: 7 },
  ],
  age: 55,
};
const subsidies = computeSubsidies(ion, data, { exchangeRates: { FEGA: 5.28 } });
const input = { parcels: normalizeParcels(ion.parcels), subsidies, startBalance: 3_500_000 };
const opts: TimelineOptions = { start: '2026-11', months: 12, amounts: 'medium', timing: 'late' };
const tl = buildTimeline(input, data, opts);
const month = (key: string) => tl.months.find((m) => m.key === key)!;
const lei = (bani: number) => bani / 100;

describe('dates', () => {
  it('adds months across years and finds month ends', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(lastDay('2027-02')).toBe('2027-02-28');
    expect(lastDay('2028-02')).toBe('2028-02-29');
    // 211 days apart -> 105.5 days after 1 Dec.
    expect(midpoint('2026-12-01', '2027-06-30')).toBe('2027-03-16');
  });
});

describe('buildTimeline — Ion, normal year, late payments (docs/07 §4)', () => {
  it('covers 12 months from November 2026', () => {
    expect(tl.months.map((m) => m.key)).toEqual(
      Array.from({ length: 12 }, (_, i) => addMonths('2026-11', i)),
    );
  });

  it('APIA advance arrives in November (window already open), 12,652.20 lei', () => {
    const adv = month('2026-11').entries.find((e) => e.kind === 'apia_advance')!;
    expect(lei(adv.value)).toBe(12652.2);
    expect(adv.date).toBe('2026-11-30');
    expect(adv.window).toEqual({ start: '2026-10-16', end: '2026-11-30' });
  });

  it('APIA balance is planned on the last day of its window (30 June)', () => {
    const bal = month('2027-06').entries.find((e) => e.kind === 'apia_balance')!;
    expect(lei(bal.value)).toBe(4217.4);
    expect(bal.amount!.min).toBeLessThan(bal.amount!.probable);
  });

  it('crop costs follow the monthly shares from crops-reference.json', () => {
    expect(lei(month('2027-03').out)).toBe(13750);
    expect(lei(month('2027-04').out)).toBe(20850);
    expect(lei(month('2027-05').out)).toBe(5250);
    expect(lei(month('2027-06').out)).toBe(3500);
  });

  it('wheat sells in July, corn in October', () => {
    expect(lei(month('2027-07').in)).toBe(42000);
    expect(lei(month('2027-10').in)).toBeGreaterThanOrEqual(43225);
  });

  it('the hard months are March–May and the low point is May', () => {
    expect(tl.hardMonths).toEqual(['2027-03', '2027-04', '2027-05']);
    expect(tl.lowest.key).toBe('2027-05');
    expect(lei(tl.lowest.balance)).toBeCloseTo(7802.2, 2);
  });

  it('includes deadlines: Declarația Unică (confirmed) and an estimated 2027 APIA application', () => {
    const du = tl.months.flatMap((m) => m.entries).find((e) => e.eventId === 'declaratia-unica')!;
    expect(du.date).toBe('2027-05-25');
    expect(du.estimated).toBe(false);

    const cerere = tl.months.flatMap((m) => m.entries).find((e) => e.eventId === 'apia-cerere')!;
    expect(cerere.date).toBe('2027-06-05');
    expect(cerere.estimated).toBe(true);
  });

  it('marks DE-VERIFICAT items (fuel excise agreement deadline)', () => {
    const acciza = month('2026-12').entries.find((e) => e.eventId === 'acciza-acord-prealabil')!;
    expect(acciza.unverified).toBe(true);
  });

  it('skips the credit due date when no credit is declared', () => {
    const ids = tl.months.flatMap((m) => m.entries).map((e) => e.eventId);
    expect(ids).not.toContain('credit-adeverinta-scadenta');
  });

  it('running balance adds up', () => {
    const net = tl.months.reduce((s, m) => s + m.net, 0);
    expect(tl.months.at(-1)!.balanceEnd).toBe(input.startBalance + net);
  });
});

describe('scenarios', () => {
  it('drought: minimum yield at the mean price, the same costs, minimum subsidy', () => {
    const bad = buildTimeline(input, data, { ...opts, amounts: 'bad' });
    const jul = bad.months.find((m) => m.key === '2027-07')!;
    expect(lei(jul.in)).toBe(33600); // 8 ha × 4 t × 1,05 lei/kg
    const mar = bad.months.find((m) => m.key === '2027-03')!;
    expect(lei(mar.out)).toBe(8 * 4250 * 0.25 + 7 * 5000 * 0.15);
    expect(bad.lowest.balance).toBeLessThan(tl.lowest.balance);
  });

  it('early timing brings the APIA balance to December', () => {
    const early = buildTimeline(input, data, { ...opts, timing: 'early' });
    expect(early.months.find((m) => m.key === '2026-12')!.entries.some((e) => e.kind === 'apia_balance')).toBe(true);
  });

  it('corn sale range: only the yield moves, at the mean price', () => {
    const corn = data.crops.crops.find((c) => c.id === 'porumb')!;
    const r = cropSaleRange(corn, 700);
    expect([r.min, r.probable, r.max].map(lei)).toEqual([33250, 43225, 53200]);
  });

  it('a farm with no money going out has no hard months', () => {
    const t = buildTimeline({ ...input, parcels: [] }, data, opts);
    expect(t.hardMonths).toEqual([]);
  });
});
