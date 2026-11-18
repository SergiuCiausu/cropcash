import { describe, expect, it } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { opportunityRow, type StoredOpportunity } from '../../../packages/shared/src/opportunities/index';
import { callsFromServer, eventsFromServer, pageFits, problemsOf, sourcesFromServer } from './monitor';

const data = loadData();
const today = '2026-11-07';
const stored = (over: Partial<StoredOpportunity>): StoredOpportunity => ({
  stable_key: 'afir:DR-14:alte',
  kind: 'afir',
  programme: 'PS PAC 2023-2027',
  title: 'DR-14: Investiții în fermele de mici dimensiuni – Componenta ALTE SECTOARE',
  status: 'open',
  open_date: '2026-09-01',
  deadline: '2026-11-16',
  budget_eur: 30_000_000,
  applicants: null,
  region: 'Național',
  url: 'https://depunerepspac.afir.ro/Sesiune/Lista',
  relevance: 'direct',
  relevance_note: 'Depunere directă.',
  confidence: 'high',
  evidence: null,
  ...over,
});
const ion = { age: 55, county: 'Teleorman', parcels: [{ cropId: 'grau' }, { cropId: 'porumb' }] };

describe('calls from the server', () => {
  it('keep the shape the pages read, in euro', () => {
    const [call] = callsFromServer([opportunityRow(stored({ budget_eur: 1_500_000.5 }), today)]);
    expect(call).toEqual({
      key: 'afir:DR-14:alte',
      kind: 'afir',
      programme: 'PS PAC 2023-2027',
      title: 'DR-14: Investiții în fermele de mici dimensiuni – Componenta ALTE SECTOARE',
      status: 'open',
      openDate: '2026-09-01',
      deadline: '2026-11-16',
      budgetEur: 1_500_000.5,
      applicants: null,
      region: 'Național',
      url: 'https://depunerepspac.afir.ro/Sesiune/Lista',
      relevance: 'direct',
      note: 'Depunere directă.',
      confidence: 'high',
    });
  });
});

describe('how a call fits the farm on the page', () => {
  const fits = (over: Partial<StoredOpportunity>, farm = ion) =>
    pageFits(callsFromServer([opportunityRow(stored(over), today)]), farm, data, today)['afir:DR-14:alte'];

  it('uses the API rules: DR-14 is close but needs a PFA', () => {
    expect(fits({})).toMatchObject({ level: 'near', doubts: [{ code: 'needs_company' }] });
  });

  it('works for any farm, by county name or code', () => {
    const vegetables = fits({ title: 'DR-14: Componenta LEGUMICULTURĂ' }, { ...ion, parcels: [{ cropId: 'tomate' }] });
    expect(vegetables?.level).toBe('near');
    expect(fits({ title: 'DR-14: Componenta LEGUMICULTURĂ' })?.level).toBe('no');
    const regional = { title: 'Agricultură', relevance: 'conditional', programme: 'Program Regional Nord-Est' };
    expect(fits(regional, { ...ion, county: 'IS' })?.level).toBe('check');
    expect(fits(regional, { ...ion, county: 'Iași' })?.level).toBe('check');
    expect(fits(regional)?.level).toBe('no');
  });

  it('leaves out closed calls', () => {
    expect(fits({ deadline: '2026-11-01' })).toBeUndefined();
  });
});

describe('changes and sources', () => {
  it('rename the event fields the page reads', () => {
    const [e] = eventsFromServer([{ key: 'k', title: 'T', kind: 'afir', field: 'new', from: null, to: 'T', date: '2026-11-07', url: 'https://x.ro' }]);
    expect(e).toEqual({ key: 'k', field: 'new', title: 'T', kind: 'afir', url: 'https://x.ro', oldValue: null, newValue: 'T', date: '2026-11-07' });
  });

  it('list the sources that can not be read as problems', () => {
    const sources = sourcesFromServer([
      { id: 1, institution: 'AFIR', title: 'A', url: 'https://a.ro', type: 'index', state: 'active', last_checked: '2026-11-07T05:00:00Z' },
      { id: 2, institution: 'APIA', title: 'B', url: 'https://b.ro', type: 'pdf', state: 'blocked', last_checked: '2026-11-06T05:00:00Z' },
      { id: 3, institution: 'APIA', title: 'C', url: 'https://c.ro', type: 'pagina', state: 'new', last_checked: null },
    ]);
    expect(sources[1]).toEqual({ id: 2, inst: 'APIA', title: 'B', url: 'https://b.ro', type: 'pdf', state: 'blocked', checked: '2026-11-06' });
    expect(problemsOf(sources)).toEqual([{ sourceId: 2, kind: 'blocked', date: '2026-11-06' }]);
  });
});
