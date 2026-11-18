/* Test rows shared by the plots tests. Not exported from the package. */
import type { StoredOperation, StoredPlot, StoredSeason } from './model';

export const plot = (id: string, over: Partial<StoredPlot> = {}): StoredPlot => ({
  id,
  name: null,
  county: 'TR',
  siruta: 153277,
  village_siruta: null,
  bloc_fizic: id,
  parcel_no: '1a',
  lpis_fbid: null,
  land_use: 'TA',
  geometry: null,
  shape: null,
  centroid_lat: null,
  centroid_lng: null,
  geometry_source: 'lpis',
  auto_crop_id: null,
  archived_at: null,
  ...over,
});

export const season = (plotId: string, cropId: string | null, ari: number, over: Partial<StoredSeason> = {}): StoredSeason => ({
  plot_id: plotId,
  harvest_year: 2027,
  crop_id: cropId,
  apia_crop_code: null,
  area_ari: ari,
  sown_on: null,
  harvested_on: null,
  second_crop_id: null,
  ...over,
});

export const op = (id: string, plotId: string, over: Partial<StoredOperation> = {}): StoredOperation => ({
  id,
  plot_id: plotId,
  harvest_year: 2027,
  kind: 'herbicide',
  status: 'done',
  on_date: '2027-03-10',
  product: null,
  dose: null,
  transaction_id: null,
  template_id: null,
  ...over,
});

export const expense = (bani: number, over: { crop_id?: string | null; plot_id?: string | null; category?: string; occurred_at?: string } = {}) => ({
  kind: 'expense' as const,
  category: over.category ?? 'treatments',
  crop_id: over.crop_id ?? null,
  plot_id: over.plot_id ?? null,
  amount_bani: -bani,
  occurred_at: over.occurred_at ?? '2027-03-10T12:00:00Z',
  harvest_year: null,
});

export const sale = (bani: number, over: { crop_id?: string | null; plot_id?: string | null } = {}) => ({
  kind: 'sale' as const,
  category: null,
  crop_id: over.crop_id ?? null,
  plot_id: over.plot_id ?? null,
  amount_bani: bani,
  occurred_at: '2027-07-20T12:00:00Z',
  harvest_year: null,
});
