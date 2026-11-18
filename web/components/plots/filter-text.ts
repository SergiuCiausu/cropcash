/* The words for the parcel filters (docs/harta-plan.md, step 6): one chip per active filter, and the
   labels the „Filtre” sheet and the sort menu use. The filtering itself is packages/shared/src/plots/filters.ts. */
import { activeFilters, UNKNOWN_CROP, type MoneyRange, type MonthRange, type Placement, type PlotFilters, type SortKey, type ValueRange } from '../../../packages/shared/src/plots/index';
import { parseAreaText } from '../../../packages/shared/src/documents/index';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import { OPERATION_LABELS } from '../app/EventSheet';
import { group, ha, MONTHS } from '../../lib/cc/format';

export interface FilterNames {
  cropName: (cropId: string) => string;
  /** A commune or village by SIRUTA code; the code itself when the name isn't known. */
  placeName: (siruta: number) => string;
  /** plots-params.json todo_soon_days. */
  soonDays: number;
}

export const PLACEMENT_LABELS: Record<Placement, string> = { placed: 'Pe hartă', approx: 'Loc aproximativ', none: 'Fără loc pe hartă' };

/** APIA's land-use codes (fol_pr_trn). An unknown code shows as itself. */
const LAND_USES: Record<string, string> = { TA: 'Teren arabil', PP: 'Pajiște permanentă', CP: 'Culturi permanente', VI: 'Vie', LI: 'Livadă' };
export const landUseLabel = (code: string) => LAND_USES[code] ?? code;

export const SORT_LABELS: Record<SortKey, string> = {
  name: 'Nume',
  size: 'Suprafață',
  result_ha: 'Rezultat pe hectar',
  expenses: 'Cheltuieli',
  harvest: 'Data recoltei',
  next_treatment: 'Următoarea lucrare',
};

export const kindLabel = (kind: string) => OPERATION_LABELS.find(([k]) => k === kind)?.[1] ?? kind;
export const cropLabel = (id: string, names: Pick<FilterNames, 'cropName'>) => (id === UNKNOWN_CROP ? 'Fără cultură' : names.cropName(id));

/** "2027-07" -> "iul. 2027". */
export const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/** "Grâu, Porumb" for two, "Grâu și încă 2" for more. */
function few(words: string[]): string {
  if (words.length <= 2) return words.join(', ');
  return `${words[0]} și încă ${words.length - 1}`;
}

function between(r: ValueRange<number>, show: (n: number) => string, unit: string): string {
  if (r.min != null && r.max != null) return `între ${show(r.min)} și ${show(r.max)} ${unit}`;
  if (r.min != null) return `cel puțin ${show(r.min)} ${unit}`;
  return `cel mult ${show(r.max!)} ${unit}`;
}

const lei = (bani: number) => `${bani < 0 ? '−' : ''}${group(Math.round(Math.abs(bani) / 100))}`;
const money = (word: string, r: MoneyRange) => `${word} ${between(r, lei, r.perHa ? 'lei/ha' : 'lei')}`;

function months(word: string, r: MonthRange): string {
  if (r.from && r.to) return r.from === r.to ? `${word} în ${monthLabel(r.from)}` : `${word} ${monthLabel(r.from)} – ${monthLabel(r.to)}`;
  return r.from ? `${word} din ${monthLabel(r.from)}` : `${word} până în ${monthLabel(r.to!)}`;
}

/** The text of one active filter's chip. */
export function chipText(key: keyof PlotFilters, f: PlotFilters, names: FilterNames): string {
  switch (key) {
    case 'crops':
      return few(f.crops!.map((c) => cropLabel(c, names)));
    case 'sizeAri':
      return between(f.sizeAri!, ha, 'ha');
    case 'revenue':
      return money('Venit', f.revenue!);
    case 'expenses':
      return money('Cheltuieli', f.expenses!);
    case 'result':
      return money('Rezultat', f.result!);
    case 'treatmentsDone': {
      const t = f.treatmentsDone!;
      if (t === 'some') return 'Cu tratamente făcute';
      if (t === 'none') return 'Fără tratamente încă';
      return `Făcut: ${t.map((k) => kindLabel(k).toLowerCase()).join(', ')}`;
    }
    case 'todo':
      return f.todo === 'any' ? 'Cu lucrări de făcut' : f.todo === 'overdue' ? 'Lucrări întârziate' : `De făcut în ${names.soonDays} de zile`;
    case 'sown':
      return months('Semănat', f.sown!);
    case 'harvest':
      return months('Recoltă', f.harvest!);
    case 'siruta':
      return few(f.siruta!.map(names.placeName));
    case 'text':
      return `Bloc sau parcelă: ${f.text}`;
    case 'placement':
      return f.placement!.map((p) => PLACEMENT_LABELS[p]).join(' sau ');
    case 'landUse':
      return few(f.landUse!.map(landUseLabel));
    case 'cropChanged':
      return f.cropChanged ? 'Altă cultură decât anul trecut' : 'Aceeași cultură ca anul trecut';
  }
}

export const filterChips = (f: PlotFilters, names: FilterNames) => activeFilters(f).map((key) => ({ key, text: chipText(key, f, names) }));

/** "7 din 12 parcele", "o parcelă", "toate cele 12 parcele". */
export function countText(shown: number, total: number): string {
  const parcels = (n: number) => (n === 1 ? 'o parcelă' : `${n} ${n >= 20 ? 'de ' : ''}parcele`);
  if (shown === total) return total === 1 ? 'O parcelă' : `Toate cele ${parcels(total)}`;
  return `${shown} din ${total} ${total === 1 ? 'parcelă' : total >= 20 ? 'de parcele' : 'parcele'}`;
}

/** The „Filtre” sheet's button: how many parcels the choices leave; null while something can't be read. */
export function showText(n: number | null): string {
  if (n === null) return 'Arată parcelele';
  if (n === 0) return 'Nicio parcelă nu se potrivește';
  return n === 1 ? 'Arată o parcelă' : `Arată ${n} ${n >= 20 ? 'de ' : ''}parcele`;
}

// ── What the farmer types into the „Filtre” sheet ──────────────────────────

/** Whole lei, with a minus for a loss: "−1.500" -> −150 000 bani. Null when empty or unreadable. */
export function typedLei(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const negative = /^[-−]/.test(t);
  const lei = parseWholeLei(negative ? t.slice(1) : t);
  return lei === null ? null : (negative ? -lei : lei) * 100;
}

/** Hectares as typed, "2,5" -> 250 ari; "0" counts as no limit. */
export const typedHa = (text: string): number | null => (text.trim() ? parseAreaText(text) : null);

/** The inputs back from a range, for editing it again. */
export const leiText = (bani: number | undefined) => (bani == null ? '' : `${bani < 0 ? '−' : ''}${group(Math.round(Math.abs(bani) / 100))}`);
export const haText = (ari: number | undefined) => (ari == null ? '' : ha(ari));
