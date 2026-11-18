import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPEC_PATH } from '../src/config.ts';
import { frequencyFor, parseSpec } from '../src/seed.ts';

const sample = `
## 3. Other
| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| Ignored | https://ignored.example/ | pagina | da |

## 4. Surse

### 4.1 MADR – Ministerul Agriculturii

| Titlu | URL | Tip | Verificat |
| --- | --- | --- | --- |
| Pagina | https://a.example/x | index | nu |
| Legislație | https://a.example/y.pdf | pdf | da |

Notă: text after a table.

### 4.12 Direcțiile Agricole Județene (DAJ)

| Județ | URL | Verificat |
| --- | --- | --- |
| Alba | https://b.example/ | da (ultima actualizare 2018) |
| Neamț | – | negăsit |
`;

describe('parseSpec', () => {
  it('reads only section 4, including both table shapes', () => {
    const rows = parseSpec(sample);
    expect(rows.map((r) => r.url)).toEqual(['https://a.example/x', 'https://a.example/y.pdf', 'https://b.example/']);
  });

  it('takes the short institution name and defaults DAJ sites to index', () => {
    const [first, , daj] = parseSpec(sample);
    expect(first).toMatchObject({ institution: 'MADR', type: 'index', verified: false });
    expect(daj).toMatchObject({ institution: 'DAJ', title: 'DAJ Alba', type: 'index', verified: true });
  });

  it('rejects an unknown source type', () => {
    expect(() => parseSpec(sample.replace('| index |', '| pdff |'))).toThrow(/Unknown type/);
  });

  it('finds every URL in the real spec, with none repeated', () => {
    const rows = parseSpec(fs.readFileSync(SPEC_PATH, 'utf8'));
    expect(rows).toHaveLength(179);
    expect(new Set(rows.map((r) => r.url)).size).toBe(179);
  });
});

describe('frequencyFor', () => {
  it('checks funding pages daily and reference pages weekly', () => {
    expect(frequencyFor('Sesiuni deschise')).toBe('daily');
    expect(frequencyFor('Calendar apeluri')).toBe('daily');
    expect(frequencyFor('Legislație națională')).toBe('weekly');
    expect(frequencyFor('Oficii județene (OJFIR)')).toBe('weekly');
  });
});
