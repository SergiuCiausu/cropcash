import { describe, expect, it } from 'vitest';
import papersJson from '../../../../docs/data/apia-papers.json';
import calendarJson from '../../../../docs/data/calendar-2026.json';
import { CalendarFileSchema } from '../data/schemas';
import { apiaFacts, apiaFilings, ApiaPapersFileSchema, type ApiaFacts } from './apia';

const calendar = CalendarFileSchema.parse(calendarJson);
const papers = ApiaPapersFileSchema.parse(papersJson);

/** A crop farm on arable land that notes its diesel. */
const cropFarm: ApiaFacts = { arable: true, grassland: false, fallow: false, fuel: true, animals: false, coupled_crops: false, organic: false };
const byId = (facts: ApiaFacts, today = '2026-11-20') => new Map(apiaFilings(papers, calendar, facts, today).map((f) => [f.paper.id, f]));

describe('apia-papers.json', () => {
  it('names only calendar events that exist', () => {
    const ids = new Set(calendar.events.map((e) => e.id));
    for (const p of papers.papers) for (const e of p.deadline_events ?? []) expect(ids.has(e), `${p.id} → ${e}`).toBe(true);
  });

  it('gives every paper a deadline, a rule, or a place on the farm', () => {
    for (const p of papers.papers) {
      const dated = !!p.deadline || !!p.deadline_events?.length;
      expect(dated || p.group === 'control', p.id).toBe(true);
    }
  });

  it('refuses a paper with both kinds of deadline', () => {
    const bad = { ...papersJson, papers: [{ ...papersJson.papers[0], deadline: { start: null, end: '2026-01-01', status: 'confirmat-2026', source_url: null } }] };
    expect(ApiaPapersFileSchema.safeParse(bad).success).toBe(false);
  });
});

describe('apiaFacts', () => {
  it('reads the land from the map first', () => {
    const f = apiaFacts({ landUses: ['TA', 'PP'], cropSections: [], hasFallow: false, dieselExpenses: 0 });
    expect(f).toMatchObject({ arable: true, grassland: true, fuel: null, animals: null });
  });

  it('falls back to the crops’ APIA sections when nothing is on the map', () => {
    const f = apiaFacts({ landUses: [null], cropSections: ['I. TEREN ARABIL – TA'], hasFallow: true, dieselExpenses: 2 });
    expect(f).toMatchObject({ arable: true, grassland: false, fallow: true, fuel: true });
  });

  it('knows nothing about the land of a farm with no crops', () => {
    expect(apiaFacts({ landUses: [], cropSections: [], hasFallow: false, dieselExpenses: 0 })).toMatchObject({ arable: null, grassland: null });
  });
});

describe('apiaFilings', () => {
  it('puts what is due next first, with the diesel quarter that is still open', () => {
    const list = apiaFilings(papers, calendar, cropFarm, '2026-11-20').filter((f) => f.section === 'next');
    expect(list.map((f) => [f.paper.id, f.deadline!.end])).toEqual([
      ['motorina-acord', '2026-12-21'],
      ['motorina-trimestru', '2027-02-01'],
      ['registrul-agricol', '2027-02-26'],
      ['cerere-hartii', '2027-06-05'],
      ['cerere-suprafata', '2027-06-05'],
      ['fermier-activ', '2027-08-31'],
      ['cerere-modificari', '2027-09-30'],
    ]);
    const q4 = list.find((f) => f.paper.id === 'motorina-trimestru')!.deadline!;
    expect(q4).toMatchObject({ period: '2026-Q4', estimated: false, daysLeft: 73 });
    expect(list.find((f) => f.paper.id === 'cerere-suprafata')!.deadline).toMatchObject({ start: '2027-03-16', estimated: true, open: false });
  });

  it('keeps the registers on the farm and lists the „within N days” rules apart', () => {
    const f = byId(cropFarm);
    expect(f.get('registru-tratamente')!.section).toBe('keep');
    expect(f.get('registru-tratamente')!.deadline).toBeNull();
    const when = f.get('forta-majora')!;
    expect(when.section).toBe('when');
    expect(when.rules.map((r) => r.eventId)).toEqual(['apia-forta-majora', 'apia-schimbi-cultura', 'apia-transfer', 'apia-modificari']);
  });

  it('leaves out what the farm’s data rules out, and asks about what it doesn’t know', () => {
    const f = byId({ ...cropFarm, animals: null, coupled_crops: null });
    expect(f.get('pajisti-fan')!.section).toBe('not_applicable');
    expect(f.get('geofoto')!.section).toBe('not_applicable');
    expect(f.get('cerere-zootehnie')).toMatchObject({ section: 'maybe', unknown: ['animals'] });
    expect(f.get('cuplat-dovezi')).toMatchObject({ section: 'maybe', unknown: ['coupled_crops'] });
  });

  it('shows the diesel papers as „maybe” when no diesel is noted', () => {
    const f = byId({ ...cropFarm, fuel: null });
    expect(f.get('motorina-trimestru')!.section).toBe('maybe');
    expect(f.get('motorina-acord')!.section).toBe('maybe');
  });

  it('moves the diesel claims to the past once the scheme’s last claim is behind', () => {
    const f = byId(cropFarm, '2027-03-01');
    expect(f.get('motorina-trimestru')).toMatchObject({ section: 'past', deadline: { period: '2026-Q4', end: '2027-02-01' } });
    expect(f.get('motorina-acord')!.section).toBe('past');
  });

  it('opens the fallow photos for a farm with fallow land, in the autumn window', () => {
    const f = byId({ ...cropFarm, fallow: true });
    expect(f.get('geofoto')).toMatchObject({ section: 'next', deadline: { eventId: 'geofoto-toamna', end: '2026-11-30', open: true, daysLeft: 10 } });
  });
});

describe('the farmer’s answers', () => {
  const base = { landUses: ['TA'], cropSections: [], hasFallow: false, dieselExpenses: 0 };
  it('fill in what the farm’s data can’t say', () => {
    expect(apiaFacts({ ...base, answers: { animals: false, organic: true, coupledCrops: ['soia'], fuel: false } })).toMatchObject({ animals: false, organic: true, coupled_crops: true, fuel: false });
    expect(apiaFacts({ ...base, answers: { coupledCrops: [] } }).coupled_crops).toBe(false);
  });

  it('never override diesel the farmer noted', () => {
    expect(apiaFacts({ ...base, dieselExpenses: 3, answers: { fuel: false } }).fuel).toBe(true);
  });
});

describe('apia-coupled.json', () => {
  it('names only crop codes from the APIA list, each in one scheme', async () => {
    const { ApiaCoupledFileSchema, coupledSchemeOf } = await import('./apia');
    const coupled = ApiaCoupledFileSchema.parse((await import('../../../../docs/data/apia-coupled.json')).default);
    const codes = new Set(((await import('../../../../docs/data/apia-crop-codes.json')).default.rows as { code: number }[]).map((r) => r.code));
    const all = coupled.schemes.flatMap((s) => s.codes);
    for (const c of all) expect(codes.has(c), String(c)).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    expect(coupledSchemeOf(coupled, 203)!.id).toBe('PD-09');
    expect(coupledSchemeOf(coupled, 101)).toBeNull();
  });
});
