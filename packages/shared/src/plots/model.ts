/* Pieces of land ("parcele"), what grows on them each year, and the work done on them.
   Shapes match supabase/migrations/020_plots.sql. See docs/harta-plan.md. */
import { z } from 'zod';
import { HarvestYearSchema } from '../farm/harvests';

/** [lng, lat] in WGS84 (ETRS89 from APIA is the same at map scale). */
export const PositionSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type Position = z.infer<typeof PositionSchema>;

const Ring = z.array(PositionSchema).min(4);
export const PolygonSchema = z.strictObject({ type: z.literal('Polygon'), coordinates: z.array(Ring).min(1) });
export const MultiPolygonSchema = z.strictObject({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(Ring).min(1)).min(1),
});
export const PlotGeometrySchema = z.discriminatedUnion('type', [PolygonSchema, MultiPolygonSchema]);
export type Polygon = z.infer<typeof PolygonSchema>;
export type PlotGeometry = z.infer<typeof PlotGeometrySchema>;

/**
 * What the farmer drew, kept so it can be edited again. Edge i runs from vertex i to vertex i + 1
 * (the last one closes the shape). A curve has one control point (quadratic) or two (cubic).
 * A vertex with `cornerM` is rounded off, about that many metres back along each edge.
 */
export const ShapeEdgeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('line') }),
  z.strictObject({ type: z.literal('quad'), c: PositionSchema }),
  z.strictObject({ type: z.literal('cubic'), c1: PositionSchema, c2: PositionSchema }),
]);
export const ShapeSchema = z
  .strictObject({
    vertices: z.array(z.strictObject({ at: PositionSchema, cornerM: z.number().positive().max(1000).optional() })).min(3).max(500),
    edges: z.array(ShapeEdgeSchema),
  })
  .refine((s) => s.edges.length === s.vertices.length, { message: 'one edge per vertex', path: ['edges'] });
export type ShapeEdge = z.infer<typeof ShapeEdgeSchema>;
export type Shape = z.infer<typeof ShapeSchema>;

/** Where the shape on the map came from. `none` = not on the map yet. */
export const GEOMETRY_SOURCES = ['lpis', 'drawn', 'coords', 'approx', 'none'] as const;
export type GeometrySource = (typeof GEOMETRY_SOURCES)[number];

export const OPERATION_KINDS = [
  'soil_work',
  'sowing',
  'fertilizing',
  'herbicide',
  'fungicide',
  'insecticide',
  'irrigation',
  'harvest',
  'other',
] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];
/** Plant protection: what "tratamente" means to the farmer. */
export const TREATMENT_KINDS: readonly OperationKind[] = ['herbicide', 'fungicide', 'insecticide'];

/** A plots row. */
/** Whose the land is (migration 030): the farm's own, taken in arendă, or the farm's own let to someone else (D5). */
export const PLOT_TENURES = ['own', 'leased_in', 'leased_out'] as const;
export type PlotTenure = (typeof PLOT_TENURES)[number];

export interface StoredPlot {
  id: string;
  name: string | null;
  county: string;
  siruta: number | null;
  village_siruta?: number | null;
  bloc_fizic: string | null;
  parcel_no: string | null;
  lpis_fbid: string | null;
  land_use: string | null;
  geometry: PlotGeometry | null;
  shape?: Shape | null;
  centroid_lat: number | null;
  centroid_lng: number | null;
  geometry_source: GeometrySource;
  /** Set on the parcel that holds a crop's hectares not yet on the map. One per crop. */
  auto_crop_id: string | null;
  archived_at: string | null;
  /** Migration 032: whose land it is. Set per parcel on the Arendă screen. */
  tenure?: PlotTenure;
}

/** A plot_seasons row: one plot in one harvest year (= the APIA campaign year). */
export interface StoredSeason {
  plot_id: string;
  harvest_year: number;
  crop_id: string | null;
  apia_crop_code: number | null;
  area_ari: number;
  sown_on: string | null;
  harvested_on: string | null;
  second_crop_id: string | null;
}

