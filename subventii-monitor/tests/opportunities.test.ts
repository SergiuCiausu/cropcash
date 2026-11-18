import { describe, expect, it } from 'vitest';
import { checkSource } from '../src/detect.ts';
import { renderReport } from '../src/report/daily.ts';
import { renderDigest } from '../src/report/digest.ts';
import { fetchEcCalls, topicBudget, toDraft } from '../src/opportunities/ec-api.ts';
import { afirDate, parseAfirSessions } from '../src/opportunities/parsers/afir.ts';
import { parseMipeCalendar } from '../src/opportunities/parsers/mipe.ts';
import { classify } from '../src/opportunities/relevance.ts';
import { refreshStatuses, syncOpportunities } from '../src/opportunities/sync.ts';
import { statusFor, type Draft, type Opportunity } from '../src/opportunities/types.ts';
import { runChecks } from '../src/run.ts';
import type { Fetcher } from '../src/fetcher.ts';
import { MemoryStore } from './memory-store.ts';

const TODAY = '2026-11-07';

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    stableKey: 'afir:DR-14:2026-09-01:general',
    kind: 'afir',
    programme: 'PS PAC 2023-2027',
    title: 'DR-14: Investiții în fermele de mici dimensiuni',
    sourceState: null,
    openDate: '2026-09-01',
    deadline: '2026-12-16',
    budgetEur: 30_000_000,
    applicants: null,
    region: 'Național',
    url: 'https://depunerepspac.afir.ro/Sesiune/Lista',
    confidence: 'high',
    evidence: 'dovada',
    ...overrides,
  };
}

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return { ...draft(), status: 'open', relevance: 'direct', relevanceNote: null, ...overrides };
}

const afirPage = (deposited: string) => `<main><div>
  <div class="row mb-3"><strong>Sesiune depunere dosare de finanțare DR-14</strong></div>
  <div class="row gy-4 gx-xxl-5">
    <div><div class="cod-descriere-alocare">DR-14</div>
      <div><b>Investiții în fermele de mici dimensiuni </b><span class="fw-normal">- Componenta LEGUMICULTURĂ</span></div></div>
    <div><div class="titlu-container">DATĂ ȘI ORĂ LANSARE</div><div class="container-continut-element-proiect">01/09/2026 09:00:00</div></div>
    <div><div class="titlu-container">ALOCARE FINANCIARĂ</div><div class="container-continut-element-proiect"><span class="EUR">30000000.50000</span></div></div>
    <div><div class="titlu-container">DATĂ ȘI ORĂ ÎNCHIDERE</div><div class="container-continut-element-proiect">16/12/2026 15:59:59</div></div>
    <div><div class="titlu-container">VALOAREA PROIECTELOR DEPUSE</div><div class="container-continut-element-proiect">${deposited}</div></div>
  </div>
</div></main>`;

describe('AFIR parser', () => {
  const url = 'https://depunerepspac.afir.ro/Sesiune/Lista';

  it('reads the dates, budget and component', () => {
    const [d] = parseAfirSessions(afirPage('100'), url);
    expect(d).toMatchObject({
      title: 'DR-14: Investiții în fermele de mici dimensiuni – Componenta LEGUMICULTURĂ',
      openDate: '2026-09-01',
      deadline: '2026-12-16',
      budgetEur: 30000000.5,
      confidence: 'high',
    });
  });

  it('ignores the live counter, so it can\'t register as a change', () => {
    expect(parseAfirSessions(afirPage('100'), url)).toEqual(
      parseAfirSessions(afirPage('999'), url).map((d) => ({ ...d, evidence: expect.any(String) })),
    );
  });

  it('finds nothing on an unknown layout', () => {
    expect(parseAfirSessions('<main><p>Altceva</p></main>', url)).toEqual([]);
  });

  it('reads Romanian dates', () => {
    expect(afirDate('06/10/2026 09:00:00')).toBe('2026-10-06');
    expect(afirDate('nepublicat')).toBeNull();
  });
});

