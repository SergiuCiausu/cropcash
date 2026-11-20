import { describe, expect, it } from 'vitest';
import md from '../../../../docs/11-open-questions.md?raw';
import gen from './questions.gen.json';
import { parseOpenQuestions } from './questions';

const SAMPLE = `# 11. Întrebări deschise

## A. Cifre DE-VERIFICAT

| # | Ce | Valoarea folosită acum | Unde se verifică | Impact |
|---|---|---|---|---|
| 1 | Cursul 2026 | 5,2788 | anunțul APIA | sumele FEADR |
| 2 | ~~Istoricul INS~~ | **Nu mai e nevoie** | — | — |

## B. Presupuneri de produs

| # | Presupunerea | De ce |
|---|---|---|
| P1 | Factorii BISS în \`subsidies-history.json\` | singurul istoric |
| P-EV1 | Evenimentele lui Ion | demo |
| P1 | Al doilea P1 | scris de două ori |

## C. Contradicții găsite

| # | Contradicția | Rezolvare |
|---|---|---|
| C1 | 800.000 vs 671.334 | Folosim 671.334. |
| C6 | Arenda la APIA | Deschisă. De citit Anexa 2. |

## D. Decizii

### Luate
1. **Deploy:** Netlify.

### Deschise
1. ~~**Domeniul pentru API**~~ **Rezolvat (8 nov 2026):** gata.
2. **Vremea, vântul:** \`weather.spray_wind_max_kmh\` e \`null\` în \`plan-params.json\`.
    - Prețuri INS 2025.
    De hotărât.
`;

describe('parseOpenQuestions', () => {
  const q = parseOpenQuestions(SAMPLE);

  it('reads the four sections, skipping decisions already taken', () => {
    expect(q.map((x) => x.key)).toEqual(['q:A1', 'q:A2', 'q:B1', 'q:BP-EV1', 'q:B1-2', 'q:C1', 'q:C6', 'q:D1', 'q:D2']);
  });

  it('marks struck-through and solved items closed, and a contradiction open while it says so', () => {
    const closed = Object.fromEntries(q.map((x) => [x.key, x.closed]));
    expect(closed).toMatchObject({ 'q:A1': false, 'q:A2': true, 'q:C1': true, 'q:C6': false, 'q:D1': true, 'q:D2': false });
  });

  it('keeps the columns as labelled lines and the list item with its sub-lines', () => {
    expect(q[0]).toMatchObject({ title: 'Cursul 2026', text: 'Folosit acum: 5,2788\nUnde se verifică: anunțul APIA\nCe schimbă: sumele FEADR' });
    const d2 = q.find((x) => x.key === 'q:D2')!;
    expect(d2.title).toBe('Vremea, vântul');
    expect(d2.text).toBe('weather.spray_wind_max_kmh e null în plan-params.json.\nPrețuri INS 2025.\nDe hotărât.');
  });

  it('collects data files and paths named in backticks', () => {
    expect(q.find((x) => x.key === 'q:D2')!.refs).toEqual(['weather.spray_wind_max_kmh', 'plan-params.json']);
    expect(q.find((x) => x.key === 'q:B1')!.refs).toEqual(['subsidies-history.json']);
  });
});

describe('parseOpenQuestions on docs/11-open-questions.md', () => {
  const q = parseOpenQuestions(md);
  const count = (section: string) => q.filter((x) => x.section === section).length;

  it('finds items in every section (a format change in the doc breaks this)', () => {
    expect(count('A')).toBeGreaterThanOrEqual(34);
    expect(count('B')).toBeGreaterThanOrEqual(15);
    expect(count('C')).toBeGreaterThanOrEqual(5);
    expect(count('D')).toBeGreaterThanOrEqual(50);
  });

  it('gives every item a title and a unique key', () => {
    expect(new Set(q.map((x) => x.key)).size).toBe(q.length);
    for (const x of q) expect(x.title.length).toBeGreaterThan(3);
  });

  it('knows the wind limit is still open and the API domain is solved', () => {
    expect(q.find((x) => x.section === 'D' && /vântul pentru stropit/.test(x.title))?.closed).toBe(false);
    expect(q.find((x) => x.section === 'D' && /Domeniul pentru API/.test(x.title))?.closed).toBe(true);
  });
});

describe('questions.gen.json', () => {
  it('is up to date with docs/11-open-questions.md (else run npm run verify:questions)', () => {
    expect(gen).toEqual(parseOpenQuestions(md));
  });
});
