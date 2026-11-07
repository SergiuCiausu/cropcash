import type { AppData, Fund, Scheme } from '../data';
import {
  addRanges,
  applyFactor,
  applyPct,
  areaTimesRate,
  eurCentsToBani,
  eurToCents,
  haToAri,
  unitsTimesRate,
  ZERO_RANGE,
  type Bani,
  type Cents,
  type Range,
} from '../money';
import { buildProfile, type FarmInput, type FarmProfile } from './profile';
import { checkEligibility, type FailedCondition, type UnverifiedRule } from './rules';
import { computeRangeFactors, type RangeFactors } from './range';

export * from './profile';
export * from './rules';
export * from './range';

export interface SubsidyParams {
  /** Override lei/EUR per fund (e.g. from env or the UI). Falls back to data. */
  exchangeRates?: Partial<Record<Fund, number>>;
}

export interface SchemeResult {
  code: string;
  nameRo: string;
  fund: Fund;
  unit: Scheme['unit'];
  /** Paid units: ari for ha schemes, heads for cap schemes. */
  units: number;
  amountEurPerUnit: number;
  /** Total for this scheme, EUR cents. */
  eur: Range;
  /** Advance (avans) in EUR cents: advance_pct of the reference amount. */
  advanceEur: Cents;
  /** Balance (sold) in EUR cents = total − advance, floored at 0. */
  balanceEur: Range;
  /** Indicative RON value per scheme (bani). Totals are converted per fund. */
  leiIndicative: Range;
  factors: RangeFactors;
  schemeStatus: Scheme['status'];
  unverified: UnverifiedRule[];
}

export interface NotEligible {
  code: string;
  nameRo: string;
  failed: FailedCondition[];
}

export interface Excluded {
  code: string;
  nameRo: string;
  reason: 'amount_unknown';
}

export interface SubsidyResult {
  schemes: SchemeResult[];
  notEligible: NotEligible[];
  /** Eligible but not counted (e.g. PD-28 without a 2026 amount). */
  excluded: Excluded[];
  rates: Record<Fund, { value: number; isDefault: boolean }>;
  totals: {
    eur: Range;
    lei: Range;
    advanceEur: Cents;
    advanceLei: Bani;
    balanceEur: Range;
    balanceLei: Range;
  };
}

export function resolveRates(data: AppData, params: SubsidyParams = {}) {
  const campaign = data.subsidies.meta.campaign_year;
  const resolve = (fund: Fund) => {
    const override = params.exchangeRates?.[fund];
    if (override !== undefined) return { value: override, isDefault: false };
    const row = data.subsidies.exchange_rates.find((r) => r.campaign === campaign && r.fund === fund);
    if (row?.value) return { value: row.value, isDefault: false };
    if (row?.default_param) return { value: row.default_param, isDefault: true };
    throw new Error(`No exchange rate for ${fund} in campaign ${campaign}`);
  };
  return { FEGA: resolve('FEGA'), FEADR: resolve('FEADR') };
}

function paidUnits(scheme: Scheme, profile: FarmProfile): number {
  const raw = profile[scheme.units_field];
  if (scheme.unit === 'ha' && scheme.max_ha !== null) return Math.min(raw, haToAri(scheme.max_ha));
  return raw;
}

function computeScheme(
  scheme: Scheme & { amount_eur: number },
  profile: FarmProfile,
  factors: RangeFactors,
  leiPerEur: number,
  unverified: UnverifiedRule[],
): SchemeResult {
  const units = paidUnits(scheme, profile);
  const rateCents = eurToCents(scheme.amount_eur);
  const probable = scheme.unit === 'ha' ? areaTimesRate(units, rateCents) : unitsTimesRate(units, rateCents);
  const eur: Range = {
    min: applyFactor(probable, factors.min),
    probable,
    max: applyFactor(probable, factors.max),
  };
  // The advance is paid on the already-announced reference amount, so it is certain;
  // all uncertainty sits in the balance (docs/03-subsidies.md §5).
  const advanceEur = scheme.advance_pct === null ? 0 : applyPct(probable, scheme.advance_pct);
  const balanceEur: Range = {
    min: Math.max(0, eur.min - advanceEur),
    probable: Math.max(0, eur.probable - advanceEur),
    max: Math.max(0, eur.max - advanceEur),
  };
  const toLei = (c: number) => eurCentsToBani(c, leiPerEur);
  return {
    code: scheme.code,
    nameRo: scheme.name_ro,
    fund: scheme.fund,
    unit: scheme.unit,
    units,
    amountEurPerUnit: scheme.amount_eur,
    eur,
    advanceEur,
    balanceEur,
    leiIndicative: { min: toLei(eur.min), probable: toLei(eur.probable), max: toLei(eur.max) },
    factors,
    schemeStatus: scheme.status,
    unverified,
  };
}