describe('MIPE parser', () => {
  const url = 'https://mfe.gov.ro/calendar-apeluri-de-finantare/';
  const call = {
    mca_call_key: 'nr:1',
    program: 'Program Regional Nord-Vest',
    denumire_apel: 'Apel cu ] și " în titlu',
    stare_apel: 'VALIDAT',
    zona_geografica: 'Acoperire nationala ,Acoperire nationala',
    buget_total_euro: 1000,
    beneficiari_eligibili: 'microîntreprindere',
    tip_apel: 'Competitiv',
    start_date: '2026-01-01',
    end_date: '2026-12-01',
  };
  const page = (list: unknown[]) => `<script>var RAW = ${JSON.stringify(list)};\nvar x = [1];</script>`;

  it('reads the list, even with brackets and quotes inside strings', () => {
    const [d] = parseMipeCalendar(page([call]), url);
    expect(d).toMatchObject({
      stableKey: 'mipe:nr:1', title: 'Apel cu ] și " în titlu', region: 'Acoperire nationala', confidence: 'high',
    });
  });

  it('marks calls MIPE is still editing, or without applicants, as uncertain', () => {
    expect(parseMipeCalendar(page([{ ...call, stare_apel: 'IN_EDITARE' }]), url)[0]!.confidence).toBe('low');
    expect(parseMipeCalendar(page([{ ...call, beneficiari_eligibili: '' }]), url)[0]!.confidence).toBe('low');
  });

  it('returns nothing for a missing or broken list', () => {
    expect(parseMipeCalendar('<p>fără date</p>', url)).toEqual([]);
    expect(parseMipeCalendar('<script>var RAW = [{oops}];</script>', url)).toEqual([]);
  });
});

describe('EC API', () => {
  const metadata = {
    identifier: ['HORIZON-CL6-2027-X'],
    title: ['Support for farmers'],
    status: ['31094501'],
    startDate: ['2027-02-04T00:00:00.000+0000'],
    deadlineDate: ['2026-01-01T00:00:00.000+0000', '2027-05-11T00:00:00.000+0000'],
  };

  it('uses the next deadline, and drops calls with none left', () => {
    expect(toDraft(metadata, TODAY)).toMatchObject({ deadline: '2027-05-11', sourceState: 'forthcoming' });
    expect(toDraft({ ...metadata, deadlineDate: ['2026-01-01'] }, TODAY)).toBeNull();
  });

  it('takes only this topic\'s budget from the whole call', () => {
    const overview = JSON.stringify({
      budgetTopicActionMap: {
        1: [{ action: 'HORIZON-CL6-2027-X - RIA', budgetYearMap: { 2027: '4500000' } }],
        2: [{ action: 'HORIZON-CL6-2027-Y - RIA', budgetYearMap: { 2027: '9000000' } }],
      },
    });
    expect(topicBudget(overview, 'HORIZON-CL6-2027-X')).toBe(4_500_000);
    expect(topicBudget('nu e json', 'X')).toBeNull();
    expect(topicBudget(undefined, 'X')).toBeNull();
  });

  it('pages through results and removes duplicates between searches', async () => {
    const pages: string[] = [];
    const fake = (async (url: string) => {
      pages.push(url);
      return new Response(JSON.stringify({ results: [{ metadata }] }));
    }) as unknown as typeof fetch;
    const calls = await fetchEcCalls('agent', TODAY, fake, 0);
    expect(calls).toHaveLength(1);
    expect(pages.length).toBe(4);
  });

  it('throws on failure, so an outage can\'t look like an empty list', async () => {
    const down = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    await expect(fetchEcCalls('agent', TODAY, down, 0)).rejects.toThrow('503');
    const odd = (async () => new Response('{}')) as unknown as typeof fetch;
    await expect(fetchEcCalls('agent', TODAY, odd, 0)).rejects.toThrow('no results list');
  });
});

