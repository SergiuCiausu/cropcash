// Landowners, arendă contracts and a parcel's tenure (docs/employees-arenda-plan.md §3, migration 033). 'user' for
// now: the farmer's own taps on "Arendă", not assistant tools. Reading them needs no function: they come with the
// farm (`farm.landowners`, `farm.lease_contracts`).
import {
  AddContractInputSchema,
  AddLandownerInputSchema,
  ArchiveArendaInputSchema,
  SetLandownerCountInputSchema,
  SetPlotTenureInputSchema,
  UpdateContractInputSchema,
  UpdateLandownerInputSchema,
} from '../arenda/contracts';
import { defineWrite } from './define';

export const addLandowner = defineWrite({
  name: 'add_landowner',
  description: 'Adds a landowner: someone whose land the farm works, or to whom it lets its own land. No CNP.',
  input: AddLandownerInputSchema,
  access: 'user',
  request: (body) => ({ method: 'POST', path: '/api/landowners', body }),
});

export const updateLandowner = defineWrite({
  name: 'update_landowner',
  description: 'Changes a landowner: name, village, phone, how they want the rent, a note.',
  input: UpdateLandownerInputSchema,
  access: 'user',
  request: ({ id, ...body }) => ({ method: 'PUT', path: `/api/landowners/${id}`, body }),
});

export const archiveLandowner = defineWrite({
  name: 'archive_landowner',
  description: 'Moves a landowner, and their contracts, to the past ones. Nothing is deleted.',
  input: ArchiveArendaInputSchema,
  access: 'user',
  request: ({ id }) => ({ method: 'POST', path: `/api/landowners/${id}/archive`, body: {} }),
});

export const addLeaseContract = defineWrite({
  name: 'add_lease_contract',
  description: 'Adds an arendă contract with a landowner: hectares, dates, rent in lei and/or kg per ha, the registration.',
  input: AddContractInputSchema,
  access: 'user',
  request: (body) => ({ method: 'POST', path: '/api/lease-contracts', body }),
});

export const updateLeaseContract = defineWrite({
  name: 'update_lease_contract',
  description: 'Changes an arendă contract. Every field again, so one left out is cleared.',
  input: UpdateContractInputSchema,
  access: 'user',
  request: ({ id, ...body }) => ({ method: 'PUT', path: `/api/lease-contracts/${id}`, body }),
});

export const archiveLeaseContract = defineWrite({
  name: 'archive_lease_contract',
  description: 'Moves an arendă contract to the past ones (ended or refused). Nothing is deleted.',
  input: ArchiveArendaInputSchema,
  access: 'user',
  request: ({ id }) => ({ method: 'POST', path: `/api/lease-contracts/${id}/archive`, body: {} }),
});

export const setPlotTenure = defineWrite({
  name: 'set_plot_tenure',
  description: "Saves whose land a parcel is: the farm's own, taken in arendă, or let to someone else.",
  input: SetPlotTenureInputSchema,
  access: 'user',
  request: ({ plotId, tenure }) => ({ method: 'PUT', path: `/api/plots/${plotId}/tenure`, body: { tenure } }),
});

export const setLandownerCount = defineWrite({
  name: 'set_landowner_count',
  description: 'Saves how many landowners the farm has, so the list can say how many are still to add.',
  input: SetLandownerCountInputSchema,
  access: 'user',
  request: (body) => ({ method: 'PUT', path: '/api/farm/landowner-count', body }),
});

export const ARENDA_FUNCTIONS = [
  addLandowner,
  updateLandowner,
  archiveLandowner,
  addLeaseContract,
  updateLeaseContract,
  archiveLeaseContract,
  setPlotTenure,
  setLandownerCount,
] as const;
