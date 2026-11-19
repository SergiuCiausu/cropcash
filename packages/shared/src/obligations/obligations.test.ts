import { describe, expect, it } from 'vitest';
import calendarJson from '../../../../docs/data/calendar-2026.json';
import fuelJson from '../../../../docs/data/fuel-excise.json';
import { CalendarFileSchema } from '../data/schemas';
import { FuelExciseSchema } from '../reports/fuel';
import type { ReportRecord } from '../reports/ledger';
import { dueSoon, fuelQuarterStatus, upcomingObligations } from './index';

const calendar = CalendarFileSchema.parse(calendarJson);
const fuel = FuelExciseSchema.parse(fuelJson);
const at = (today: string, hasFallow = false) => upcomingObligations({ calendar, fuel, today, hasFallow, horizonDays: 365 });

describe('upcomingObligations', () => {
  it('lists what is ahead for a crop farm, soonest first, without past quarters', () => {
    const { upcoming } = at('2026-11-19');
    expect(upcoming.map((i) => [i.id, i.end])).toEqual([
      ['acciza-acord-prealabil', '2026-12-21'],
      ['acciza-cerere-t4', '2027-02-01'],
      ['registrul-agricol-iarna', '2027-02-26'],
      ['registrul-agricol-mai', '2027-05-31'],
    ]);
    expect(upcoming[0]!.daysLeft).toBe(32);
    expect(upcoming.every((i) => !i.estimated)).toBe(true);
  });

  it('takes what to bring for a diesel claim from fuel-excise.json', () => {
    const t4 = at('2026-11-19').upcoming.find((i) => i.id === 'acciza-cerere-t4')!;
    expect(t4.documentsRo).toEqual(fuel.claim_documents_ro);
    expect(t4.howRo).toBe(fuel.how_ro);
    expect(t4.report).toBe('fuel-excise');
    expect(t4.period).toBe('2026-Q4');
    expect(t4.unverified).toBe(true);
    const acord = at('2026-11-19').upcoming[0]!;
    expect(acord.documentsRo).toEqual(fuel.acord.documents_ro);
  });

  it('shows the GeoFoto deadline only to a farm with fallow land, as an open window', () => {
    expect(at('2026-11-19').upcoming.some((i) => i.id === 'geofoto-toamna')).toBe(false);
    const geo = at('2026-11-19', true).upcoming[0]!;
    expect(geo).toMatchObject({ id: 'geofoto-toamna', daysLeft: 11, open: true, estimated: false });
  });

  it('projects yearly deadlines, but not the diesel claims of a scheme that ends', () => {
    const { upcoming } = at('2027-03-01', true);
    expect(upcoming.find((i) => i.id === 'registrul-agricol-iarna')).toMatchObject({ end: '2028-02-26', estimated: true });
    expect(upcoming.find((i) => i.id === 'geofoto-toamna')).toMatchObject({ end: '2027-11-30', estimated: true });
    expect(upcoming.some((i) => i.id.startsWith('acciza-'))).toBe(false);
  });

  it('keeps livestock deadlines apart, and the „within N days” rules without a date', () => {
    const { livestock, rules, upcoming } = at('2026-11-19');
    expect(livestock.map((i) => i.id)).toEqual(['dr06-decont-t4', 'pd07-08-decont']);
    expect(upcoming.some((i) => livestock.some((l) => l.id === i.id))).toBe(false);
    expect(rules.map((r) => [r.id, r.days])).toEqual([
      ['apia-forta-majora', 15],
      ['apia-transfer', 15],
      ['apia-schimbi-cultura', 10],
    ]);
  });

  it('picks the deadlines close enough for Acasă', () => {
    expect(dueSoon(at('2026-11-19', true).upcoming, 14).map((i) => i.id)).toEqual(['geofoto-toamna']);
    expect(dueSoon(at('2026-12-10').upcoming, 14).map((i) => i.id)).toEqual(['acciza-acord-prealabil']);
  });
});

describe('fuelQuarterStatus', () => {
  const diesel = (id: string, date: string, cl?: number): ReportRecord => ({
    id,
    date,
    kind: 'expense',
    category: 'diesel',
    amountBani: -70000,
    ...(cl ? { fuelLitersCl: cl } : {}),
  });
  const records = [diesel('q3', '2026-09-10', 50000), diesel('q4a', '2026-10-05', 10000), diesel('q4b', '2026-11-02'), diesel('dec', '2026-12-03', 10000)];

  it('adds up this quarter, names its claim, and lists what lacks litres or a rate', () => {
    const s = fuelQuarterStatus(records, fuel, '2026-11-19', 117000);
    expect(s.quarter.key).toBe('2026-Q4');
    expect(s.claim).toMatchObject({ deadline: '2027-02-01' });
    expect(s.litresCl).toBe(20000);
    // October at the crisis rate; December has no rate yet
    expect(s.refundBani).toBe(19960);
    expect(s.missing.map((r) => r.id)).toEqual(['q4b']);
    expect(s.noRate.map((r) => r.id)).toEqual(['dec']);
    expect(s.yearLitresCl).toBe(70000);
    expect(s.overCap).toBe(false);
    expect(s.schemeEnded).toBe(false);
    // nothing announced for 2027
    expect(s.nextAcord).toMatchObject({ for_year: 2027, date: null });
  });

  it('warns past the yearly cap, and knows when the scheme has ended', () => {
    expect(fuelQuarterStatus(records, fuel, '2026-11-19', 60000).overCap).toBe(true);
    const after = fuelQuarterStatus(records, fuel, '2027-01-10', null);
    expect(after.schemeEnded).toBe(true);
    expect(after.claim).toBeNull();
    expect(after.capCl).toBeNull();
  });
});
