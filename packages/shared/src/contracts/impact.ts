/* How a contract weighs on the farm's money (docs/contracts-plan.md §5.2). Pure: everything comes from the plan.

   - Per agricultural year (Recolta 2027 runs from November 2026, farm/harvests.ts): what the contract brings in,
     what it takes out and its taxes, and its share of the farm's money in and out that year.
   - The salary: the normal-year salary with the contract, and with the plan run again without it.
   - Per ha, for land taken in arendă: the farm's mean margin per ha (crops-reference.json) minus the contract's yearly
     cost per ha. A farm whose crops have no reference figures gets no number, never a guess.
   - Until the end: what's still to come from the plan's first month to the day it stops, inside the plan.
   An arendă (lease_contracts) and any other contract both work: their entries carry the contract's id. */
import type { AppData } from '../data';
import type { Bani } from '../money';
import { harvestYear } from '../farm/harvests';
import { buildFarmPlan, type FarmPlanOptions, type PlanFarm } from '../cashflow/farm-plan';
import { lastDay, type IsoDate } from '../cashflow/dates';
import type { Timeline, TimelineEntry } from '../cashflow/timeline';
import { endInputOfContract, endInputOfLease } from './view';
import { runsUntil } from './end';
import { rentPayments } from '../arenda/schedule';

export interface ContractYear {
  /** The agricultural year (harvest year). */
  year: number;
  inBani: Bani;
  outBani: Bani;
  /** Taxes and VAT the contract moves, net (paid minus got back). */
  taxBani: Bani;
  /** Its share of the farm's money that year, in whole percent; null when the farm has none. */
  shareOfOutPct: number | null;
  shareOfInPct: number | null;
}

export interface ContractImpact {
  contractId: string;
  years: ContractYear[];
  /** From the plan's first month to the day it stops, or to the plan's end when it runs past it. */
  untilEnd: { inBani: Bani; outBani: Bani; taxBani: Bani; through: IsoDate; pastPlan: boolean };
  /** The normal-year salary with and without the contract. */
  salary: { withBani: Bani; withoutBani: Bani };
  /** Land taken in arendă: what each hectare leaves after the rent and its tax; null when it can't be told. */
  perHa: { marginBani: Bani; costBani: Bani; leftBani: Bani } | null;
}

const CONTRACT_IN = new Set(['contract_in', 'rent_in']);
const CONTRACT_OUT = new Set(['contract_out', 'rent']);
const TAX = new Set(['contract_tax', 'rent_tax']);

/** A contract's sums in a set of entries. */
function sums(entries: readonly TimelineEntry[]) {
  let inBani = 0;
  let outBani = 0;
  let taxBani = 0;
  for (const e of entries) {
    if (CONTRACT_IN.has(e.kind)) inBani += e.value;
    else if (CONTRACT_OUT.has(e.kind)) outBani += e.value;
    else if (TAX.has(e.kind)) taxBani += e.direction === 'in' ? -e.value : e.value;
  }
  return { inBani, outBani, taxBani };
}

const pct = (part: Bani, whole: Bani) => (whole > 0 ? Math.round((part * 100) / whole) : null);

/** Per agricultural year, from one timeline. */
export function contractYears(t: Timeline, contractId: string): ContractYear[] {
  const all = t.months.flatMap((m) => m.entries);
  const years = [...new Set(all.filter((e) => e.contractId === contractId).map((e) => harvestYear(e.date)))].sort();
  return years.map((year) => {
    const ofYear = all.filter((e) => harvestYear(e.date) === year);
    const s = sums(ofYear.filter((e) => e.contractId === contractId));
    const farmIn = ofYear.filter((e) => e.direction === 'in').reduce((a, e) => a + e.value, 0);
    const farmOut = ofYear.filter((e) => e.direction === 'out').reduce((a, e) => a + e.value, 0);
    return { year, ...s, shareOfOutPct: pct(s.outBani + Math.max(0, s.taxBani), farmOut), shareOfInPct: pct(s.inBani, farmIn) };
  });
}

/** The farm without one contract (and its schedule): the "what if" the salary line compares with. */
export function withoutContract(farm: PlanFarm, contractId: string): PlanFarm {
  return {
    ...farm,
    contracts: farm.contracts?.filter((c) => c.id !== contractId),
    contract_payments: farm.contract_payments?.filter((p) => p.contract_id !== contractId),
    lease_contracts: farm.lease_contracts?.filter((c) => c.id !== contractId),
  };
}

/** The farm's mean margin per ha over its crops with figures (the plan's economics); null when none have. */
function meanMarginPerHa(economics: readonly { areaAri: number; income: Bani; cost: Bani }[]): Bani | null {
  const area = economics.reduce((a, e) => a + e.areaAri, 0);
  return area > 0 ? Math.round((economics.reduce((a, e) => a + e.income - e.cost, 0) * 100) / area) : null;
}

/** Everything the card says about one contract (§5.2). Null when the farm has no such contract. */
export function contractImpact(farm: PlanFarm, data: AppData, contractId: string, opts: FarmPlanOptions): ContractImpact | null {
  const lease = farm.lease_contracts?.find((c) => c.id === contractId);
  const other = farm.contracts?.find((c) => c.id === contractId);
  if (!lease && !other) return null;

  const plan = buildFarmPlan(farm, data, opts);
  const without = buildFarmPlan(withoutContract(farm, contractId), data, opts);
  const t = plan.timelines.medium;
  const planEnd = lastDay(t.months[t.months.length - 1]!.key);
  const start = `${opts.month}-01`;

  const input = lease ? endInputOfLease(lease, data) : endInputOfContract(other!, farm.contract_payments ?? [], planEnd);
  const stop = runsUntil(input, planEnd);
  const through = stop && stop < planEnd ? stop : planEnd;
  const ahead = t.months.flatMap((m) => m.entries).filter((e) => e.contractId === contractId && e.date >= start && e.date <= through);

  const years = contractYears(t, contractId);
  let perHa: ContractImpact['perHa'] = null;
  if (lease && lease.direction === 'taken' && lease.area_ari > 0) {
    const marginBani = meanMarginPerHa(plan.economics);
    // A whole year of rent, tax included (it's the farm's money either way): the plan's first agricultural year
    // that pays. Rent in kind counts at the county price; without one, no number.
    const rents = rentPayments([lease], opts.month, t.months[t.months.length - 1]!.key, farm.county, data, data.params.forecast.entry_day.value).filter(
      (p) => !stop || p.date <= stop,
    );
    const first = rents[0] ? harvestYear(rents[0].date) : null;
    const ofYear = rents.filter((p) => harvestYear(p.date) === first);
    const gross = ofYear.every((p) => p.grossValueBani !== null) ? ofYear.reduce((a, p) => a + p.grossValueBani!, 0) : null;
    if (marginBani !== null && ofYear.length && gross !== null) {
      const costBani = Math.round((gross * 100) / lease.area_ari);
      perHa = { marginBani, costBani, leftBani: marginBani - costBani };
    }
  }

  return {
    contractId,
    years,
    untilEnd: { ...sums(ahead), through, pastPlan: !stop || stop > planEnd },
    salary: { withBani: plan.salary.salary, withoutBani: without.salary.salary },
    perHa,
  };
}
