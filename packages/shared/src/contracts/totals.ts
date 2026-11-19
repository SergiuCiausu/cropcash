/* Contracts across all the farms a person runs (docs/contracts-plan.md §6). Each farm is summed with its own data
   (farm.ts, the same numbers as its Contracte header), then `sumFarms` adds them up. All lei, integer bani.
   Taxes are per legal person: the total is an overview, never a figure to file (C7). The same landowner on two
   farms counts twice (C5). */
import { addDaysToDate, type IsoDate, type MonthKey } from '../cashflow/dates';
import type { Ari, Bani } from '../money';
import { contractViews, contractWindow, dueDay, farmSummary, inForce, toDecide, windowMoney, type ContractData, type FarmContracts } from './farm';
import type { EndStatus } from './end';
import { taxMonths, type TaxTotals } from './taxes';
import type { AnyContractKind } from './types';

/** The roles that see a farm's contracts. A worker sees none (§6.1). */
export type ContractsRole = 'owner' | 'manager' | 'accountant';
export const CONTRACTS_ROLES: readonly ContractsRole[] = ['owner', 'manager', 'accountant'];

/** How far ahead „De hotărât” looks across farms. */
export const DUE_AHEAD_DAYS = 90;

export interface FarmMeta {
  farmId: string;
  name: string;
  role: ContractsRole;
}

/** One row of the merged „De hotărât”, tagged with its farm. */
export interface DueRow {
  farmId: string;
  farmName: string;
  contractId: string;
  source: 'arenda' | 'contract';
  kind: AnyContractKind;
  party: string;
  /** The day to act by, else the day it ends; null: neither is written. */
  day: IsoDate | null;
  status: EndStatus;
}

export interface TaxMonthRow {
  month: MonthKey | null;
  totals: TaxTotals;
}

export interface FarmContractsSummary extends FarmMeta {
  /** False when the arendă and the farm's tax answers weren't readable (an accountant: RLS). The numbers leave them out. */
  arenda: boolean;
  today: IsoDate;
  count: number;
  inBani: Bani;
  outBani: Bani;
  taxes: TaxTotals;
  takenAri: Ari;
  givenAri: Ari;
  /** Arendă the farm pays in the plan's months: the lei, and the produce by crop (never turned into lei here). */
  rentOutBani: Bani;
  rentOutKg: RentKg[];
  landowners: number;
  due: DueRow[];
  taxMonths: TaxMonthRow[];
}

export interface CrossFarmSummary {
  farms: FarmContractsSummary[];
  total: {
    count: number;
    inBani: Bani;
    outBani: Bani;
    taxes: TaxTotals;
    takenAri: Ari;
    givenAri: Ari;
    rentOutBani: Bani;
    rentOutKg: RentKg[];
    landowners: number;
    due: number;
  };
  /** Every farm's due rows, the closest day first. */
  due: DueRow[];
  /** By month (unknown day last), with each farm's part. */
  taxMonths: (TaxMonthRow & {
    farms: { farmId: string; farmName: string; totals: TaxTotals }[];
  })[];
}

export const NO_TAXES: TaxTotals = {
  toStateBani: 0,
  withheldBani: 0,
  deductibleBani: 0,
  costBani: 0,
  unknown: 0,
};

export function addTaxes(a: TaxTotals, b: TaxTotals): TaxTotals {
  return {
    toStateBani: a.toStateBani + b.toStateBani,
    withheldBani: a.withheldBani + b.withheldBani,
    deductibleBani: a.deductibleBani + b.deductibleBani,
    costBani: a.costBani + b.costBani,
    unknown: a.unknown + b.unknown,
  };
}

/**
 * One farm's part: the Contracte header (contracts in force, money in and out over the plan's months, taxes), the
 * land in arendă still running, and what's due in the next 90 days (or overdue, or uninsured).
 */
