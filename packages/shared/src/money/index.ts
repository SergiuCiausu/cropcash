/**
 * Money is always an integer number of minor units:
 *  - Cents: euro cents (1 EUR = 100)
 *  - Bani:  RON bani   (1 leu = 100)
 * Areas are integer "ari" (hundredths of a hectare).
 * Never store money as floats; convert at the edges only.
 */
export type Cents = number;
export type Bani = number;
export type Ari = number;

/** Exchange rates are stored with 4 decimals (5.0806 lei/EUR -> 50806). */
const RATE_SCALE = 10_000;

function assertInt(n: number, what: string): void {
  if (!Number.isSafeInteger(n)) throw new Error(`${what} must be a safe integer, got ${n}`);
}

export function eurToCents(eur: number): Cents {
  return Math.round(eur * 100);
}

export function leiToBani(lei: number): Bani {
  return Math.round(lei * 100);
}

export function haToAri(ha: number): Ari {
  return Math.round(ha * 100);
}

export function ariToHa(ari: Ari): number {
  return ari / 100;
}

export function baniToLei(bani: Bani): number {
  return bani / 100;
}

/**
 * Whole lei as a farmer types them: "35 000", "35.000", "35,000", "35000 lei", "35.000,00".
 * A dot or comma before exactly three digits groups thousands. Null for anything else ("12,5",
 * "1.2.3", ""), so a misread amount is refused and never saved as a smaller one.
 */
export function parseWholeLei(text: string | null | undefined): number | null {
  const typed = text?.replace(/lei|ron/gi, '').replace(/\s/g, '') ?? '';
  const match = /^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]0{1,2})?$/.exec(typed);
  if (!match) return null;
  const lei = Number(match[1]!.replace(/[.,]/g, ''));
  return Number.isSafeInteger(lei) ? lei : null;
}

export function centsToEur(cents: Cents): number {
  return cents / 100;
}

/** ari × (cents per ha) -> cents, rounded half-up to the cent. */
export function areaTimesRate(ari: Ari, centsPerHa: Cents): Cents {
  assertInt(ari, 'ari');
  assertInt(centsPerHa, 'centsPerHa');
  return Math.round((ari * centsPerHa) / 100);
}

/** units (heads) × (cents per head) -> cents. */
export function unitsTimesRate(units: number, centsPerUnit: Cents): Cents {
  assertInt(units, 'units');
  assertInt(centsPerUnit, 'centsPerUnit');
  return units * centsPerUnit;
}

/** EUR cents -> RON bani at a lei/EUR rate (e.g. 5.28). */
export function eurCentsToBani(cents: Cents, leiPerEur: number): Bani {
  assertInt(cents, 'cents');
  const scaledRate = Math.round(leiPerEur * RATE_SCALE);
  return Math.round((cents * scaledRate) / RATE_SCALE);
}

/** Integer percentage of an amount (e.g. 75%), rounded half-up. */
export function applyPct(amount: number, pct: number): number {
  assertInt(amount, 'amount');
  return Math.round((amount * pct) / 100);
}

/** Multiply an amount by a real factor (e.g. 0.8999), rounded half-up. */
export function applyFactor(amount: number, factor: number): number {
  assertInt(amount, 'amount');
  return Math.round(amount * factor);
}

/** Round down to a multiple of step (e.g. salary to 50 lei = 5000 bani). */
export function floorTo(amount: number, step: number): number {
  return Math.floor(amount / step) * step;
}

/** Round up to a multiple of step (e.g. credit to 100 lei = 10000 bani). */
export function ceilTo(amount: number, step: number): number {
  return Math.ceil(amount / step) * step;
}

export interface Range {
  min: number;
  probable: number;
  max: number;
}

export function addRanges(a: Range, b: Range): Range {
  return { min: a.min + b.min, probable: a.probable + b.probable, max: a.max + b.max };
}

export const ZERO_RANGE: Range = Object.freeze({ min: 0, probable: 0, max: 0 });
