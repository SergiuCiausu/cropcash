import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { buildFarmPlan } from '../functions/plan';
import { tasksForFarm } from '../functions/tasks';
import { getOpportunity, listClosingSoon, matchOpportunities, searchOpportunities, followOpportunity } from '../functions/registry';
import type { ReadContext } from '../functions/define';
import {
  closingSoonRows,
  filterOpportunities,
  matchOpportunityRows,
  opportunityChangeRows,
  plainText,
  sourceChangeRows,
  statusToday,
  type StoredOpportunity,
} from './index';

const data = loadData();
const today = '2026-11-07';
const call = (over: Partial<StoredOpportunity>): StoredOpportunity => ({
  stable_key: 'afir:x',
  kind: 'afir',
  programme: 'PS PAC 2023-2027',
  title: 'DR-14: Investiții în fermele de mici dimensiuni – Componenta ALTE SECTOARE',
  status: 'open',
  open_date: '2026-10-06',
  deadline: '2026-11-16',
  budget_eur: 1_500_000.5,
  applicants: null,
  region: 'Național',
  url: 'https://depunerepspac.afir.ro/Sesiune/Lista',
  relevance: 'direct',
  relevance_note: 'Depunere directă.',
  confidence: 'high',
  evidence: 'text din sursă',
  ...over,
});
const ion = {
  birth_year: 1971,
  county: 'TR',
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
};
const codes = (r: { code: string }[]) => r.map((x) => x.code);

describe('text', () => {
  it('finds what people type without diacritics', () => {
    expect(plainText('Fermă în Țăndărei')).toBe('ferma in tandarei');
    expect(filterOpportunities([call({})], { text: 'investitii ferme' }, today)).toHaveLength(1);
    expect(filterOpportunities([call({})], { text: 'investitii vaci' }, today)).toHaveLength(0);
  });
});

describe('status', () => {
  it('follows the dates, not the day it was stored', () => {
    expect(statusToday(call({ status: 'open' }), '2026-12-01')).toBe('closed');
    expect(statusToday(call({ status: 'announced' }), '2026-11-01')).toBe('open');
    expect(statusToday(call({ open_date: '2027-01-01', deadline: null }), today)).toBe('announced');
    expect(statusToday(call({ open_date: null, deadline: null, status: 'unknown' }), today)).toBe('unknown');
  });
});

describe('filters', () => {
  const rows = [
    call({ stable_key: 'a', deadline: '2026-12-02', budget_eur: 100 }),
    call({ stable_key: 'b', deadline: '2026-11-11', budget_eur: 900 }),
    call({ stable_key: 'c', deadline: null, open_date: null, status: 'unknown', budget_eur: null }),
    call({ stable_key: 'd', relevance: 'not_relevant' }),
    call({ stable_key: 'e', deadline: '2026-01-01' }),
  ];
  const keys = (r: { key: string }[]) => r.map((x) => x.key);

  it('hides closed and not relevant, soonest first, no deadline last', () => {
    expect(keys(filterOpportunities(rows, {}, today))).toEqual(['b', 'a', 'c']);
  });

  it('can ask for them', () => {
    expect(keys(filterOpportunities(rows, { includeNotRelevant: true }, today))).toContain('d');
    expect(keys(filterOpportunities(rows, { status: 'closed' }, today))).toEqual(['e']);
  });

  it('filters by deadline and money, in whole euro cents', () => {
    expect(keys(filterOpportunities(rows, { closesBy: '2026-11-30' }, today))).toEqual(['b']);
    expect(keys(filterOpportunities(rows, { minBudgetEur: 500 }, today))).toEqual(['b']);
    const [row] = filterOpportunities([call({ budget_eur: 84_794_823.5 })], {}, today);
    expect(row!.budgetEurCents).toBe(8_479_482_350);
  });

  it('counts the days left', () => {
    expect(closingSoonRows(rows, 7, today).map((r) => [r.key, r.daysLeft])).toEqual([['b', 4]]);
  });
});

