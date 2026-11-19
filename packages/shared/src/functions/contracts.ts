// The farm's contracts other than arendă, their parties, the decision about a contract's end, and what the farm is
// for taxes (docs/contracts-plan.md §2, §3.2, step 6; migrations 048, 049). 'user' for now: the farmer's own taps on
// "Contracte"; the assistant's tools are step 8. Reading needs no function: they come with the farm
// (`farm.parties`, `farm.contracts`, `farm.contract_payments`, `farm.legal_form`, …).
import {
  AddFarmContractInputSchema,
  AddPartyInputSchema,
  ArchiveFarmContractInputSchema,
  DecideContractInputSchema,
  UpdateFarmContractInputSchema,
  UpdatePartyInputSchema,
} from '../contracts/model';
import { SetTaxProfileInputSchema } from '../contracts/taxes';
import { defineWrite } from './define';

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
  description: 'Moves a contract to the past ones (ended). Nothing is deleted.',
  input: ArchiveFarmContractInputSchema,
  access: 'user',
  request: ({ id }) => ({ method: 'POST', path: `/api/contracts/${id}/archive`, body: {} }),
});

export const decideContract = defineWrite({
  name: 'decide_contract',
  description: '„Am hotărât”: what the farmer decided about a contract’s or an arendă’s end (renew, end, renegotiate, buy out, give back). Null takes it back. Only notes it: no money moves.',
  input: DecideContractInputSchema,
  access: 'user',
  request: ({ id, ...body }) => ({ method: 'POST', path: `/api/contracts/${id}/decide`, body }),
});

export const setTaxProfile = defineWrite({
  name: 'set_tax_profile',
  description: 'Saves what the farm is for taxes: its legal form, whether it pays VAT, and for an SRL the micro tax.',
  input: SetTaxProfileInputSchema,
  access: 'user',
  request: (body) => ({ method: 'PUT', path: '/api/farm/tax-profile', body }),
});

export const CONTRACT_FUNCTIONS = [addParty, updateParty, archiveParty, addContract, updateContract, archiveContract, decideContract, setTaxProfile] as const;
