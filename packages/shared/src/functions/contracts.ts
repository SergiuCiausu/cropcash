// The farm's contracts other than arendă, their parties, the decision about a contract's end, and what the farm is
// for taxes (docs/contracts-plan.md §2, §3.2, step 6; migrations 048, 049). The pages read them straight from the farm
// (`farm.parties`, `farm.contracts`, …). The assistant (step 9) reads them through the read tools at the end, and
// may propose „Am hotărât” and archiving a contract as cards. Adding or changing one stays on the Contracte screen:
// a contract has too many fields to check on a card, and its other side has to exist first.
import { z } from 'zod';
import { monthKey } from '../cashflow/dates';
import type { PlanFarm } from '../cashflow/farm-plan';
import { contractImpact } from '../contracts/impact';
import { contractViews, contractWindow, farmContractsOf, inForce, windowMoney } from '../contracts/farm';
import { taxMonths } from '../contracts/taxes';
import { PAPER_CONTRACT_KINDS as ANY_CONTRACT_KINDS } from '../contracts/paper';
import type { ContractView } from '../contracts/view';
import {
  AddFarmContractInputSchema,
  AddPartyInputSchema,
  ArchiveFarmContractInputSchema,
  DecideContractInputSchema,
  UpdateFarmContractInputSchema,
  UpdatePartyInputSchema,
  decisionsFor,
} from '../contracts/model';
import { SetTaxProfileInputSchema } from '../contracts/taxes';
import { ReadDocumentInputSchema } from '../documents/index';
import { defineRead, defineWrite, type ReadContext } from './define';

export const addParty = defineWrite({
  name: 'add_party',
  description: 'Adds the other side of a contract: a company (with its CUI, if known) or a person (a name, never a CNP).',
  input: AddPartyInputSchema,
  access: 'user',
  request: (body) => ({ method: 'POST', path: '/api/parties', body }),
});

export const updateParty = defineWrite({
  name: 'update_party',
  description: 'Changes the other side of a contract: name, CUI, village, phone, a note.',
  input: UpdatePartyInputSchema,
  access: 'user',
  request: ({ id, ...body }) => ({ method: 'PUT', path: `/api/parties/${id}`, body }),
});

export const archiveParty = defineWrite({
  name: 'archive_party',
  description: 'Moves the other side, and their contracts, to the past ones. Nothing is deleted.',
  input: ArchiveFarmContractInputSchema,
  access: 'user',
  request: ({ id }) => ({ method: 'POST', path: `/api/parties/${id}/archive`, body: {} }),
});

export const addContract = defineWrite({
  name: 'add_contract',
  description: 'Adds a contract other than arendă (a sale, a supply on credit, a service, a leasing, an insurance) with its money schedule.',
  input: AddFarmContractInputSchema,
  access: 'user',
  request: (body) => ({ method: 'POST', path: '/api/contracts', body }),
});

export const updateContract = defineWrite({
  name: 'update_contract',
  description: 'Changes a contract. Every field again, and the whole schedule: one left out is cleared.',
  input: UpdateFarmContractInputSchema,
  access: 'user',
  request: ({ id, ...body }) => ({ method: 'PUT', path: `/api/contracts/${id}`, body }),
});

export const archiveContract = defineWrite({
  name: 'archive_contract',
  description: 'Moves a contract other than arendă to the past ones, when it has ended. Nothing is deleted, and no money moves. id from list_contracts (source "contract").',
  input: ArchiveFarmContractInputSchema,
  request: ({ id }) => ({ method: 'POST', path: `/api/contracts/${id}/archive`, body: {} }),
});

export const decideContract = defineWrite({
  name: 'decide_contract',
  description:
    '„Am hotărât”: notes what the farmer decided about a contract’s or an arendă’s end: renew, end, renegotiate, buy_out or return (only one of the contract’s canDecide from list_contracts). id and source from list_contracts; decidedOn is today unless the farmer says another day. Null takes it back. Only notes it: no letter is sent and no money moves.',
  input: DecideContractInputSchema,
  request: ({ id, ...body }) => ({ method: 'POST', path: `/api/contracts/${id}/decide`, body }),
});

export const setTaxProfile = defineWrite({
  name: 'set_tax_profile',
  description: 'Saves what the farm is for taxes: its legal form, whether it pays VAT, and for an SRL the micro tax.',
  input: SetTaxProfileInputSchema,
  access: 'user',
  request: (body) => ({ method: 'PUT', path: '/api/farm/tax-profile', body }),
});

/** „Din poză” (step 8): reads a contract paper and returns what it says, for the farmer to confirm field by field. Saves nothing, keeps no file. */
export const readContractPaper = defineWrite({
  name: 'read_contract_paper',
  timeout: 'upload',
  description: 'Reads a photographed or scanned contract and returns its fields (sides, dates, renewal, payments) to confirm. It saves nothing, and the file is not kept.',
  input: ReadDocumentInputSchema,
  access: 'user',
  request: (body) => ({ method: 'POST', path: '/api/documents/read-contract', body }),
});


// ── For the assistant (step 9) ────────────────────────────────────────────────────

const Day = z.iso.date();
const window = (ctx: ReadContext) => contractWindow(ctx.today, ctx.data.params.forecast.plan_months.value);
const views = (ctx: ReadContext): ContractView[] => contractViews(farmContractsOf(ctx.farm as PlanFarm), ctx.data, window(ctx));

