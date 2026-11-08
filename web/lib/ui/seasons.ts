/* The two season forms on Recolte, without the page (was web/legacy/seasons.js). Every crop grows for
   its own length of time: what was gathered started when it was sown, often the year before, and
   what's in the ground now is noted separately. Everything is calculated on the phone. */
import type { AppData } from '../../../packages/shared/src/data/index';
import { cropSeason, gatheredSeason, growingMonths, growingSeason, nextSowing } from '../../../packages/shared/src/cashflow/seasons';

export type Crop = AppData['crops']['crops'][number];

const SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
export const monthLabel = (key: string) => `${SHORT[+key.slice(5) - 1]} ${key.slice(0, 4)}`;
export const luni = (n: number) => (n === 1 ? '1 lună' : `${n} luni`);
export const decimalText = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const parse = (v: string) => {
  const s = v.trim().replace(',', '.');
  return s === '' ? null : Number(s);
};
const addMonth = (key: string, n: number) => {
  const t = +key.slice(0, 4) * 12 + +key.slice(5) - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

/* ---- What was gathered ---- */
export interface GatheredText {
  areaHa: string;
  tonnes: string;
  priceLeiPerKg: string;
  storedTonnes: string;
}
export interface GatheredRow {
  id: string;
  cropId: string;
  sown: string;
  harvested: string;
  areaHa: number | null;
  tonnes: number | null;
  priceLeiPerKg: number | null;
  storedTonnes: number | null;
}

export function gatheredHint(crop: Crop, now: string) {
  const s = gatheredSeason(crop, now);
  return `Semănat în ${monthLabel(s.sown)}, strâns în ${monthLabel(s.harvest)}: ${luni(growingMonths(crop))}.`;
}

/** "media: 40", what the tonnes box says while it's empty. */
export const usualTonnes = (crop: Crop, areaHa: number | null | undefined) => ((areaHa ?? 0) > 0 ? `media: ${decimalText(Math.round((areaHa as number) * crop.yield_t_per_ha.mean * 10) / 10)}` : '');

/** Empty boxes stay empty: the app then keeps the average for that crop. Only filled-in crops are kept. */
export function readGathered(entries: { crop: Crop; text: GatheredText }[], now: string): { error: string } | { rows: GatheredRow[]; filled: GatheredRow[] } {
  const rows: GatheredRow[] = [];
  const filled: GatheredRow[] = [];
  for (const { crop, text } of entries) {
    const v = { areaHa: parse(text.areaHa), tonnes: parse(text.tonnes), priceLeiPerKg: parse(text.priceLeiPerKg), storedTonnes: parse(text.storedTonnes) };
    const numbers = Object.values(v).filter((x) => x !== null) as number[];
    if (numbers.some((x) => !Number.isFinite(x) || x < 0)) return { error: `${crop.name_ro}: scrie doar numere, de exemplu ${decimalText(crop.price_lei_per_kg.mean)}.` };
    const isFilled = v.tonnes !== null || v.priceLeiPerKg !== null || v.storedTonnes !== null;
    if (isFilled && !((v.areaHa ?? 0) > 0)) return { error: `${crop.name_ro}: scrie câte hectare ai avut.` };
    if (v.tonnes !== null && v.storedTonnes !== null && v.storedTonnes > v.tonnes) return { error: `${crop.name_ro}: în hambar nu pot fi mai multe tone decât ai strâns.` };
    const s = gatheredSeason(crop, now);
    const row = { id: crop.id, cropId: crop.id, sown: s.sown, harvested: s.harvest, ...v };
    rows.push(row);
    if (isFilled) filled.push(row);
  }
  return { rows, filled };
}

/* ---- What's in the ground ---- */
/** From what could still be growing to a year ahead. Sown earlier, it would already be harvested. */
export function sowingChoices(crop: Crop, now: string) {
  const months: string[] = [];
  for (let m = addMonth(now, 1 - growingMonths(crop)); m <= addMonth(now, 12); m = addMonth(m, 1)) months.push(m);
  return months;
}
export const usualPlanting = (crop: Crop, now: string) => growingSeason(crop, now)?.sown ?? nextSowing(crop, now);
export const isSown = (crop: Crop, sown: string | undefined, now: string) => (sown || usualPlanting(crop, now)) <= now;
export function plantedHint(crop: Crop, sown: string | undefined, now: string) {
  const month = sown || usualPlanting(crop, now);
  const harvest = `îl strângi în ${monthLabel(cropSeason(crop, month).harvest)}, după ${luni(growingMonths(crop))}.`;
  return month > now ? `Îl semeni în ${monthLabel(month)} și ${harvest}` : `Semănat în ${monthLabel(month)}, ${harvest}`;
}
export const isUsualMonth = (crop: Crop, month: string) => +month.slice(5) === crop.sowing_month;
