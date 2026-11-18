/* What the farmer types about hectares that didn't make it to harvest (docs/crop-loss-plan.md).
   An empty field means "didn't say", which is not the same as 0: only 0 counts in the history. */
import { LOSS_REASONS, type CropLoss } from '../../../packages/shared/src/farm/harvests';
import type { AppliedLoss } from '../../../packages/shared/src/farm/crop-loss';
import { decimalText } from './seasons';

export type LossReason = (typeof LOSS_REASONS)[number];

export const LOSS_LABELS: [LossReason, string][] = [
  ['drought', 'Secetă'],
  ['hail', 'Grindină'],
  ['flood', 'Inundație'],
  ['frost', 'Îngheț'],
  ['pests', 'Boli sau dăunători'],
  ['other', 'Altceva'],
];

export interface LossText {
  ha: string;
  reason: LossReason | null;
}

export const lossText = (lost: CropLoss | undefined): LossText => ({ ha: decimalText(lost?.ha), reason: lost?.reason ?? null });

export type LossReading = { kind: 'unknown' } | { kind: 'error'; text: string } | { kind: 'ok'; lost: CropLoss };

/** Reads the field for a crop sown on `areaHa` hectares. `month` is when it happened, if known. */
export function readLoss(text: LossText, areaHa: number, cropName: string, month?: string): LossReading {
  const t = text.ha.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return { kind: 'unknown' };
  if (!/^\d+(\.\d+)?$/.test(t)) return { kind: 'error', text: `${cropName}: scrie hectarele pierdute ca număr, de exemplu 2,5.` };
  const ha = Math.round(Number(t) * 100) / 100;
  if (ha > areaHa) return { kind: 'error', text: `${cropName}: n-ai cum pierde mai mult de ${decimalText(areaHa)} ha, câte ai semănat.` };
  return { kind: 'ok', lost: { ha, ...(ha > 0 && text.reason ? { reason: text.reason } : {}), ...(ha > 0 && month ? { month } : {}) } };
}

/** "3 ha din 8, adică 38%", or null while the field can't be read. */
export function lossEcho(text: LossText, areaHa: number): string | null {
  const r = readLoss(text, areaHa, '');
  if (r.kind !== 'ok' || !(areaHa > 0)) return null;
  if (r.lost.ha === 0) return 'Nimic pierdut.';
  return `${decimalText(r.lost.ha)} ha din ${decimalText(areaHa)}, adică ${Math.round((r.lost.ha / areaHa) * 100)}%.`;
}

const pctText = (share: number) => `${decimalText(Math.round(share * 1000) / 10)}%`;

/** Prognoză's line for one crop: what was subtracted for lost hectares and where it comes from. Null when there's nothing to say. */
export function lossLine(cropName: string, loss: AppliedLoss | undefined): string | null {
  if (!loss || loss.basis === 'none' || loss.share <= 0) return null;
  const p = pctText(loss.share);
  if (!loss.applied) return `${cropName}: pierzi de obicei ${p}, dar producția e media județului, care poate ține deja cont de câmpurile pierdute. N-am scăzut nimic.`;
  if (loss.basis === 'this_year') return `${cropName}: am scăzut ${p}, cât ai spus că ai pierdut la recolta ${loss.year}.`;
  if (loss.basis === 'farmer') return `${cropName}: am scăzut ${p} pentru ce nu ajunge la recoltă, cât ai scris în Datele planului.`;
  const years = loss.from === loss.to ? `recolta ${loss.from} a ta` : `recoltele ${loss.from}–${loss.to} ale tale`;
  return `${cropName}: am scăzut ${p} pentru ce nu ajunge la recoltă, din ${years}.`;
}
