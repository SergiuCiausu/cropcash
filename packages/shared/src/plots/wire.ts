/* What the API sends to the database for parcels (migration 020): save_plots takes snake_case keys, and a
   key left out means "keep what's saved", so only keys present in the input are written. The shape a
   farmer drew becomes the polygon here, and the centroid is worked out from it, so the phone and the
   API agree. Pure: docs/harta-plan.md, step 3. */
import { z } from 'zod';
import { HarvestYearSchema } from '../farm/harvests';
import { centroid, flattenShape } from './geometry';
import { OPERATION_KINDS, PlotInputSchema, type OperationInput, type PlotInput, type StoredOperation, type StoredPlot, type StoredSeason } from './model';

/** What GET /api/plots answers. */
export interface FarmPlots {
  plots: StoredPlot[];
  /** Every year, so a parcel's history shows. */
  seasons: StoredSeason[];
  /** Only the year asked for, or every year without one. */
  operations: StoredOperation[];
}

const PLOT_KEYS = {
  name: 'name',
  county: 'county',
  siruta: 'siruta',
  villageSiruta: 'village_siruta',
  blocFizic: 'bloc_fizic',
  parcelNo: 'parcel_no',
  lpisFbid: 'lpis_fbid',
  landUse: 'land_use',
  shape: 'shape',
  geometrySource: 'geometry_source',
} as const satisfies Partial<Record<keyof PlotInput, string>>;

/** Rounded to about 1 cm, as numeric(9,6) keeps it. */
const coord = (n: number) => Math.round(n * 1e6) / 1e6;

/** One item of save_plots' `p_plots`. `curveSegments` is plots-params.json curve_segments. */
export function plotToRow(p: PlotInput, curveSegments: number): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.id) row.id = p.id;
  for (const [from, to] of Object.entries(PLOT_KEYS)) {
    const value = p[from as keyof typeof PLOT_KEYS];
    if (value !== undefined) row[to] = value;
  }
  /* A drawn shape is the source of truth; its polygon is derived, never sent apart from it. */
  const geometry = p.shape ? flattenShape(p.shape, curveSegments) : p.geometry;
  if (geometry !== undefined) {
    row.geometry = geometry;
    const [lng, lat] = geometry ? centroid(geometry) : [null, null];
    row.centroid_lng = lng === null ? null : coord(lng);
    row.centroid_lat = lat === null ? null : coord(lat);
    if (geometry === null && p.geometrySource === undefined) row.geometry_source = 'none';
  }
  if (!geometry && p.centre !== undefined) {
    row.centroid_lng = p.centre === null ? null : coord(p.centre[0]);
    row.centroid_lat = p.centre === null ? null : coord(p.centre[1]);
  }
  if (p.season !== undefined) {
    const s = p.season;
    row.season = s && {
      crop_id: s.cropId,
      apia_crop_code: s.apiaCropCode ?? null,
      area_ari: s.areaAri,
      sown_on: s.sownOn ?? null,
      harvested_on: s.harvestedOn ?? null,
      second_crop_id: s.secondCropId ?? null,
    };
  }
  return row;
}

/** One parcel changed on its own: its name, its outline, or the season of one year. */
export const UpdatePlotInputSchema = z.strictObject({
  id: z.uuid(),
  harvestYear: HarvestYearSchema,
  plot: PlotInputSchema.omit({ id: true }),
});
export type UpdatePlotInput = z.infer<typeof UpdatePlotInputSchema>;

/** Changes to a saved operation. `plotId` and the year don't move; to move one, remove it and add it again. */
export const OperationPatchSchema = z
  .strictObject({
    id: z.uuid(),
    kind: z.enum(OPERATION_KINDS).optional(),
    status: z.enum(['done', 'planned']).optional(),
    onDate: z.iso.date().nullable().optional(),
    product: z.string().trim().min(1).max(120).nullable().optional(),
    dose: z.string().trim().min(1).max(60).nullable().optional(),
    note: z.string().trim().min(1).max(200).nullable().optional(),
    target: z.string().trim().min(1).max(120).nullable().optional(),
    operator: z.string().trim().min(1).max(80).nullable().optional(),
    transactionId: z.uuid().nullable().optional(),
  })
  .refine((o) => o.status !== 'done' || o.onDate !== null, { message: 'done needs a date', path: ['onDate'] });
export type OperationPatch = z.infer<typeof OperationPatchSchema>;

export const RemoveOperationInputSchema = z.strictObject({ id: z.uuid() });

const OPERATION_KEYS = {
  kind: 'kind',
  status: 'status',
  onDate: 'on_date',
  product: 'product',
  dose: 'dose',
  note: 'note',
  target: 'target',
  operator: 'operator',
  transactionId: 'transaction_id',
} as const;

/** A row for plot_operations, with only the keys given. */
export function operationToRow(o: OperationInput | Omit<OperationPatch, 'id'>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('plotId' in o) {
    row.plot_id = o.plotId;
    row.harvest_year = o.harvestYear;
    if (o.templateId !== undefined) row.template_id = o.templateId;
    if (o.clientId !== undefined) row.client_id = o.clientId;
  }
  for (const [from, to] of Object.entries(OPERATION_KEYS)) {
    const value = o[from as keyof typeof OPERATION_KEYS];
    if (value !== undefined) row[to] = value;
  }
  return row;
}

