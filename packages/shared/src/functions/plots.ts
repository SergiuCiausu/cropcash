// Parcel writes (docs/harta-plan.md, step 3). 'user' for now: the farmer's own taps on the map, not
// assistant tools. Reading the parcels is GET /api/plots, outside the registry, because a read
// function runs on the farm the phone already has, and parcels aren't part of it.
import { OperationInputSchema, SavePlotsInputSchema } from '../plots/model';
import { OperationPatchSchema, RemoveOperationInputSchema, UpdatePlotInputSchema } from '../plots/wire';
import { defineWrite } from './define';

export const savePlots = defineWrite({
  name: 'save_plots',
  description: 'Saves several parcels for one harvest year, such as the rows of a cerere de plată. Parcels with the same bloc and number are updated.',
  input: SavePlotsInputSchema,
  access: 'user',
  request: (body) => ({ method: 'PUT', path: '/api/plots', body }),
});

export const updatePlot = defineWrite({
  name: 'update_plot',
  description: 'Changes one parcel: its name, its outline on the map, or what grows on it in one harvest year.',
  input: UpdatePlotInputSchema,
  access: 'user',
  request: ({ id, ...body }) => ({ method: 'PUT', path: `/api/plots/${id}`, body }),
});

export const addOperation = defineWrite({
  name: 'add_operation',
  description: 'Notes a piece of work on a parcel, done or planned: ploughing, sowing, a treatment, fertilizing, the harvest.',
  input: OperationInputSchema,
  access: 'user',
  request: (body) => ({ method: 'POST', path: '/api/plots/operations', body }),
});

export const updateOperation = defineWrite({
  name: 'update_operation',
  description: 'Changes a noted piece of work on a parcel, for example marks a planned treatment as done.',
  input: OperationPatchSchema,
  access: 'user',
  request: ({ id, ...body }) => ({ method: 'PUT', path: `/api/plots/operations/${id}`, body }),
});

export const removeOperation = defineWrite({
  name: 'remove_operation',
  description: 'Removes a piece of work noted on a parcel by mistake.',
  input: RemoveOperationInputSchema,
  access: 'user',
  request: ({ id }) => ({ method: 'DELETE', path: `/api/plots/operations/${id}` }),
  repeatSafe: 'gone',
});

export const PLOT_FUNCTIONS = [savePlots, updatePlot, addOperation, updateOperation, removeOperation] as const;