describe('relevance', () => {
  const mipe = (applicants: string | null, title = 'Apel general') => draft({ kind: 'mipe', applicants, title });

  it('labels every AFIR call as direct', () => {
    expect(classify(draft()).relevance).toBe('direct');
  });

  it('separates farmers, firms and everyone else', () => {
    expect(classify(mipe('fermieri și grupuri de producători')).relevance).toBe('direct');
    expect(classify(mipe('microîntreprindere, întreprindere mică')).relevance).toBe('conditional');
    expect(classify(mipe('Autorități publice locale')).relevance).toBe('not_relevant');
  });

  it('isn\'t fooled by the word "rural" among applicants', () => {
    expect(classify(mipe('Instituții publice locale din zona rurală')).relevance).toBe('not_relevant');
  });

  it('keeps unpublished applicants only when the topic is agricultural', () => {
    expect(classify(mipe(null, 'STEP-AGRI: digitalizarea agriculturii')).relevance).toBe('conditional');
    expect(classify(mipe(null, 'Digitalizare în sănătate')).relevance).toBe('not_relevant');
  });

  it('labels EU calls as partnership when the title is about farming', () => {
    expect(classify(draft({ kind: 'ec', title: 'Support for farmers' })).relevance).toBe('partnership');
    expect(classify(draft({ kind: 'ec', title: 'Quantum sensors' })).relevance).toBe('not_relevant');
  });
});

describe('statusFor', () => {
  it('follows the dates', () => {
    expect(statusFor('2027-01-01', '2027-02-01', TODAY)).toBe('announced');
    expect(statusFor('2026-01-01', '2027-02-01', TODAY)).toBe('open');
    expect(statusFor('2026-01-01', TODAY, TODAY)).toBe('open');
    expect(statusFor('2026-01-01', '2026-11-06', TODAY)).toBe('closed');
    expect(statusFor(null, null, TODAY)).toBe('unknown');
  });
});

describe('syncOpportunities', () => {
  it('stores the first list silently, and skips calls already closed', async () => {
    const store = new MemoryStore();
    const old = draft({ stableKey: 'afir:old', deadline: '2026-01-01' });
    await syncOpportunities(store, 'afir', [draft(), old], 1, TODAY);
    expect(store.opportunityEvents).toEqual([]);
    expect([...store.saved.keys()]).toEqual([draft().stableKey]);
  });

  it('reports new calls and changed deadlines, not unchanged ones', async () => {
    const store = new MemoryStore();
    await syncOpportunities(store, 'afir', [draft()], 1, TODAY);
    await syncOpportunities(store, 'afir', [draft({ deadline: '2026-12-30' }), draft({ stableKey: 'afir:b' })], 2, TODAY);
    expect(store.opportunityEvents.map((e) => [e.stableKey, e.field, e.oldValue, e.newValue])).toEqual([
      [draft().stableKey, 'deadline', '2026-12-16', '2026-12-30'],
      ['afir:b', 'new', null, draft().title],
    ]);
  });

  it('treats a budget stored as text the same as the same number', async () => {
    const store = new MemoryStore();
    await syncOpportunities(store, 'afir', [draft()], 1, TODAY);
    await syncOpportunities(store, 'afir', [draft()], 2, TODAY);
    expect(store.opportunityEvents).toEqual([]);
  });

  it('closes a call that left the list', async () => {
    const store = new MemoryStore();
    await syncOpportunities(store, 'afir', [draft(), draft({ stableKey: 'afir:b' })], 1, TODAY);
    await syncOpportunities(store, 'afir', [draft()], 2, TODAY);
    expect(store.saved.get('afir:b')?.status).toBe('closed');
    expect(store.opportunityEvents.map((e) => e.field)).toEqual(['removed']);
  });

  it('leaves other kinds alone', async () => {
    const store = new MemoryStore();
    await syncOpportunities(store, 'afir', [draft()], 1, TODAY);
    await syncOpportunities(store, 'ec', [draft({ stableKey: 'ec:a', kind: 'ec' })], 1, TODAY);
    expect(store.saved.get(draft().stableKey)?.status).toBe('open');
  });
});