function row(v: ContractView, ctx: ReadContext) {
  const money = windowMoney(v);
  return {
    id: v.id,
    source: v.source,
    kind: v.kind,
    kindName: ctx.data.contractTypes.types[v.kind].name_ro,
    party: v.party,
    title: v.title,
    startsOn: v.startsOn,
    /** The running term's end; null: no end. */
    endsOn: v.end.endsOn,
    /** The last day to decide or act; null: nothing to decide now. */
    actBy: v.end.actBy,
    noticeKnown: v.end.noticeKnown,
    renewsItself: v.end.renewsItself,
    status: v.end.status,
    decision: v.end.decision,
    canDecide: decisionsFor(v.kind),
    areaAri: v.areaAri,
    cropId: v.cropId,
    /** Money with the other side in the plan's months, in bani; kg in kind. */
    inBani: money.inBani,
    outBani: money.outBani,
    kg: money.kg,
  };
}

export const listContracts = defineRead({
  name: 'list_contracts',
  description:
    'The farm’s contracts, arendă included: the other side, when each ends (endsOn), the last day to decide (actBy), whether it renews itself, what was decided, and the money with the other side in the plan’s months (from–to). endingBy keeps those whose term ends by that day ("ce expiră anul ăsta"). Ended ones only with includeEnded.',
  input: z.strictObject({
    kind: z.enum(ANY_CONTRACT_KINDS).optional(),
    endingBy: Day.optional(),
    includeEnded: z.boolean().optional(),
  }),
  run: ({ kind, endingBy, includeEnded }, ctx) => {
    const w = window(ctx);
    const contracts = views(ctx)
      .filter((v) => includeEnded || inForce(v))
      .filter((v) => !kind || v.kind === kind)
      .filter((v) => !endingBy || (v.end.endsOn !== null && v.end.endsOn <= endingBy))
      .map((v) => row(v, ctx))
      .sort((a, b) => (a.endsOn ?? '9999').localeCompare(b.endsOn ?? '9999'));
    return { from: w.from, to: w.to, contracts };
  },
});

export const getContractTaxes = defineRead({
  name: 'get_contract_taxes',
  description:
    'The taxes the farm’s contracts bring, by month: totals.toStateBani is what leaves the farm for the state (owed + withheld − VAT got back). Only taxes that come from contracts (arendă tax withheld, land tax on land let, VAT, micro tax), not the farm’s other taxes. month (YYYY-MM) keeps one month. amountBani null: not known yet, say so. profileKnown false: the farm hasn’t said its legal form and VAT yet, so some taxes have no amount.',
  input: z.strictObject({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
  run: ({ month }, ctx) => {
    const live = views(ctx).filter(inForce);
    const of = new Map(live.map((v) => [v.id, { party: v.party, kind: v.kind }]));
    const lines = live.flatMap((v) => v.taxes).filter((l) => l.effect !== 'other_side');
    const months = taxMonths(lines)
      .filter((m) => !month || m.month === month)
      .map((m) => ({
        month: m.month,
        totals: m.totals,
        lines: m.lines.map((l) => ({
          ...of.get(l.contractId),
          contractId: l.contractId,
          tax: l.tax,
          effect: l.effect,
          to: l.to,
          form: l.form,
          amountBani: l.amountBani,
          dueOn: l.dueOn,
          status: l.status,
          note: l.note ?? null,
        })),
      }));
    return { profileKnown: farmContractsOf(ctx.farm as PlanFarm).profile.legalForm !== null, months };
  },
  unverified: (out) => [...new Set(out.months.flatMap((m) => m.lines.filter((l) => l.status === 'DE-VERIFICAT').map((l) => `contract_tax:${l.tax}`)))],
});

export const getContractImpact = defineRead({
  name: 'get_contract_impact',
  description:
    'What one contract (arendă too) does to the farm’s money: per agricultural year (years: in, out, taxes, its share of the farm’s money), what is still to pay or get until it ends (untilEnd), the normal-year salary with and without it, and for arendă taken, what a hectare leaves after the rent (perHa). For "cât mă costă leasingul pe an". contractId from list_contracts. Null: no such contract.',
  input: z.strictObject({ contractId: z.uuid() }),
  run: ({ contractId }, ctx) => {
    const v = views(ctx).find((x) => x.id === contractId);
    if (!v) return null;
    const impact = contractImpact(ctx.farm as PlanFarm, ctx.data, contractId, { month: monthKey(ctx.today) });
    return impact ? { contract: row(v, ctx), ...impact } : null;
  },
});

export const getContractsAllFarms = defineRead({
  name: 'get_contracts_all_farms',
  description:
    'The contracts of every farm the farmer works on (owner, manager or accountant), each farm and the total: contracts in force, money in and out in the plan’s months, the arendă paid (rentOutBani in lei, and rentOutKg: produce by crop, which has no lei value here; say the kilograms), taxes to the state, hectares taken and given in arendă (ari), what is due. For "pe toate fermele…". Taxes are each farm’s own, never declared together. missing: farms that couldn’t be read now. A farm with arenda false (the farmer is its accountant) has no arendă in its numbers.',
  input: z.strictObject({}),
  runs: 'api',
  allFarms: true,
  run: (_input, ctx) => ctx.allFarms ?? null,
});

export const CONTRACT_READS = [listContracts, getContractTaxes, getContractImpact, getContractsAllFarms] as const;

export const CONTRACT_FUNCTIONS = [addParty, updateParty, archiveParty, addContract, updateContract, archiveContract, decideContract, setTaxProfile, readContractPaper, ...CONTRACT_READS] as const;
