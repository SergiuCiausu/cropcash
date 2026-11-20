/* The excise refunds a farm can count on (docs/accize-plan.md §3): money the state pays back after each quarter,
   for the schemes the farm has an approved acord for. Today that's only the diesel refund (HG 1174/2014).
   Only litres the farmer noted on a diesel expense count: there is no "typical" diesel per hectare in docs/data,
   so nothing is guessed. A day with no known rate (DE-VERIFICAT, null) adds nothing. */
import type { AppData, ExciseEnrollmentStatus } from '../data';
import type { Bani } from '../money';
import { capFor, fuelRefundBani, rateOn, type FuelRate } from '../reports/fuel';
import { addMonthsToDate, type IsoDate } from './dates';

/** One quarter's refund, paid inside a window after the quarter (excise-schemes.json → payment_lag_months). */
export interface ExciseRefundClaim {
  /** `excise:<scheme>:<YYYY-Qn>` */
  id: string;
  schemeId: string;
  period: string;
  amount: Bani;
  window: { start: IsoDate; end: IsoDate };
  /** Litres (hundredths) noted in the quarter and counted, after the yearly cap. */
  litresCl: number;
  /** Litres noted on days with no known rate: not in the amount. */
  noRateCl: number;
  /** Litres over the yearly cap: not in the amount. */
  overCapCl: number;
  /** A rate, the payment delay or the acord rests on a DE-VERIFICAT figure. */
  unverified: boolean;
}

/** A farm's row in farm_excise_schemes (migration 052), as the API reads it. */
export interface StoredExciseEnrollment {
  scheme_id: string;
  year: number;
  status: ExciseEnrollmentStatus;
  acord_on: string | null;
}

/** A diesel expense with its litres (migration 027), as the plan reads it. */
export interface DieselLitres {
  date: IsoDate;
  litresCl: number;
}

/** The farm's crops for the cap: hectares per APIA catalogue id. */
export interface CapCrop {
  cropId: string;
  areaHa: number;
}

const QUARTER_END = ['03-31', '06-30', '09-30', '12-31'];
const quarterOf = (date: IsoDate) => Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1;

/**
 * The yearly litre cap (hundredths) for these crops, or null when a crop has no cap in the law's annex or isn't
 * in the APIA catalogue: then nothing is capped and the claim says so through `unverified`. An acord asked for
 * during the year covers the months after it (fuelCapCl's rule).
 */
export function dieselCapCl(crops: readonly CapCrop[], data: Pick<AppData, 'catalogue' | 'fuel'>, acordOn: string | null, year: number): { capCl: number | null } {
  let capCl = 0;
  for (const c of crops) {
    const line = data.catalogue.find((x) => x.id === c.cropId);
    const cap = line ? capFor({ code: line.code ?? null, heading: line.heading ?? null, section: line.section ?? null }, data.fuel.caps_l_per_ha) : null;
    if (!cap) return { capCl: null };
    capCl += Math.round(cap.value * 100 * c.areaHa);
  }
  // An acord from the year before (by 20 December) covers the whole year.
  const month = acordOn && Number(acordOn.slice(0, 4)) === year ? Number(acordOn.slice(5, 7)) : 0;
  return { capCl: Math.round((capCl * (12 - month)) / 12) };
}

export interface ExciseRefundInput {
  enrollments: readonly StoredExciseEnrollment[];
  diesel: readonly DieselLitres[];
  crops: readonly CapCrop[];
  /** Quarters already paid (`<scheme>:<YYYY-Qn>`): their money is in the balance. */
  paid?: ReadonlySet<string>;
}

/**
 * The refund of each quarter of each year the farm has an approved acord for, oldest first. Only a scheme that
 * counts as revenue and is in force on the day of the litres; a quarter with nothing to pay is left out.
 * Litres are counted in date order against the year's cap, so the cap cuts the latest ones.
 */