describe('refreshStatuses', () => {
  it('moves calls forward as dates pass, with no source changing', async () => {
    const store = new MemoryStore();
    await syncOpportunities(store, 'afir', [draft({ openDate: '2026-11-10' })], 1, TODAY);
    expect(store.saved.get(draft().stableKey)?.status).toBe('announced');
    await refreshStatuses(store, 2, '2026-11-11');
    expect(store.saved.get(draft().stableKey)?.status).toBe('open');
    await refreshStatuses(store, 3, '2026-12-17');
    expect(store.saved.get(draft().stableKey)?.status).toBe('closed');
  });
});

describe('renderDigest', () => {
  it('shows closing deadlines on a day with no events', () => {
    const out = renderDigest({
      today: TODAY,
      events: [],
      opportunities: [
        opportunity({ deadline: '2026-11-10' }),
        opportunity({ stableKey: 'b', title: 'Luna', deadline: '2026-12-01' }),
        opportunity({ stableKey: 'c', title: 'Departe', deadline: '2027-06-01' }),
      ],
    }).join('\n');
    expect(out).toContain('### Se închid în 7 zile (1)');
    expect(out).toContain('termen 10.11.2026');
    expect(out).toContain('buget 30.000.000 EUR');
    expect(out).toContain('### Se închid în 30 de zile (1)');
    expect(out).not.toContain('Departe');
  });

  it('counts the boundaries of each window once', () => {
    const out = renderDigest({
      today: TODAY,
      events: [],
      opportunities: [opportunity({ deadline: '2026-11-14' }), opportunity({ stableKey: 'b', deadline: '2026-12-07' })],
    }).join('\n');
    expect(out).toContain('### Se închid în 7 zile (1)');
    expect(out).toContain('### Se închid în 30 de zile (1)');
  });

  it('leaves out irrelevant, closed and past calls', () => {
    expect(renderDigest({
      today: TODAY,
      events: [],
      opportunities: [
        opportunity({ deadline: '2026-11-10', relevance: 'not_relevant' }),
        opportunity({ deadline: '2026-11-10', status: 'closed' }),
      ],
    })).toEqual([]);
  });

  it('shows new calls, changed deadlines and uncertain data', () => {
    const o = opportunity({ confidence: 'low', deadline: '2027-06-01' });
    const out = renderDigest({
      today: TODAY,
      opportunities: [o],
      events: [
        { stableKey: o.stableKey, field: 'new', oldValue: null, newValue: o.title },
        { stableKey: o.stableKey, field: 'deadline', oldValue: '2026-12-16', newValue: '2027-06-01' },
      ],
    }).join('\n');
    expect(out).toContain('### Oportunități noi (1)');
    expect(out).toContain('**(verifică)**');
    expect(out).toContain('termen 16.12.2026 → 01.06.2027');
  });

  it('reports a call removed early, but not one that reached its deadline', () => {
    const removed = (deadline: string) => renderDigest({
      today: TODAY,
      opportunities: [opportunity({ status: 'closed', deadline })],
      events: [{ stableKey: draft().stableKey, field: 'removed', oldValue: 'open', newValue: 'closed' }],
    }).join('\n');
    expect(removed('2026-12-01')).toContain('Scoase din listă înainte de termen (1)');
    expect(removed('2026-11-01')).toBe('');
  });

  it('turns a quiet day into a useful report', () => {
    const digest = renderDigest({ today: TODAY, events: [], opportunities: [opportunity({ deadline: '2026-11-10' })] });
    const report = renderReport({ date: TODAY, checked: 3, requests: 3, bytes: 0, pendingLinks: 0, events: [], digest });
    expect(report).not.toContain('Nu s-a schimbat nimic.');
    expect(report).toContain('Se închid în 7 zile');
  });
});

