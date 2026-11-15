/* Parcel writes still waiting on the phone (docs/harta-plan.md, step 11): the work noted and the outlines
   drawn without internet. The parcels the page shows are the saved ones with these applied, so a
   treatment marked done offline is done on the card at once. Pure. */
import { OperationInputSchema, type StoredOperation, type StoredPlot, type StoredSeason } from './model';
import { OperationPatchSchema, operationToRow, plotToRow, UpdatePlotInputSchema, type FarmPlots } from './wire';

/** A write from the queue: its queue id, the function's name and its input. */
export interface PendingPlotWrite {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export const PENDING_PLOT_WRITES = ['add_operation', 'update_operation', 'update_plot'] as const;

/** The keys of a save_plots row that describe the parcel itself (not its id or season). */
const PLOT_ROW_KEYS = [
  'name',
  'county',
  'siruta',
  'village_siruta',
  'bloc_fizic',
  'parcel_no',
  'lpis_fbid',
  'land_use',
  'shape',
  'geometry',
  'geometry_source',
  'centroid_lat',
  'centroid_lng',
] as const;

const OPERATION_ROW_KEYS = ['kind', 'status', 'on_date', 'product', 'dose', 'note', 'transaction_id'] as const;

function pick<K extends string>(row: Record<string, unknown>, keys: readonly K[]): Partial<Record<K, unknown>> {
  return Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]])) as Partial<Record<K, unknown>>;
}

/**
 * The parcels as they will be once the queue is sent. A write that doesn't parse, or names a parcel or
 * a piece of work this copy doesn't have, changes nothing: the server will say what it thinks of it.
 * Work that still waits carries `pending: true`, so the card can say it isn't sent yet.
 */
export function withPendingPlotWrites(base: FarmPlots, writes: readonly PendingPlotWrite[], curveSegments: number): FarmPlots {
  let plots = base.plots;
  let seasons = base.seasons;
  let operations = base.operations;
  for (const w of writes) {
    if (w.name === 'add_operation') {
      const p = OperationInputSchema.safeParse(w.input);
      if (!p.success || !plots.some((x) => x.id === p.data.plotId)) continue;
      const o = p.data;
      const op: StoredOperation = {
        id: w.id,
        plot_id: o.plotId,
        harvest_year: o.harvestYear,
        kind: o.kind,
        status: o.status,
        on_date: o.onDate ?? null,
        product: o.product ?? null,
        dose: o.dose ?? null,
        note: o.note ?? null,
        transaction_id: o.transactionId ?? null,
        template_id: o.templateId ?? null,
        pending: true,
      };
      operations = [...operations, op];
    } else if (w.name === 'update_operation') {
      const p = OperationPatchSchema.safeParse(w.input);
      if (!p.success) continue;
      const { id, ...patch } = p.data;
      const row = pick(operationToRow(patch), OPERATION_ROW_KEYS);
      operations = operations.map((o) => (o.id === id ? ({ ...o, ...row, pending: true } as StoredOperation) : o));
    } else if (w.name === 'update_plot') {
      const p = UpdatePlotInputSchema.safeParse(w.input);
      if (!p.success || !plots.some((x) => x.id === p.data.id)) continue;
      const { id, harvestYear, plot } = p.data;
      const row = plotToRow(plot, curveSegments);
      const change = pick(row, PLOT_ROW_KEYS);
      plots = plots.map((x) => (x.id === id ? ({ ...x, ...change } as StoredPlot) : x));
      if (row.season !== undefined) {
        const others = seasons.filter((s) => !(s.plot_id === id && s.harvest_year === harvestYear));
        const s = row.season as Omit<StoredSeason, 'plot_id' | 'harvest_year'> | null;
        seasons = s ? [...others, { plot_id: id, harvest_year: harvestYear, ...s }] : others;
      }
    }
  }
  return { plots, seasons, operations };
}
