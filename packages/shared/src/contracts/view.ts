/* One view over both tables (docs/contracts-plan.md §2.3): an arendă from `lease_contracts` and any other contract
   from `contracts` look the same to the Contracte screen, the plan and the totals. The arendă keeps its own rules:
   its rent and withholding come from arenda/schedule.ts, its end from art. 1848. Taxes: taxes.ts. */
import { monthKey, type IsoDate } from '../cashflow/dates';
import type { AppData } from '../data';
import type { Ari } from '../money';
import type { StoredContract } from '../arenda/contracts';
import { rentPayments } from '../arenda/schedule';
import { endPlan, runsUntil, type EndInput, type EndPlan } from './end';
import type { ContractDecision, StoredContractPayment, StoredFarmContract, StoredParty } from './model';
import { farmContractFlows, paymentDates, type ContractFlow } from './schedule';
import { contractTaxes, leaseTaxes, UNKNOWN_TAX_PROFILE, type TaxLine, type TaxProfile } from './taxes';
import type { AnyContractKind } from './types';

export interface ContractView {
  id: string;
  source: 'arenda' | 'contract';
  kind: AnyContractKind;
  partyId: string;
  /** The landowner's or the other side's name. */
  party: string;
  title: string | null;
  startsOn: IsoDate;
  /** The first term's end, as written on the paper; `end.endsOn` is the running term's. */
  endsOn: IsoDate | null;
  end: EndPlan;
  /** Money and kind with the other side inside the window, by date. */
  flows: ContractFlow[];
  /** The taxes to the state the flows bring, by due day. */
  taxes: TaxLine[];
  plotIds: string[];
  areaAri: Ari | null;
  cropId: string | null;
}

/** Today, and the stretch of days the flows cover (both ends included). */
export interface ViewWindow {
  today: IsoDate;
  from: IsoDate;
  to: IsoDate;
}

type ViewData = Pick<AppData, 'crops' | 'catalogue' | 'arenda' | 'params' | 'contractTypes' | 'contractTaxes'>;

const archiveDay = (archivedAt: string | null): IsoDate | null => (archivedAt ? archivedAt.slice(0, 10) : null);

/** The days that act as deadlines for a contract whose deadlines are its payments (sale, supply, credit). */
function dueDatesOf(c: StoredFarmContract, payments: readonly StoredContractPayment[], horizon: IsoDate): IsoDate[] {
  return payments.filter((p) => p.contract_id === c.id).flatMap((p) => paymentDates(p, c.ends_on, c.signed_on ?? c.starts_on, horizon));
}

export function endInputOfContract(c: StoredFarmContract, payments: readonly StoredContractPayment[], horizon: IsoDate): EndInput {
  return {
    kind: c.kind,
    startsOn: c.starts_on,
    endsOn: c.ends_on,
    autoRenews: c.auto_renews,
    noticeDays: c.notice_days,
    renewMonths: c.renew_months,
    decision: c.decision,
    decidedOn: c.decided_on,
    archivedOn: archiveDay(c.archived_at),
    dueDates: dueDatesOf(c, payments, horizon),
  };
}

/** Whether the other side is registered for VAT: a company's CUI with RO; a person never; unknown without a CUI. */
export function vatPayerOf(party: Pick<StoredParty, 'kind' | 'cui'>): boolean | null {
  if (party.kind === 'person') return false;
  return party.cui ? party.cui.startsWith('RO') : null;
}

/** A contract from the `contracts` table. */
export function fromContract(
  c: StoredFarmContract,
  payments: readonly StoredContractPayment[],
  party: Pick<StoredParty, 'name' | 'kind' | 'cui'>,
  data: Pick<ViewData, 'contractTypes' | 'contractTaxes' | 'arenda' | 'catalogue'>,
  w: ViewWindow,
  profile: TaxProfile = UNKNOWN_TAX_PROFILE,
): ContractView {
  const horizon = w.to > w.today ? w.to : w.today;
  const input = endInputOfContract(c, payments, horizon);
  const flows = farmContractFlows(c, payments, runsUntil(input, w.to), w.from, w.to);
  return {
    id: c.id,
    source: 'contract',
    kind: c.kind,
    partyId: c.party_id,
    party: party.name,
    title: c.title,
    startsOn: c.starts_on,
    endsOn: c.ends_on,
    end: endPlan(input, data.contractTypes, w.today),
    flows,
    taxes: contractTaxes({ id: c.id, kind: c.kind, flows, vatBp: c.vat_bp, cropId: c.crop_id, otherSideVatPayer: vatPayerOf(party) }, profile, data),
    plotIds: c.plot_ids,
    areaAri: c.area_ari,
    cropId: c.crop_id,
  };
}

/** What the farmer decided about an arendă; left out, the row's `decision` / `decided_on` (migration 048). */
export interface LeaseDecision {
  decision: ContractDecision | null;
  decidedOn: IsoDate | null;
}

export function endInputOfLease(c: StoredContract, data: Pick<ViewData, 'contractTypes'>, decided?: LeaseDecision): EndInput {
  return {
    kind: 'arenda',
    startsOn: c.starts_on,
    endsOn: c.ends_on,
    // Codul civil art. 1848: it renews unless refused in writing.
    autoRenews: !!c.ends_on && (data.contractTypes.types.arenda.auto_renews?.value ?? true),
    noticeDays: null,
    renewMonths: null,
    decision: decided ? decided.decision : (c.decision ?? null),
    decidedOn: decided ? decided.decidedOn : (c.decided_on ?? null),
    archivedOn: archiveDay(c.archived_at),
    dueDates: [],
  };
}

/**
 * An arendă. The flows are what the landowner gets after the tax withheld (taken: out; given: in), on the plan's
 * pay day, exactly as the plan's `rent` / `rent_in` entries; they stop when the arendă stops (refused or ended).
 */
export function fromLease(
  c: StoredContract,
  landownerName: string,
  county: string | null | undefined,
  data: ViewData,
  w: ViewWindow,
  decided?: LeaseDecision,
  profile: TaxProfile = UNKNOWN_TAX_PROFILE,
): ContractView {
  const input = endInputOfLease(c, data, decided);
  const stopOn = runsUntil(input, w.to);
  const rents = rentPayments([c], monthKey(w.from), monthKey(w.to), county, data, data.params.forecast.entry_day.value).filter(
    (p) => p.date >= w.from && p.date <= w.to && (!stopOn || p.date <= stopOn),
  );
  const flows: ContractFlow[] = rents.map((p) => ({
      contractId: c.id,
      source: 'arenda',
      paymentId: null,
      date: p.date,
      direction: p.direction === 'taken' ? 'out' : 'in',
      amountBani: p.paidBani,
      kg: p.paidKg,
      cropId: p.cropId,
      label: null,
    }));
  return {
    id: c.id,
    source: 'arenda',
    kind: 'arenda',
    partyId: c.landowner_id,
    party: landownerName,
    title: null,
    startsOn: c.starts_on,
    endsOn: c.ends_on,
    end: endPlan(input, data.contractTypes, w.today),
    flows,
    taxes: leaseTaxes(c.id, rents, profile, data),
    plotIds: c.plot_ids,
    areaAri: c.area_ari,
    cropId: c.rent_crop_id,
  };
}