export function exciseRefundClaims(input: ExciseRefundInput, data: Pick<AppData, 'excise' | 'catalogue' | 'fuel'>): ExciseRefundClaim[] {
  const claims: ExciseRefundClaim[] = [];
  for (const e of input.enrollments) {
    if (e.status !== 'approved') continue;
    const scheme = data.excise.schemes.find((s) => s.id === e.scheme_id);
    // Only the diesel refund has its figures (fuel-excise.json) today; another refund needs its own file first.
    if (!scheme || !scheme.counts_as_revenue || scheme.details_file !== 'fuel-excise.json' || !scheme.payment_lag_months) continue;
    const lag = scheme.payment_lag_months;
    const inForce = (d: IsoDate) => (!scheme.valid_from || scheme.valid_from <= d) && (!scheme.valid_to || d <= scheme.valid_to);
    // The acord covers its year from the day it was asked for.
    const from = e.acord_on && Number(e.acord_on.slice(0, 4)) === e.year ? e.acord_on : `${e.year}-01-01`;
    const litres = input.diesel
      .filter((d) => d.litresCl > 0 && d.date.slice(0, 4) === String(e.year) && d.date >= from && inForce(d.date))
      .sort((a, b) => a.date.localeCompare(b.date));
    const { capCl } = dieselCapCl(input.crops, data, e.acord_on, e.year);
    let capLeft = capCl ?? Number.POSITIVE_INFINITY;

    for (let q = 1; q <= 4; q++) {
      const period = `${e.year}-Q${q}`;
      const inQuarter = litres.filter((d) => quarterOf(d.date) === q);
      if (inQuarter.length === 0) continue;
      let counted = 0;
      let noRate = 0;
      let overCap = 0;
      const byRate = new Map<FuelRate, number>();
      for (const d of inQuarter) {
        const rate = rateOn(d.date, data.fuel.rates);
        if (!rate) {
          noRate += d.litresCl;
          continue;
        }
        const take = Math.min(d.litresCl, capLeft);
        capLeft -= take;
        overCap += d.litresCl - take;
        if (take > 0) {
          counted += take;
          byRate.set(rate, (byRate.get(rate) ?? 0) + take);
        }
      }
      // One rounding per rate, as the diesel report does (reports/fuel.ts fuelLines).
      const amount = [...byRate].reduce((s, [rate, cl]) => s + fuelRefundBani(cl, rate.bani_per_10_l!), 0);
      if (amount <= 0 || input.paid?.has(`${scheme.id}:${period}`)) continue;
      const quarterEnd = `${e.year}-${QUARTER_END[q - 1]}`;
      claims.push({
        id: `excise:${scheme.id}:${period}`,
        schemeId: scheme.id,
        period,
        amount,
        window: { start: addMonthsToDate(quarterEnd, lag.min), end: addMonthsToDate(quarterEnd, lag.max) },
        litresCl: counted,
        noRateCl: noRate,
        overCapCl: overCap,
        unverified:
          lag.status === 'DE-VERIFICAT' || capCl === null || [...byRate.keys()].some((r) => r.status === 'DE-VERIFICAT'),
      });
    }
  }
  return claims.sort((a, b) => a.window.start.localeCompare(b.window.start) || a.id.localeCompare(b.id));
}

/** The diesel expenses with litres among the farm's money rows (signed: expenses below zero). */
export function dieselFromTransactions(rows: readonly { category?: string | null; occurred_at: string; fuel_liters_cl?: number | null }[]): DieselLitres[] {
  return rows.flatMap((t) => (t.category === 'diesel' && (t.fuel_liters_cl ?? 0) > 0 ? [{ date: t.occurred_at.slice(0, 10), litresCl: t.fuel_liters_cl! }] : []));
}


/**
 * The farm's rows with one set (farm_excise_schemes, as the API's upsert leaves them). The phone uses it for a change
 * waiting in the queue and for Ion's farm, so both show what the server will keep.
 */
export function withEnrollment(
  rows: readonly StoredExciseEnrollment[],
  input: { schemeId: string; year: number; status: ExciseEnrollmentStatus; acordOn?: string | null },
): StoredExciseEnrollment[] {
  const row: StoredExciseEnrollment = { scheme_id: input.schemeId, year: input.year, status: input.status, acord_on: input.acordOn ?? null };
  const rest = rows.filter((r) => r.scheme_id !== row.scheme_id || r.year !== row.year);
  return [...rest, row].sort((a, b) => b.year - a.year || a.scheme_id.localeCompare(b.scheme_id));
}