export function farmContractsSummary(meta: FarmMeta, fc: FarmContracts, data: ContractData, today: IsoDate, arenda = true): FarmContractsSummary {
  const months = data.params.forecast.plan_months.value;
  const views = contractViews(fc, data, contractWindow(today, months));
  const head = farmSummary(views, today);
  const running = new Set(views.filter((v) => v.source === 'arenda' && inForce(v)).map((v) => v.id));
  const ari = (dir: 'taken' | 'given') => fc.leases.filter((c) => c.direction === dir && running.has(c.id)).reduce((a, c) => a + c.area_ari, 0);

  const rentOut = views.filter((v) => v.source === 'arenda' && inForce(v));
  const horizon = addDaysToDate(today, DUE_AHEAD_DAYS);
  const flagged = new Set(toDecide(views, today).map((v) => v.id));
  const due = views
    .filter((v) => flagged.has(v.id) || (inForce(v) && !v.end.decision && v.end.actBy !== null && v.end.actBy >= today && v.end.actBy <= horizon))
    .map((v): DueRow => ({
      farmId: meta.farmId,
      farmName: meta.name,
      contractId: v.id,
      source: v.source,
      kind: v.kind,
      party: v.party,
      day: dueDay(v),
      status: v.end.status,
    }))
    .sort(byDay);

  const own = views.flatMap((v) => v.taxes).filter((l) => l.effect === 'owed' || l.effect === 'withheld' || l.effect === 'deductible');
  return {
    ...meta,
    arenda,
    today,
    count: head.count,
    inBani: head.inBani,
    outBani: head.outBani,
    taxes: head.taxes,
    takenAri: ari('taken'),
    givenAri: ari('given'),
    rentOutBani: rentOut.reduce((a, v) => a + windowMoney(v).outBani, 0),
    rentOutKg: addKg([], rentOut.flatMap((v) => v.flows.filter((f) => f.direction === 'out' && f.kg > 0 && f.cropId).map((f) => ({ cropId: f.cropId!, kg: f.kg })))),
    landowners: fc.landowners.filter((o) => !o.archived_at).length,
    due,
    taxMonths: taxMonths(own).map(({ month, totals }) => ({ month, totals })),
  };
}

const byDay = (a: DueRow, b: DueRow) => (a.day ?? '9999').localeCompare(b.day ?? '9999') || a.farmName.localeCompare(b.farmName);

/** Kilograms of one crop. */
export interface RentKg {
  cropId: string;
  kg: number;
}

/** Adds kilograms by crop, in the order the crops first come. */
function addKg(into: readonly RentKg[], more: readonly RentKg[]): RentKg[] {
  const out = into.map((r) => ({ ...r }));
  for (const m of more) {
    const row = out.find((r) => r.cropId === m.cropId);
    if (row) row.kg += m.kg;
    else out.push({ ...m });
  }
  return out;
}

/** The farms added up. Nothing is matched across farms: a landowner on two farms is two (C5). */
export function sumFarms(perFarm: readonly FarmContractsSummary[]): CrossFarmSummary {
  const total = {
    count: 0,
    inBani: 0,
    outBani: 0,
    taxes: NO_TAXES,
    takenAri: 0,
    givenAri: 0,
    rentOutBani: 0,
    rentOutKg: [] as RentKg[],
    landowners: 0,
    due: 0,
  };
  const months = new Map<MonthKey | null, CrossFarmSummary['taxMonths'][number]>();
  for (const f of perFarm) {
    total.count += f.count;
    total.inBani += f.inBani;
    total.outBani += f.outBani;
    total.taxes = addTaxes(total.taxes, f.taxes);
    total.takenAri += f.takenAri;
    total.givenAri += f.givenAri;
    total.rentOutBani += f.rentOutBani;
    total.rentOutKg = addKg(total.rentOutKg, f.rentOutKg);
    total.landowners += f.landowners;
    total.due += f.due.length;
    for (const m of f.taxMonths) {
      const row = months.get(m.month) ?? {
        month: m.month,
        totals: NO_TAXES,
        farms: [],
      };
      row.totals = addTaxes(row.totals, m.totals);
      row.farms.push({ farmId: f.farmId, farmName: f.name, totals: m.totals });
      months.set(m.month, row);
    }
  }
  return {
    farms: [...perFarm],
    total,
    due: perFarm.flatMap((f) => f.due).sort(byDay),
    taxMonths: [...months.values()].sort((a, b) => (a.month ?? '9999').localeCompare(b.month ?? '9999')),
  };
}

/** The farms the phone or the server couldn't read, by name (§6.3): „Fără Ferma Vida”. */
export function missingFarms(all: readonly Pick<FarmMeta, 'farmId' | 'name'>[], got: readonly Pick<FarmMeta, 'farmId'>[]): string[] {
  const have = new Set(got.map((f) => f.farmId));
  return all.filter((f) => !have.has(f.farmId)).map((f) => f.name);
}