describe('matching a call to Ion: 55, grain, no animals, Teleorman', () => {
  const match = (over: Partial<StoredOpportunity>, farm = ion) => matchOpportunityRows([call(over)], farm, data, today);
  /** The one row, whichever list it landed in. */
  const only = (over: Partial<StoredOpportunity>, farm = ion) => {
    const { forYou, check, notForYou } = match(over, farm);
    return [...forYou, ...check, ...notForYou][0]!;
  };
  /** A call with no guide behind it, so only the rule under test speaks. */
  const plain = 'Investiții în fermele de mici dimensiuni – Componenta ALTE SECTOARE';

  it('shows what fits, with the reasons', () => {
    const { forYou, check } = match({ title: plain, deadline: '2027-02-01' });
    expect(check).toHaveLength(0);
    expect(forYou[0]).toMatchObject({ level: 'near' });
    expect(codes(forYou[0]!.good)).toEqual(['for_farmers', 'small_farms']);
  });

  it('takes the applicant rule from the guide: DR-14 needs a PFA or a company', () => {
    const row = only({});
    expect(codes(row.doubts)).toEqual(['needs_company']);
    expect(row.level).toBe('near');
    expect(match({}).check).toHaveLength(1);
  });

  it('rules out an age limit he is over, taken from the title', () => {
    const row = only({ title: 'DR-12: fermieri cu vârsta de maximum 45 de ani – ALTE SECTOARE' });
    expect(row.doubts).toContainEqual({ code: 'age_limit', vars: { limit: 45 } });
    expect(row.level).toBe('no');
    const young = { ...ion, birth_year: 1990 };
    expect(only({ title: 'Investiții pentru fermieri cu vârsta de maximum 45 de ani' }, young).level).toBe('near');
  });

  it('rules out a sector he is not in', () => {
    for (const title of ['DR-14: Componenta SECTOR ZOOTEHNIC', 'DR-14: Componenta LEGUMICULTURĂ', 'DR-18: Investiții în floricultură']) {
      expect(codes(only({ title }).doubts), title).toContain('other_sector');
      expect(match({ title }).notForYou, title).toHaveLength(1);
    }
  });

  it('counts animals for a livestock call', () => {
    expect(only({ title: 'Componenta SECTOR ZOOTEHNIC' }, { ...ion, dairy_cows: 5 } as typeof ion).level).toBe('near');
  });

  it('rules out another region, and keeps his own', () => {
    const conditional = { title: 'Sprijin pentru agricultură', relevance: 'conditional' };
    expect(codes(only({ ...conditional, programme: 'Program Regional Nord-Est' }).doubts)).toContain('other_region');
    expect(codes(only({ ...conditional, programme: 'Program Regional Sud Muntenia' }).doubts)).not.toContain('other_region');
    expect(codes(only({ ...conditional, region: 'Regiuni mai dezvoltate' }).doubts)).toContain('other_region');
    expect(codes(only({ ...conditional, region: 'Regiuni mai putin dezvoltate' }).doubts)).not.toContain('other_region');
  });

  it('rules out a call whose title names another region', () => {
    const title = 'Agricultură în Regiunea București-Ilfov';
    expect(codes(only({ title, relevance: 'conditional' }).doubts)).toContain('other_region');
    expect(codes(only({ title, relevance: 'conditional' }, { ...ion, county: 'IF' }).doubts)).not.toContain('other_region');
  });

  it('every county has a region that a programme name reaches', () => {
    const programmes = ['Sud Muntenia', 'Sud-Est', 'Sud-Vest Oltenia', 'Nord-Est', 'Nord-Vest', 'Centru', 'Vest', 'București-Ilfov'];
    for (const county of data.counties.counties) {
      const found = programmes.filter(
        (p) => !codes(only({ programme: `Program Regional ${p}`, relevance: 'conditional' }, { ...ion, county: county.code }).doubts).includes('other_region'),
      );
      expect(found, county.code).toHaveLength(1);
    }
  });

  it('sorts calls that are not plainly for farmers by who can apply', () => {
    const conditional = { title: 'Program pentru mediul rural', relevance: 'conditional' };
    expect(only({ ...conditional, applicants: 'Întreprinderi mici și mijlocii' })).toMatchObject({ level: 'firm', doubts: [{ code: 'firms_only' }] });
    expect(only({ ...conditional, title: 'Digitalizare în agricultură' })).toMatchObject({ level: 'check', doubts: [{ code: 'check_who' }] });
    expect(only({ ...conditional, applicants: 'Autorități publice locale' }).level).toBe('no');
    expect(codes(only({ ...conditional, title: 'Trenul metropolitan' }).doubts)).toContain('institutions_only');
    expect(only(conditional)).toMatchObject({ level: 'no', doubts: [{ code: 'not_for_farms' }] });
    expect(only({ title: plain, relevance: 'partnership' })).toMatchObject({ level: 'no', doubts: [{ code: 'partnership' }] });
  });

  it('leaves out not relevant calls and closed ones', () => {
    const none = (m: ReturnType<typeof match>) => m.forYou.length + m.check.length + m.notForYou.length;
    expect(none(match({ relevance: 'not_relevant' }))).toBe(0);
    expect(none(match({ deadline: '2026-01-01' }))).toBe(0);
  });

  it('marks a call that closes soon, and a low-confidence reading', () => {
    expect(match({ title: plain, deadline: '2026-11-10' }).forYou[0]!.good).toContainEqual({ code: 'closes_soon', vars: { days: 3 } });
    expect(only({ title: plain, confidence: 'low' })).toMatchObject({ level: 'check', doubts: [{ code: 'low_confidence' }] });
  });
});

