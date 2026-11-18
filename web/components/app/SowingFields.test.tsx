import { describe, expect, it } from 'vitest';
import { readSowingDraft, sowingDraft, sowingSummary } from './SowingFields';

describe('the sowing fields', () => {
  it('saves nothing when every field is blank', () => {
    expect(readSowingDraft(sowingDraft(undefined), 'Grâu')).toEqual({ sowing: undefined });
  });

  it('keeps only what was filled in, with its unit', () => {
    const d = sowingDraft(undefined);
    d.depth = { text: '4', unit: 'cm' };
    d.plantSpacing = { text: '35', unit: 'mm' };
    expect(readSowingDraft(d, 'Grâu')).toEqual({ sowing: { depth: { value: 4, unit: 'cm' }, plantSpacing: { value: 35, unit: 'mm' } } });
  });

  it('says which field it could not read, and which one is too large', () => {
    const d = sowingDraft(undefined);
    d.rowSpacing = { text: 'doi', unit: 'cm' };
    expect(readSowingDraft(d, 'Grâu')).toEqual({ error: 'Grâu: scrie distanța între rânduri ca număr, de exemplu 4 sau 12,5.' });
    d.rowSpacing = { text: '12', unit: 'cm' };
    d.depth = { text: '4', unit: 'm' };
    expect(readSowingDraft(d, 'Grâu')).toEqual({ error: 'Grâu: adâncimea pare prea mare. Verifică unitatea (mm, cm sau m).' });
  });

  it('fills the form back from what was saved, with a comma', () => {
    expect(sowingDraft({ rowSpacing: { value: 12.5, unit: 'cm' } }).rowSpacing).toEqual({ text: '12,5', unit: 'cm' });
    expect(sowingDraft({ rowSpacing: { value: 12.5, unit: 'cm' } }).depth).toEqual({ text: '', unit: 'cm' });
  });

  it('shows only the filled-in fields', () => {
    expect(sowingSummary(undefined)).toBe('');
    expect(sowingSummary({ depth: { value: 4, unit: 'cm' } })).toBe('Adâncime 4 cm.');
    expect(sowingSummary({ rowSpacing: { value: 12.5, unit: 'cm' } })).toBe('12,5 cm între rânduri.');
    expect(sowingSummary({ depth: { value: 4, unit: 'cm' }, rowSpacing: { value: 12.5, unit: 'cm' }, plantSpacing: { value: 3, unit: 'cm' } })).toBe(
      'Adâncime 4 cm, 12,5 cm între rânduri, 3 cm între plante.',
    );
  });
});
