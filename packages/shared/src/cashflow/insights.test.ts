import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { computeSubsidies, normalizeParcels } from '../subsidies';
import { buildTimeline, type TimelineOptions } from './timeline';
import { costsByCrop, cropEconomics, riskFundTarget, springNeed, upcoming } from './insights';

const data = loadData();
const crop = (id: string) => data.crops.crops.find((c) => c.id === id)!;
const farm = { parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 7 }], age: 55 };
const subsidies = computeSubsidies(farm, data, { exchangeRates: { FEGA: 5.28 } });
const input = { parcels: normalizeParcels(farm.parcels), subsidies, startBalance: 3_500_000 };
const opts: TimelineOptions = { start: '2026-11', months: 12, amounts: 'medium', timing: 'late' };
const normal = buildTimeline(input, data, opts);
const bad = buildTimeline(input, data, { ...opts, amounts: 'bad' });

describe('cropEconomics', () => {
  it('wheat on 8 ha: 40 t, 42,000 lei income, 34,000 lei cost, 1,000 lei margin/ha', () => {
    const e = cropEconomics(crop('grau'), 800);
    expect(e.productionT).toBe(40);
    expect(e.pricePerT).toBe(105_000);
    expect(e.income).toBe(4_200_000);
    expect(e.cost).toBe(3_400_000);
    expect(e.marginPerHa).toBe(100_000);
    expect(e.breakEvenPerKg).toBe(85); // 0,85 lei/kg, docs/02
  });

  it('corn break-even ≈ 0,77 lei/kg', () => {
    expect(cropEconomics(crop('porumb'), 700).breakEvenPerKg).toBe(77);
  });
});

describe('reserves', () => {
  it('a bad year costs Ion ≈ 33.100 lei over the next 12 months (docs/07 §5)', () => {
    const target = riskFundTarget(normal, bad);
    expect(target % 10_000).toBe(0);
    // Wheat −8.400, corn −9.975, APIA balance lower, costs higher.
    expect(target).toBe(3_310_000);
  });

  it('spring: March–May costs vs. money on hand at the end of February', () => {
    const s = springNeed(normal);
    expect(s.firstMonth).toBe('2027-03');
    expect(s.lastMonth).toBe('2027-05');
    expect(s.need).toBe(1_375_000 + 2_085_000 + 525_000);
    expect(s.available).toBe(4_765_220);
  });
});

describe('upcoming and costs', () => {
  it('lists what is coming in the next weeks (at least 4 entries)', () => {
    const list = upcoming(normal, '2026-11-07');
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(list[0]!.kind).toBe('apia_advance');
  });

  it('groups season costs by crop', () => {
    const c = costsByCrop(normal);
    expect(c.map((x) => x.cropId).sort()).toEqual(['grau', 'porumb']);
  });
});
