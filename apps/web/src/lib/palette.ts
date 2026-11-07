import { useCallback, useEffect, useState } from 'react';

/* Palettes from the team prototype (farm-app/mobile/shared.js). Each chart set was
   checked there with a dataviz palette validator. */
export interface Palette {
  id: string;
  name: string;
  note: string;
  v: Record<string, string>;
}

export const PALETTES: Palette[] = [
  { id: 'violet', name: 'Câmp și violet', note: 'Lime și violet', v: { a: '#5BA52A', 'ink-a': '#3D7A13', 'tint-a': '#E9F7D3', b: '#7C5CFC', 'ink-b': '#5B3CD6', 'tint-b': '#ECE8FF', bg: '#F8F8F3', deep1: '#2C5A14', deep2: '#4A32B0', hero: '#B4E85C' } },
  { id: 'gold', name: 'Câmp și auriu', note: 'Lime și auriu', v: { a: '#5BA52A', 'ink-a': '#3D7A13', 'tint-a': '#E9F7D3', b: '#F2B81F', 'ink-b': '#8A5C00', 'tint-b': '#FFF2C9', bg: '#FBFAF1', deep1: '#2C5A14', deep2: '#8A5C00', hero: '#B4E85C' } },
  { id: 'both', name: 'Câmp, violet și auriu', note: 'Violet pentru estimări, auriu pentru plăți', v: { a: '#5BA52A', 'ink-a': '#3D7A13', 'tint-a': '#E9F7D3', b: '#7C5CFC', 'ink-b': '#5B3CD6', 'tint-b': '#ECE8FF', c: '#F2B81F', 'ink-c': '#8A5C00', 'tint-c': '#FFF2C9', bg: '#FBFAF3', deep1: '#2C5A14', deep2: '#4A32B0', hero: '#B4E85C' } },
  { id: 'wheat', name: 'Grâu copt', note: 'Auriu și oliv', v: { a: '#E0A526', b: '#7C8B3A', 'ink-a': '#855500', 'ink-b': '#525E26', 'tint-a': '#FBEFCF', 'tint-b': '#EBEFD6', bg: '#FBF8F0', deep1: '#5F4108', deep2: '#856410', hero: '#F5CE4E' } },
  { id: 'clay', name: 'Pământ arat', note: 'Teracotă și salvie', v: { a: '#C8683A', b: '#6F9A7C', 'ink-a': '#9A431C', 'ink-b': '#3C674D', 'tint-a': '#F8E4D9', 'tint-b': '#DFEDE3', bg: '#FAF6F2', deep1: '#6F2E13', deep2: '#A04E27', hero: '#F6AE7E' } },
  { id: 'vine', name: 'Podgorie', note: 'Prună și frunză de viță', v: { a: '#8E3A74', b: '#6E9B46', 'ink-a': '#7A2E63', 'ink-b': '#46692A', 'tint-a': '#F3E1EE', 'tint-b': '#E5F0D9', bg: '#FAF6F9', deep1: '#4A1B40', deep2: '#7A2E63', hero: '#E6AEDC' } },
];

const FIELD_CH = ['#5BA52A', '#7C5CFC', '#3D7A13', '#5B3CD6', '#C98A00', '#B8476A'];
const CH: Record<string, string[]> = {
  violet: FIELD_CH,
  gold: FIELD_CH,
  both: FIELD_CH,
  wheat: ['#B8860B', '#5B6FC8', '#2F7A4A', '#A04A12', '#5E8F1E', '#C0425A'],
  clay: ['#C8683A', '#6A5BC8', '#2F9A6C', '#8F3A12', '#B08A1E', '#3A6FC0'],
  vine: ['#8E3A74', '#5F9E2E', '#C25BA8', '#3A6E1A', '#B08A1E', '#5B6FC8'],
};

/** Single-accent palettes use their second colour for both jobs (estimates and payments). */
export function tokens(p: Palette): Record<string, string> {
  return {
    c: p.v.b!,
    'ink-c': p.v['ink-b']!,
    'tint-c': p.v['tint-b']!,
    dn: p.v.c ?? p.v.hero!,
    ...Object.fromEntries((CH[p.id] ?? FIELD_CH).map((c, i) => [`ch${i + 1}`, c])),
    ...p.v,
  };
}

const KEY = 'cropcash-palette';
export const DEFAULT_PALETTE = 'both';

export function applyPalette(id: string) {
  const p = PALETTES.find((x) => x.id === id) ?? PALETTES.find((x) => x.id === DEFAULT_PALETTE)!;
  for (const [k, v] of Object.entries(tokens(p))) document.documentElement.style.setProperty(`--${k}`, v);
  document.documentElement.dataset.palette = p.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', p.v.hero!);
  return p.id;
}

function readSaved(): string {
  try {
    return localStorage.getItem(KEY) ?? DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

/** Colour palette, saved per device (storage may be unavailable; then the default is used). */
export function usePalette() {
  const [id, setId] = useState<string>(() => applyPalette(readSaved()));
  useEffect(() => {
    applyPalette(id);
  }, [id]);
  const choose = useCallback((next: string) => {
    setId(applyPalette(next));
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode */
    }
  }, []);
  return { id, choose };
}
