import { describe, expect, it } from 'vitest';
import { countByLevel, scanData } from './scan';
import { VERIFY_FILES } from './files';
import { isFirmStatus, levelOf } from './levels';

describe('levelOf', () => {
  it('sorts statuses into three levels and leaves firm ones out', () => {
    expect(levelOf('DE-VERIFICAT')).toBe('check');
    expect(levelOf('din-presă')).toBe('weak');
    expect(levelOf('presupunere')).toBe('assumption');
    expect(levelOf('confirmat-2026')).toBeNull();
    expect(levelOf('setare')).toBeNull();
    expect(isFirmStatus('confirmat')).toBe(true);
    expect(isFirmStatus('DE-VERIFICAT')).toBe(false);
  });
});

describe('scanData on a small file', () => {
  const files = {
    'x.json': {
      meta: { status: 'confirmat' },
      schemes: [
        { id: 'A', value: 5, status: 'DE-VERIFICAT', note: 'de citit', source_url: 'https://apia.org.ro' },
        { id: 'B', value: 6, status: 'confirmat' },
        { id: 'C', deadline: '2027-03-31', deadline_status: 'DE-VERIFICAT', minimum_kg_ha: null, minimum_status: 'presupunere' },
      ],
      rules: [{ field: 'ha', status: 'din-presă', source: 'Agerpres, 2026' }],
      status_values: ['confirmat', 'DE-VERIFICAT'],
    },
  };
  const items = scanData(files);

  it('finds every weak status, by id, with the value next to it', () => {
    expect(items.map((i) => i.key)).toEqual([
      'x.json:schemes[id=A]#status',
      'x.json:schemes[id=C]#deadline_status',
      'x.json:schemes[id=C]#minimum_status',
      'x.json:rules[0]#status',
    ]);
    const [a, deadline, minimum, rule] = items;
    expect(a).toMatchObject({ value: 5, note: 'de citit', sourceUrl: 'https://apia.org.ro', level: 'check', name: 'A' });
    expect(deadline).toMatchObject({ value: '2027-03-31', name: 'C · deadline' });
    expect(minimum).toMatchObject({ value: null, level: 'assumption' });
    expect(rule).toMatchObject({ level: 'weak', source: 'Agerpres, 2026', sourceUrl: null });
  });

  it('keeps the key when the list is reordered', () => {
    const swapped = { 'x.json': { ...files['x.json'], schemes: [...files['x.json'].schemes].reverse() } };
    expect(scanData(swapped).map((i) => i.key).sort()).toEqual(items.map((i) => i.key).sort());
  });
});

describe('scanData on docs/data', () => {
  const items = scanData();

  it('has no two items with the same key', () => {
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });

  it('finds the DE-VERIFICAT markers in the files', () => {
    const c = countByLevel(items);
    expect(c.check).toBeGreaterThan(100);
    expect(c.weak).toBeGreaterThan(0);
    expect(c.assumption).toBeGreaterThan(0);
    expect(items.some((i) => i.key === 'subsidies-2026.json:schemes[code=PD-05].eligibility.rules[0]#status')).toBe(true);
  });

  it('addresses list items by id, not by position, where the items have one', () => {
    const byIndex = items.filter((i) => /\[\d+\]/.test(i.path));
    // Only lists whose items have no unique id: eligibility rules and the exchange rate with no year.
    for (const i of byIndex) expect(i.path).toMatch(/eligibility\.rules\[\d+\]|exchange_rates\[\d+\]/);
  });

  it('gives the forecast path for the files /admin edits', () => {
    const pd = items.find((i) => i.file === 'subsidies-2026.json' && i.path.startsWith('schemes[code=PD-03]'));
    expect(pd?.appPath).toMatch(/^subsidies\.schemes\[code=PD-03\]/);
    expect(items.find((i) => i.file === 'oblio.json')?.appPath).toBeNull();
  });

  it('looks through every reference file', () => {
    expect(Object.keys(VERIFY_FILES)).toHaveLength(24);
  });
});
