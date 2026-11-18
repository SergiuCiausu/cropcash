/* "Total" or "Pe hectar": the unit a figure is typed or read in (docs/per-ha-total-plan.md).
   What is saved never changes: crop costs and yields per hectare, noted sales and expenses as totals.
   These read what was typed in either unit into the saved one, and say both back. Pure, no storage. */
import { baniToPerHaLei, parseWholeLei, perHaBani, perHaToBani, perHaToTonnes, tonnesToPerHa } from '../../../packages/shared/src/money/index';
import { group, ha } from './format';
import { readText, writeText, type KeyStore } from './storage';

export type Basis = 'total' | 'ha';
/** Money in lei, or tonnes of grain. */
export type BasisKind = 'lei' | 'tonnes';

/** The one choice every results card follows. */
export const RESULTS_BASIS_KEY = 'cropcash-basis';
/** The sale and expense form's last unit, kept because the same farmer notes many papers alike. */
export const RECORD_BASIS_KEY = 'cropcash-basis-record';

export const isBasis = (v: unknown): v is Basis => v === 'total' || v === 'ha';
export function loadBasis(store: KeyStore, key: string): Basis | null {
  const v = readText(store, key);
  return isBasis(v) ? v : null;
}
export const saveBasis = (store: KeyStore, key: string, basis: Basis) => writeText(store, key, basis);

/** The switch's two words. */
export const basisWords = (kind: BasisKind): Record<Basis, string> => (kind === 'lei' ? { total: 'Total', ha: 'Pe hectar' } : { total: 'Tone', ha: 'Tone/ha' });

/* ---- Reading what was typed ---- */
/** A decimal as a farmer types it ("4,5", "4.5"). Null for anything else. */
export function decimalOf(text: string): number | null {
  const t = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}
const decimalWords = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
/** A figure typed in the unit that isn't saved needs hectares to convert; one typed in the saved unit doesn't. */
const canConvert = (basis: Basis, saved: Basis, ari: number) => basis === saved || ari > 0;

/** Lei typed in either unit -> whole lei per hectare (what crop costs save). Null when unusable. */
export function leiPerHaFrom(text: string, basis: Basis, ari: number): number | null {
  const lei = parseWholeLei(text);
  if (lei === null || !canConvert(basis, 'ha', ari)) return null;
  return basis === 'ha' ? lei : baniToPerHaLei(lei * 100, ari);
}

/** Lei typed in either unit -> bani for the whole area (what sales and expenses save). Null when unusable. */
export function totalBaniFrom(text: string, basis: Basis, ari: number): number | null {
  const lei = parseWholeLei(text);
  if (lei === null || !canConvert(basis, 'total', ari)) return null;
  return basis === 'total' ? lei * 100 : perHaToBani(lei, ari);
}

/** Tonnes typed in either unit -> tonnes per hectare (what yields save). */
export function tPerHaFrom(text: string, basis: Basis, ari: number): number | null {
  const t = decimalOf(text);
  if (t === null || !canConvert(basis, 'ha', ari)) return null;
  return basis === 'ha' ? t : tonnesToPerHa(t, ari);
}

/** Tonnes typed in either unit -> tonnes for the whole area (what "Ce ai strâns" saves). */
export function tonnesFrom(text: string, basis: Basis, ari: number): number | null {
  const t = decimalOf(text);
  if (t === null || !canConvert(basis, 'total', ari)) return null;
  return basis === 'total' ? t : perHaToTonnes(t, ari);
}

/**
 * The text after the switch flips, holding the same amount in the other unit, so a filled-in figure
 * never changes meaning. Empty or unreadable text stays as it is, and so does anything without hectares.
 */
export function flipText(text: string, kind: BasisKind, from: Basis, ari: number): string {
  if (!(ari > 0)) return text;
  if (kind === 'lei') {
    const lei = parseWholeLei(text);
    if (lei === null) return text;
    return group(from === 'ha' ? Math.round(perHaToBani(lei, ari) / 100) : baniToPerHaLei(lei * 100, ari)!);
  }
  const t = decimalOf(text);
  if (t === null) return text;
  return decimalWords(from === 'ha' ? perHaToTonnes(t, ari) : tonnesToPerHa(t, ari)!);
}

/**
 * The line under a field: the figure in both units, as it will be saved. `saved` is the unit the app
 * keeps; typed in the other one, a rounding shows here before saving, never after.
 */
export function basisEcho(text: string, kind: BasisKind, basis: Basis, ari: number, saved: Basis): string {
  if (!(ari > 0)) return '';
  const area = `${ha(ari)} ha`;
  if (kind === 'lei') {
    if (parseWholeLei(text) === null) return '';
    if (saved === 'ha') {
      const perHa = leiPerHaFrom(text, basis, ari)!;
      const total = `${group(Math.round(perHaToBani(perHa, ari) / 100))} lei`;
      return `${basis === 'ha' ? 'Adică' : 'Salvăm'} ${group(perHa)} lei/ha × ${area} = ${total}`;
    }
    const bani = totalBaniFrom(text, basis, ari)!;
    return basis === 'ha' ? `Adică ${group(parseWholeLei(text)!)} lei/ha × ${area} = ${group(Math.round(bani / 100))} lei` : `Adică ${group(Math.round(bani / 100))} lei (${group(Math.round(perHaBani(bani, ari)! / 100))} lei/ha pe ${area})`;
  }
  if (decimalOf(text) === null) return '';
  if (saved === 'ha') {
    const perHa = tPerHaFrom(text, basis, ari)!;
    return `${basis === 'ha' ? 'Adică' : 'Salvăm'} ${decimalWords(perHa)} t/ha × ${area} = ${decimalWords(perHaToTonnes(perHa, ari))} t`;
  }
  const t = tonnesFrom(text, basis, ari)!;
  return basis === 'ha' ? `Adică ${decimalWords(decimalOf(text)!)} t/ha × ${area} = ${decimalWords(t)} t` : `Adică ${decimalWords(tonnesToPerHa(t, ari)!)} t pe hectar, pe ${area}`;
}

/** Bani shown for the whole area or per hectare. Without hectares it stays the total. */
export const shownBani = (bani: number, ari: number, basis: Basis): { bani: number; perHa: boolean } =>
  basis === 'ha' && ari > 0 ? { bani: perHaBani(bani, ari)!, perHa: true } : { bani, perHa: false };
