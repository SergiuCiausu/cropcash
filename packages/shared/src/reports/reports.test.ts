import { describe, expect, it } from 'vitest';
import { currentPeriod, inPeriod, periodOf, previousPeriod, recentPeriods } from './period';
import { ledgerOf, recordsInPeriod, subsidiesOf, type ExpectedSubsidy, type ReportRecord } from './ledger';

const rec = (over: Partial<ReportRecord> & Pick<ReportRecord, 'id' | 'date' | 'amountBani'>): ReportRecord => ({ kind: over.amountBani > 0 ? 'sale' : 'expense', ...over });

describe('periods', () => {
  it('spans months, quarters, years and harvest years, last day included', () => {
    expect(periodOf('month', '2028-02')).toMatchObject({ start: '2028-02-01', end: '2028-02-29' });
    expect(periodOf('quarter', '2026-Q3')).toMatchObject({ start: '2026-07-01', end: '2026-09-30' });
    expect(periodOf('year', '2026')).toMatchObject({ start: '2026-01-01', end: '2026-12-31' });
    expect(periodOf('harvest', '2027')).toMatchObject({ start: '2026-11-01', end: '2027-10-31' });
  });

  it('refuses keys that are not periods', () => {
    expect(() => periodOf('month', '2026-13')).toThrow();
    expect(() => periodOf('quarter', '2026-Q5')).toThrow();
    expect(() => periodOf('year', '26')).toThrow();
  });

  it('finds the period under way, November opening the next harvest', () => {
    expect(currentPeriod('quarter', '2026-11-15').key).toBe('2026-Q4');
    expect(currentPeriod('harvest', '2026-11-15').key).toBe('2027');
    expect(currentPeriod('harvest', '2026-10-31').key).toBe('2026');
    expect(currentPeriod('month', '2026-11-15').key).toBe('2026-11');
  });

  it('steps back across a year', () => {
    expect(previousPeriod(periodOf('month', '2026-01')).key).toBe('2025-12');
    expect(previousPeriod(periodOf('quarter', '2026-Q1')).key).toBe('2025-Q4');
    expect(recentPeriods('quarter', '2026-05-02', 3).map((p) => p.key)).toEqual(['2026-Q2', '2026-Q1', '2025-Q4']);
  });

  it('reads a timestamp by its day', () => {
    expect(inPeriod('2026-09-30T22:00:00Z', periodOf('quarter', '2026-Q3'))).toBe(true);
    expect(inPeriod('2026-10-01', periodOf('quarter', '2026-Q3'))).toBe(false);
  });
});

describe('records in a period', () => {
  const harvests = [
    { year: 2026, records: [rec({ id: 'a', date: '2026-03-10', amountBani: -5000 }), rec({ id: 'b', date: '2026-07-20', amountBani: 90000 })] },
    /* Seed bought in October 2026 belongs to the 2027 harvest. */
    { year: 2027, records: [rec({ id: 'c', date: '2026-10-05', amountBani: -12000, cropId: 'grau' }), rec({ id: 'b', date: '2026-07-20', amountBani: 90000 })] },
  ];

  it('takes a harvest as the app files it, and other periods by date', () => {
    expect(recordsInPeriod(periodOf('harvest', '2027'), harvests).map((r) => r.id)).toEqual(['b', 'c']);
    expect(recordsInPeriod(periodOf('year', '2026'), harvests).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(recordsInPeriod(periodOf('quarter', '2026-Q4'), harvests).map((r) => r.id)).toEqual(['c']);
  });

  it('counts a record kept in two harvests once', () => {
    expect(recordsInPeriod(periodOf('quarter', '2026-Q3'), harvests)).toHaveLength(1);
  });
});

describe('ledger', () => {
  const rows = [
    rec({ id: '3', date: '2026-04-02', amountBani: -30000, category: 'diesel' }),
    rec({ id: '1', date: '2026-03-01', amountBani: -10000, category: 'seeds', cropId: 'porumb' }),
    rec({ id: '2', date: '2026-03-20', amountBani: 250000, cropId: 'grau' }),
    rec({ id: '4', date: '2026-04-15', amountBani: 400000, kind: 'apia_balance' }),
    rec({ id: '5', date: '2026-04-16', amountBani: -5000, category: 'diesel' }),
  ];
  const l = ledgerOf(rows);

  it('adds up in and out, in whole bani', () => {
    expect(l.inBani).toBe(650000);
    expect(l.outBani).toBe(45000);
  });

  it('groups by month, oldest first, and each month adds up to the total', () => {
    expect(l.months.map((m) => [m.key, m.rows.map((r) => r.id)])).toEqual([
      ['2026-03', ['1', '2']],
      ['2026-04', ['3', '4', '5']],
    ]);
    expect(l.months.reduce((s, m) => s + m.inBani - m.outBani, 0)).toBe(l.inBani - l.outBani);
  });

  it('groups sales, then APIA, then expenses, biggest first', () => {
    expect(l.groups.map((g) => [g.key, g.inBani, g.outBani])).toEqual([
      [{ kind: 'sale', cropId: 'grau' }, 250000, 0],
      [{ kind: 'apia' }, 400000, 0],
      [{ kind: 'expense', category: 'diesel' }, 0, 35000],
      [{ kind: 'expense', category: 'seeds' }, 0, 10000],
    ]);
  });

  it('is empty with no records', () => {
    expect(ledgerOf([])).toEqual({ rows: [], months: [], groups: [], inBani: 0, outBani: 0 });
  });
});

describe('subsidies', () => {
  const expected: ExpectedSubsidy[] = [
    { kind: 'apia_advance', date: '2026-10-20', window: { start: '2026-10-16', end: '2026-11-30' }, amountBani: 100, estimated: false, unverified: false },
    { kind: 'apia_balance', date: '2027-04-15', window: null, amountBani: 300, estimated: true, unverified: true },
    /* The next campaign's advance falls after this harvest year ends. */
    { kind: 'apia_advance', date: '2027-11-20', window: null, amountBani: 900, estimated: true, unverified: false },
  ];
  const rows = [rec({ id: 'x', date: '2026-11-02', amountBani: 120, kind: 'apia_advance' }), rec({ id: 'y', date: '2026-11-03', amountBani: -50 })];

  it('lists what arrived, and only what is still to come inside the period', () => {
    const s = subsidiesOf(rows, expected, periodOf('harvest', '2027'), '2026-11-15');
    expect(s.received.map((r) => r.id)).toEqual(['x']);
    expect(s.receivedBani).toBe(120);
    expect(s.upcoming.map((e) => e.date)).toEqual(['2027-04-15']);
    expect(s.upcomingBani).toBe(300);
  });
});
