import { describe, expect, it } from 'vitest';
import { normalize, sha256 } from '../src/normalize.ts';

describe('normalize', () => {
  it('turns cedilla letters into comma letters', () => {
    expect(normalize('Ştiinţă şi ţară')).toBe('Știință și țară');
  });

  it('treats composed and decomposed letters as the same', () => {
    expect(normalize('a̦')).toBe(normalize('a̦'.normalize('NFC')));
    expect(normalize('Sesiune nouă')).toBe(normalize('Sesiune nouă'.normalize('NFD')));
  });

  it('collapses spacing, removes blank lines and keeps line breaks', () => {
    expect(normalize('  a    b\r\n\r\n\t\n c  ')).toBe('a b\nc');
  });

  it('removes invisible characters', () => {
    expect(normalize('sub​ven­ție﻿')).toBe('subvenție');
  });

  it('keeps case, because a case change is a real change', () => {
    expect(normalize('Ghid')).not.toBe(normalize('GHID'));
  });

  it('gives the same hash to the two spellings of a page', () => {
    expect(sha256(normalize('Direcţia  Agricolă'))).toBe(sha256(normalize('Direcția Agricolă')));
  });
});