/** A plot_operations row. */
export interface StoredOperation {
  id: string;
  plot_id: string;
  harvest_year: number;
  kind: OperationKind;
  status: 'done' | 'planned';
  on_date: string | null;
  product: string | null;
  dose: string | null;
  note?: string | null;
  transaction_id: string | null;
  template_id: string | null;
  /** Only on the phone: noted or changed without internet, still in the queue (step 11). */
  pending?: boolean;
}

const Text = (max: number) => z.string().trim().min(1).max(max);
const Day = z.iso.date();

export const SeasonInputSchema = z
  .strictObject({
    cropId: Text(40).nullable(),
    apiaCropCode: z.number().int().positive().nullable().optional(),
    areaAri: z.number().int().positive().max(100_000),
    sownOn: Day.nullable().optional(),
    harvestedOn: Day.nullable().optional(),
    secondCropId: Text(40).nullable().optional(),
  })
  .refine((s) => !s.sownOn || !s.harvestedOn || s.harvestedOn >= s.sownOn, {
    message: 'harvested before sown',
    path: ['harvestedOn'],
  });
export type SeasonInput = z.infer<typeof SeasonInputSchema>;

/**
 * One parcel sent to save_plots. Without `id`, a parcel with the same SIRUTA, bloc and number is
 * reused, otherwise a new one is made. `season: null` means nothing grows on it that year.
 */
export const PlotInputSchema = z.strictObject({
  id: z.uuid().optional(),
  name: Text(80).nullable().optional(),
  county: Text(40).optional(),
  siruta: z.number().int().positive().nullable().optional(),
  villageSiruta: z.number().int().positive().nullable().optional(),
  blocFizic: Text(20).nullable().optional(),
  parcelNo: Text(10).nullable().optional(),
  lpisFbid: z.string().regex(/^\d+-[0-9A-Za-z/]+$/).nullable().optional(),
  landUse: Text(10).nullable().optional(),
  geometry: PlotGeometrySchema.nullable().optional(),
  shape: ShapeSchema.nullable().optional(),
  geometrySource: z.enum(GEOMETRY_SOURCES).optional(),
  /** The rough middle when there is no outline (geometrySource approx), drawn dashed. Ignored beside an outline. */
  centre: PositionSchema.nullable().optional(),
  season: SeasonInputSchema.nullable().optional(),
});
export type PlotInput = z.infer<typeof PlotInputSchema>;

export const SavePlotsInputSchema = z.strictObject({
  harvestYear: HarvestYearSchema,
  plots: z.array(PlotInputSchema).min(1).max(500),
});
export type SavePlotsInput = z.infer<typeof SavePlotsInputSchema>;

export const OperationInputSchema = z
  .strictObject({
    plotId: z.uuid(),
    harvestYear: HarvestYearSchema,
    kind: z.enum(OPERATION_KINDS),
    status: z.enum(['done', 'planned']),
    onDate: Day.nullable().optional(),
    product: Text(120).nullable().optional(),
    dose: Text(60).nullable().optional(),
    note: Text(200).nullable().optional(),
    transactionId: z.uuid().nullable().optional(),
    templateId: Text(60).nullable().optional(),
    clientId: z.uuid().optional(),
  })
  .refine((o) => o.status === 'planned' || !!o.onDate, { message: 'done needs a date', path: ['onDate'] });
export type OperationInput = z.infer<typeof OperationInputSchema>;

/** A typical piece of work for a crop, from docs/data (only with a cited source). Months are calendar months. */
export interface OperationTemplate {
  id: string;
  crop_id: string;
  kind: OperationKind;
  from_month: number;
  to_month: number;
}

/** Tunable limits for parcels, from docs/data/plots-params.json. */
export const PlotsParamsSchema = z.object({
  match_overlap_min: z.object({ value: z.number().gt(0).lte(1) }),
  area_warning_pct: z.object({ value: z.number().positive().max(100) }),
  todo_soon_days: z.object({ value: z.number().int().positive().max(365) }),
  curve_segments: z.object({ value: z.number().int().min(2).max(64) }),
});
export type PlotsParams = z.infer<typeof PlotsParamsSchema>;
