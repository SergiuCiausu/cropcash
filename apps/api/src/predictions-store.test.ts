import { describe, expect, it } from 'vitest';
import { toOverrides, toVersionInfo } from './db/predictions';

describe('prediction store rows', () => {
  it('reads changes in path order, with JSON null kept as "no figure yet"', () => {
    const rows = [
      { path: 'params.credit.robor_6m_pct.value', value: null, reason: 'nu e publicat' },
      { path: 'crops.crops[id=grau].price_lei_per_kg.mean', value: 1.1, reason: 'bursa, nov 2026' },
    ];
    expect(toOverrides(rows)).toEqual([
      { path: 'crops.crops[id=grau].price_lei_per_kg.mean', value: 1.1, reason: 'bursa, nov 2026' },
      { path: 'params.credit.robor_6m_pct.value', value: null, reason: 'nu e publicat' },
    ]);
  });

  it('refuses a stored row the API would refuse', () => {
    expect(() => toOverrides([{ path: 'x.y', value: { a: 1 }, reason: 'obiect' }])).toThrow();
    expect(() => toOverrides([{ path: 'x.y', value: 1, reason: '' }])).toThrow();
  });

  it('names the version fields the way the app does', () => {
    expect(
      toVersionInfo({ version: 3, published_at: '2026-11-14T10:00:00Z', published_by: null, note: 'înapoi', reverted_from: 1 }),
    ).toEqual({ version: 3, publishedAt: '2026-11-14T10:00:00Z', publishedBy: null, note: 'înapoi', revertedFrom: 1 });
  });
});