describe('changes', () => {
  it('keeps calls for farmers and recent ones', () => {
    const rows = [call({ stable_key: 'a' }), call({ stable_key: 'b', relevance: 'not_relevant' })];
    const event = { field: 'deadline', old_value: '2026-11-16', new_value: '2026-12-01' };
    const list = opportunityChangeRows(
      [
        { ...event, stable_key: 'a', created_at: '2026-11-01T10:00:00Z' },
        { ...event, stable_key: 'b', created_at: '2026-11-01T10:00:00Z' },
        { ...event, stable_key: 'a', created_at: '2026-01-01T10:00:00Z' },
      ],
      rows,
      30,
      today,
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ field: 'deadline', to: '2026-12-01', date: '2026-11-01' });
  });

  it('filters official changes by institution, newest first', () => {
    const change = { title: 'Pagina', url: 'https://apia.org.ro/x', kind: 'changed', short_diff: null };
    const rows = [
      { ...change, id: 1, institution: 'APIA', changed_at: '2026-11-01T10:00:00Z' },
      { ...change, id: 2, institution: 'APIA', changed_at: '2026-11-05T10:00:00Z' },
      { ...change, id: 3, institution: 'AFIR', changed_at: '2026-11-05T10:00:00Z' },
    ];
    expect(sourceChangeRows(rows, { institution: 'apia', days: 30 }, today).map((r) => r.id)).toEqual([2, 1]);
  });
});

describe('the calendar', () => {
  const followed = {
    ...ion,
    opportunity_follows: [
      { stable_key: 'afir:x', opportunities: { id: 434, title: 'DR-14 alte sectoare', deadline: '2026-11-16', url: 'https://afir.ro/x' } },
    ],
  };
  const plan = buildFarmPlan(followed, data, { month: '2026-11' });

  it('shows a followed deadline as a task, and costs nothing', () => {
    const task = tasksForFarm(plan, followed, data, 'open').find((x) => x.id === 'opportunity-434:2026');
    expect(task).toMatchObject({ titleRo: 'DR-14 alte sectoare', date: '2026-11-16', sourceUrl: 'https://afir.ro/x' });
    expect(plan.salary.salary).toBe(buildFarmPlan(ion, data, { month: '2026-11' }).salary.salary);
  });

  it('can be ticked off like any task', () => {
    const done = { ...followed, task_completions: [{ task_id: 'opportunity-434:2026' }] };
    expect(tasksForFarm(plan, done, data, 'open').some((x) => x.id === 'opportunity-434:2026')).toBe(false);
  });

  it('skips a call with no date', () => {
    const noDate = { ...ion, opportunity_follows: [{ stable_key: 'k', opportunities: { id: 1, title: 'x', deadline: null, url: 'u' } }] };
    expect(tasksForFarm(buildFarmPlan(noDate, data, { month: '2026-11' }), noDate, data, 'open').some((x) => x.id.startsWith('opportunity'))).toBe(false);
  });
});

describe('through the registry', () => {
  const plan = buildFarmPlan(ion, data, { month: '2026-11' });
  const ctx: ReadContext = { farm: ion, plan, data, today, monitor: { opportunities: [call({})] } };

  it('runs on the API, with source links', () => {
    expect(searchOpportunities.runs).toBe('api');
    expect(searchOpportunities.needs).toEqual(['opportunities']);
    const result = matchOpportunities.execute({}, ctx);
    expect(result.data!.check[0]).toMatchObject({ level: 'near', doubts: [{ code: 'needs_company' }] });
    expect(result.sources[0]!.url).toBe('https://depunerepspac.afir.ro/Sesiune/Lista');
  });

  it('gives one call in full, or nothing', () => {
    expect(getOpportunity.execute({ key: 'afir:x' }, ctx).data).toMatchObject({ evidence: 'text din sursă', following: false });
    expect(getOpportunity.execute({ key: 'nope' }, ctx).data).toBeNull();
  });

  it('uses the configured days', () => {
    expect(listClosingSoon.execute({}, ctx).data).toHaveLength(1);
    expect(listClosingSoon.execute({ days: 1 }, ctx).data).toHaveLength(0);
  });

  it('asks the farmer before following', () => {
    expect(followOpportunity.access).toBe('confirm');
    expect(followOpportunity.request({ key: 'afir:x' }).path).toBe('/api/opportunities/follow');
    expect(() => followOpportunity.request({ key: '' })).toThrow();
  });
});
