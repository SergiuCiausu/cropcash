/*
 * What didn't make it to harvest (docs/crop-loss-plan.md). The farmer says, per crop and harvest
 * year, how many of the sown hectares weren't harvested. A year where they didn't say is left out;
 * 0 is an answer and counts. Over several harvests the share is weighted by area, so a small trial
 * field doesn't weigh as much as the main one.
 */
import type { PlanParamsFile } from '../data';
import { harvestYear, type CropLoss, type HarvestsInput, type LOSS_REASONS } from './harvests';

type Params = PlanParamsFile['crop_loss'];
type Harvests = Pick<HarvestsInput, 'years'> & Partial<Pick<HarvestsInput, 'expected'>>;

export interface LossRow {
  year: number;
  sownHa: number;
  lostHa: number;
  reason?: (typeof LOSS_REASONS)[number];
}

export interface LossShareFromHistory {
  /** 0–1: lost hectares over sown hectares. */
  share: number;
  /** First and last harvest year counted. */
  from: number;
  to: number;
  harvests: number;
}

export type LossShare =
  | { share: number; basis: 'this_year'; year: number }
  | { share: number; basis: 'farmer' }
  | ({ basis: 'history' } & LossShareFromHistory)
  | { share: 0; basis: 'none' };

/** The crop in one harvest year, when the farmer said what was lost. */
function answered(year: HarvestsInput['years'][number], cropId: string): { areaHa: number; lost: CropLoss } | null {
  const parcel = year.parcels.find((p) => p.cropId === cropId);
  return parcel?.lost ? { areaHa: parcel.areaHa, lost: parcel.lost } : null;
}

/** One crop's harvests where the farmer said what was lost, oldest first. */
export function lossHistory(years: HarvestsInput['years'], cropId: string): LossRow[] {
  return years
    .flatMap((y) => {
      const a = answered(y, cropId);
      if (!a) return [];
      return [{ year: y.year, sownHa: a.areaHa, lostHa: a.lost.ha, ...(a.lost.reason ? { reason: a.lost.reason } : {}) }];
    })
    .sort((a, b) => a.year - b.year);
}

/**
 * Σ lost ÷ Σ sown over the last `window_years` answered harvests before `beforeYear`, or null with
 * fewer than `min_years` of them. A harvest can't predict itself, so `beforeYear` is left out.
 */
export function expectedLossShare(
  years: HarvestsInput['years'],
  cropId: string,
  params: Params,
  beforeYear = Number.POSITIVE_INFINITY,
): LossShareFromHistory | null {
  const rows = lossHistory(years, cropId)
    .filter((r) => r.year < beforeYear)
    .slice(-params.window_years.value);
  if (rows.length < params.min_years.value) return null;
  const sown = rows.reduce((sum, r) => sum + r.sownHa, 0);
  const lost = rows.reduce((sum, r) => sum + r.lostHa, 0);
  return { share: sown > 0 ? lost / sown : 0, from: rows[0]!.year, to: rows[rows.length - 1]!.year, harvests: rows.length };
}

/**
 * The share of a crop the plan takes as lost in one harvest year, highest first: what the farmer
 * already said about that year, their own usual share (Datele planului), the farm's history, 0.
 */
export function lossShareFor(
  harvests: Harvests | null | undefined,
  cropId: string,
  harvestYear: number,
  params: Params,
): LossShare {
  if (!harvests) return { share: 0, basis: 'none' };
  const year = harvests.years.find((y) => y.year === harvestYear);
  const known = year && answered(year, cropId);
  if (known) return { share: known.lost.ha / known.areaHa, basis: 'this_year', year: harvestYear };
  const pct = harvests.expected?.find((e) => e.cropId === cropId)?.lossPct;
  if (pct != null) return { share: pct / 100, basis: 'farmer' };
  const history = expectedLossShare(harvests.years, cropId, params, harvestYear);
  return history ? { ...history, basis: 'history' } : { share: 0, basis: 'none' };
}

/**
 * A crop's loss for one harvest year, and whether the plan subtracts it. `applied` is false when
 * the yield is the county's and the share is only the farmer's usual one or the history (P33):
 * the county figure may already count lost fields.
 */
export type AppliedLoss = LossShare & { applied: boolean };

/**
 * The gathered rows with the hectares lost in their harvest year, so the yield is per harvested
 * hectare. The year is the harvest the gathering month falls in; without a month, the latest
 * harvest year that has the crop. A year where the farmer didn't say counts as nothing lost.
 */
export function gatheredWithLoss<G extends { cropId: string; harvested?: string }>(
  harvests: Pick<HarvestsInput, 'years'> & { gathered: G[] },
): (G & { lostHa?: number })[] {
  return harvests.gathered.map((g) => {
    const withCrop = harvests.years.filter((y) => y.parcels.some((p) => p.cropId === g.cropId));
    const year = g.harvested
      ? withCrop.find((y) => y.year === harvestYear(`${g.harvested}-01`))
      : withCrop.reduce<HarvestsInput['years'][number] | undefined>((latest, y) => (!latest || y.year > latest.year ? y : latest), undefined);
    const lost = year && answered(year, g.cropId)?.lost.ha;
    return lost ? { ...g, lostHa: lost } : g;
  });
}