/**
 * Computes the farm's expected APIA subsidies as a min/probable/max range,
 * split into advance and balance. Pure: all figures come from `data`.
 */
export function computeSubsidies(farm: FarmInput, data: AppData, params: SubsidyParams = {}): SubsidyResult {
  const rates = resolveRates(data, params);
  const schemes: SchemeResult[] = [];
  const notEligible: NotEligible[] = [];
  const excluded: Excluded[] = [];

  for (const scheme of data.subsidies.schemes) {
    const minParcelAri = scheme.eligibility.parcel_min_ha ? haToAri(scheme.eligibility.parcel_min_ha.value) : 0;
    const profile = buildProfile(farm, minParcelAri);
    const check = checkEligibility(scheme, profile);

    if (!check.eligible) {
      notEligible.push({ code: scheme.code, nameRo: scheme.name_ro, failed: check.failed });
      continue;
    }
    if (scheme.amount_eur === null) {
      excluded.push({ code: scheme.code, nameRo: scheme.name_ro, reason: 'amount_unknown' });
      continue;
    }
    const factors = computeRangeFactors(data.history, scheme.code);
    schemes.push(
      computeScheme({ ...scheme, amount_eur: scheme.amount_eur }, profile, factors, rates[scheme.fund].value, check.unverified),
    );
  }

  // Convert to lei per fund on summed euros (avoids per-scheme rounding drift).
  let eur = { ...ZERO_RANGE };
  let lei = { ...ZERO_RANGE };
  let balanceEur = { ...ZERO_RANGE };
  let balanceLei = { ...ZERO_RANGE };
  let advanceEur = 0;
  let advanceLei = 0;

  for (const fund of ['FEGA', 'FEADR'] as const) {
    const inFund = schemes.filter((s) => s.fund === fund);
    if (inFund.length === 0) continue;
    const rate = rates[fund].value;
    const fundEur = inFund.reduce((acc, s) => addRanges(acc, s.eur), { ...ZERO_RANGE });
    const fundBalance = inFund.reduce((acc, s) => addRanges(acc, s.balanceEur), { ...ZERO_RANGE });
    const fundAdvance = inFund.reduce((acc, s) => acc + s.advanceEur, 0);
    const conv = (r: Range): Range => ({
      min: eurCentsToBani(r.min, rate),
      probable: eurCentsToBani(r.probable, rate),
      max: eurCentsToBani(r.max, rate),
    });

    eur = addRanges(eur, fundEur);
    lei = addRanges(lei, conv(fundEur));
    balanceEur = addRanges(balanceEur, fundBalance);
    advanceEur += fundAdvance;
    const fundAdvanceLei = eurCentsToBani(fundAdvance, rate);
    advanceLei += fundAdvanceLei;
    // Balance in lei = total lei − advance lei, so advance + balance always equals the total.
    const fundLei = conv(fundEur);
    balanceLei = addRanges(balanceLei, {
      min: Math.max(0, fundLei.min - fundAdvanceLei),
      probable: Math.max(0, fundLei.probable - fundAdvanceLei),
      max: Math.max(0, fundLei.max - fundAdvanceLei),
    });
  }

  return {
    schemes,
    notEligible,
    excluded,
    rates,
    totals: { eur, lei, advanceEur, advanceLei, balanceEur, balanceLei },
  };
}
