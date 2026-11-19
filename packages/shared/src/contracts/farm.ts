/* One farm's contracts as a whole (docs/contracts-plan.md §5.3): both tables turned into views, what's due, and the
   header numbers. Pure, so the Contracte screen (on the phone, offline) and the cross-farm summary on the server
   (totals.ts) compute the same thing. Moved here from web/lib/cc/contracts.ts for step 7. */
import { addMonths, lastDay, monthKey, type IsoDate } from '../cashflow/dates';
import type { AppData } from '../data';
import type { StoredFarm } from '../farm';
import type { StoredContract, StoredLandowner } from '../arenda/contracts';
import type { StoredContractPayment, StoredFarmContract, StoredParty } from './model';
import { taxProfileOf, taxTotals, type TaxProfile, type TaxProfileRow } from './taxes';
import { fromContract, fromLease, type ContractView, type ViewWindow } from './view';

/** A farm's contracts as the pages read them: both tables, the parties, and what the farm is for taxes. */
export interface FarmContracts {
  parties: StoredParty[];
  contracts: StoredFarmContract[];
  payments: StoredContractPayment[];
  landowners: StoredLandowner[];
  leases: StoredContract[];
  profileRow: TaxProfileRow;
  profile: TaxProfile;
  county: string | null;
}

export const NO_CONTRACTS: FarmContracts = {
  parties: [],
  contracts: [],
  payments: [],
  landowners: [],
  leases: [],
  profileRow: {},
  profile: taxProfileOf({}),
  county: null,
};

/** A stored farm's contracts, as the pages and the assistant read them (the farm row holds every table). */
export function farmContractsOf(
  farm: Pick<StoredFarm, 'parties' | 'contracts' | 'contract_payments' | 'landowners' | 'lease_contracts' | 'legal_form' | 'vat_status' | 'micro_tax'> & { county?: string | null },
): FarmContracts {
  const profileRow = { legal_form: farm.legal_form ?? null, vat_status: farm.vat_status ?? null, micro_tax: farm.micro_tax ?? null };
  return {
    parties: farm.parties ?? [],
    contracts: farm.contracts ?? [],
    payments: farm.contract_payments ?? [],
    landowners: farm.landowners ?? [],
    leases: farm.lease_contracts ?? [],
    profileRow,
    profile: taxProfileOf(profileRow),
    county: farm.county ?? null,
  };
}

/** The plan's months from today's: the stretch the money and the taxes cover. */
export function contractWindow(today: IsoDate, months: number): ViewWindow {
  const first = monthKey(today);
  return {
    today,
    from: `${first}-01`,
    to: lastDay(addMonths(first, months - 1)),
  };
}

export type ContractData = Pick<AppData, 'crops' | 'catalogue' | 'arenda' | 'params' | 'contractTypes' | 'contractTaxes'>;

/** Every contract, arendă first in its own table's order, archived ones too (their status is 'ended'). */
export function contractViews(fc: FarmContracts, data: ContractData, w: ViewWindow): ContractView[] {
  const landowner = (id: string) => fc.landowners.find((o) => o.id === id)?.name ?? '';
  const party = (id: string) =>
    fc.parties.find((p) => p.id === id) ?? {
      name: '',
      kind: 'company' as const,
      cui: null,
    };
  return [
    ...fc.leases.map((c) => fromLease(c, landowner(c.landowner_id), fc.county, data, w, undefined, fc.profile)),
    ...fc.contracts.map((c) => fromContract(c, fc.payments, party(c.party_id), data, w, fc.profile)),
  ];
}

export const inForce = (v: ContractView) => v.end.status !== 'ended';

/** An insurance that ended in the last 60 days with nothing decided: the crop isn't insured any more. */
export function uninsured(v: ContractView, today: IsoDate): boolean {
  if (v.kind !== 'insurance' || v.end.status !== 'ended' || v.end.decision || !v.end.endsOn) return false;
  const days = (Date.parse(today) - Date.parse(v.end.endsOn)) / 86_400_000;
  return days > 0 && days <= 60;
}

/** The day a contract is due: when to act, else when it ends. */
export const dueDay = (v: ContractView): IsoDate | null => v.end.actBy ?? v.end.endsOn ?? null;

/** „De hotărât”: what's due soon or overdue, then the uninsured, the closest day first. */
export function toDecide(views: readonly ContractView[], today: IsoDate): ContractView[] {
  const due = views.filter((v) => v.end.status === 'decide_soon' || v.end.status === 'overdue' || uninsured(v, today));
  const day = (v: ContractView) => dueDay(v) ?? '9999';
  return due.sort((a, b) => day(a).localeCompare(day(b)));
}

/** Money with the other side in the window. */
export function windowMoney(v: Pick<ContractView, 'flows'>): {
  inBani: number;
  outBani: number;
  kg: number;
} {
  let inBani = 0;
  let outBani = 0;
  let kg = 0;
  for (const f of v.flows) {
    if (f.direction === 'in') inBani += f.amountBani ?? 0;
    else outBani += f.amountBani ?? 0;
    kg += f.kg;
  }
  return { inBani, outBani, kg };
}

/** The header (§5.3): contracts in force, money in and out in the window, taxes, the next decision. */
export function farmSummary(views: readonly ContractView[], today: IsoDate) {
  const live = views.filter(inForce);
  const money = live.map(windowMoney);
  return {
    count: live.length,
    inBani: money.reduce((a, m) => a + m.inBani, 0),
    outBani: money.reduce((a, m) => a + m.outBani, 0),
    taxes: taxTotals(live.flatMap((v) => v.taxes)),
    next: toDecide(views, today)[0] ?? null,
  };
}
