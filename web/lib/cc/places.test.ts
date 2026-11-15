import { describe, expect, it } from 'vitest';
import type { PlotGeometry } from '@cropcash/shared';
import { placeName, plotPlace } from './places';

const square: PlotGeometry = { type: 'Polygon', coordinates: [[[24.92, 44.11], [24.93, 44.11], [24.93, 44.12], [24.92, 44.12], [24.92, 44.11]]] };

describe('place names in the app', () => {
  it('names a code in Teleorman or Constanța, and keeps the code elsewhere', () => {
    expect(placeName(153277)).toBe('comuna Măldăeni');
    expect(placeName(153286)).toBe('satul Măldăeni, comuna Măldăeni');
    expect(placeName(999999)).toBe('SIRUTA 999999');
  });

  it('a parcel: the cerere’s village, else the one from its outline, else its commune', () => {
    expect(plotPlace({ siruta: 153277, geometry: square })).toBe('satul Măldăeni, comuna Măldăeni');
    expect(plotPlace({ siruta: 153277, geometry: null })).toBe('comuna Măldăeni');
    expect(plotPlace({ siruta: 153277, village_siruta: 153286, geometry: null })).toBe('satul Măldăeni, comuna Măldăeni');
    expect(plotPlace({ siruta: null })).toBeNull();
    expect(plotPlace({ siruta: 999999 })).toBe('SIRUTA 999999');
  });
});