describe('runChecks with EU calls', () => {
  const fetcher = { requests: 0, bytes: 0 } as Fetcher;
  const log = () => {};

  it('records a failed API call and keeps the stored calls', async () => {
    const store = new MemoryStore();
    await syncOpportunities(store, 'ec', [draft({ stableKey: 'ec:a', kind: 'ec' })], 1, TODAY);
    const down = async () => { throw new Error('EC API returned 503'); };
    const summary = await runChecks(store, fetcher, log, new Date(`${TODAY}T05:00:00Z`), down);
    expect(summary.errors).toEqual(['Apeluri UE: EC API returned 503']);
    expect(store.saved.get('ec:a')?.status).toBe('open');
  });

  it('treats an empty answer as a failure rather than closing every call', async () => {
    const store = new MemoryStore();
    await syncOpportunities(store, 'ec', [draft({ stableKey: 'ec:a', kind: 'ec' })], 1, TODAY);
    const summary = await runChecks(store, fetcher, log, new Date(`${TODAY}T05:00:00Z`), async () => []);
    expect(summary.errors[0]).toContain('no open or upcoming calls');
    expect(store.saved.get('ec:a')?.status).toBe('open');
  });

  it('shows run errors in the report', () => {
    const report = renderReport({
      date: TODAY, checked: 0, requests: 0, bytes: 0, pendingLinks: 0, events: [], errors: ['Apeluri UE: 503'],
    });
    expect(report).toContain('## Erori ale rulării');
  });
});

describe('a parsed page in the cascade', () => {
  const url = 'https://depunerepspac.afir.ro/Sesiune/Lista';

  function setup(pages: string[]) {
    const store = new MemoryStore();
    const source = store.add(url);
    let i = 0;
    const fetcher = {
      requests: 0,
      bytes: 0,
      head: async () => ({ outcome: 'ok' }),
      get: async () => ({
        outcome: 'ok',
        status: 200,
        finalUrl: url,
        contentType: 'text/html; charset=utf-8',
        etag: null,
        lastModified: null,
        contentLength: null,
        redirect: 'none',
        body: Buffer.from(pages[Math.min(i++, pages.length - 1)]!),
      }),
    } as unknown as Fetcher;
    return { store, source, fetcher };
  }

  const check = async (s: ReturnType<typeof setup>, runId: number) => {
    const now = new Date(`${TODAY}T05:00:00Z`);
    return checkSource(s.store.get(s.source.id), { store: s.store, fetcher: s.fetcher, runId, now });
  };

  it('stores calls, and ignores a counter-only change', async () => {
    const s = setup([afirPage('100'), afirPage('200')]);
    expect(await check(s, 1)).toBe('baseline');
    expect(s.store.saved.size).toBe(1);
    expect(await check(s, 2)).toBe('same_text');
    expect(s.store.opportunityEvents).toEqual([]);
  });

  it('still syncs when a shrinking list would look suspicious as text', async () => {
    const code = (n: number) => afirPage('1').replaceAll('DR-14', `DR-${n}`);
    const s = setup([[1, 2, 3, 4, 5, 6, 7, 8].map(code).join(''), code(1)]);
    await check(s, 1);
    expect(s.store.saved.size).toBe(8);
    expect(await check(s, 2)).toBe('changed');
    expect(s.store.opportunityEvents.filter((e) => e.field === 'removed')).toHaveLength(7);
  });

  it('reports a CAPTCHA page as blocked, without comparing it', async () => {
    const captcha = '<main><p>Va rugam completati urmatorul CAPTCHA pentru a continua.</p></main>';
    const s = setup([captcha]);
    expect(await check(s, 1)).toBe('blocked');
    expect(s.store.kinds()).toEqual(['blocked']);
    expect(s.store.snapshots).toEqual([]);
  });

  it('flags a page whose parser stops finding calls, and keeps the calls', async () => {
    const other = `<main><p>${'Pagină nouă. '.repeat(60)}</p></main>`;
    const s = setup([afirPage('1'), other]);
    await check(s, 1);
    await check(s, 2);
    expect(s.store.saved.get([...s.store.saved.keys()][0]!)?.status).toBe('open');
    expect(s.store.events.some((e) => e.kind === 'needs_manual')).toBe(true);
  });
});
