/* The Arendă screen's sums (docs/employees-arenda-plan.md §3, docs/15-arenda.md). Pure, so the page and its tests
   share them. The county prices are docs/data/arenda-prices-2026.json, in the app's data (`data.arenda`). */
import {
  activeOn,
  arendaPrice,
  landownerYears,
  rentDue,
  rentPayments,
  rentTax,
  type LeaseDirection,
  type StoredContract,
  type StoredLandowner,
} from '../../../packages/shared/src/arenda/index';
import type { AppData } from '../../../packages/shared/src/data/index';
import { group } from './format';

type Data = Pick<AppData, 'crops' | 'catalogue' | 'arenda'>;

/** Lei with the bani, as the tax is withheld: 11040 → "110,40"; grouped with dots unless `plain`. */
export const leiWithBani = (bani: number, plain = false) => {
  const whole = Math.trunc(bani / 100);
  return `${plain ? String(whole) : group(whole)},${String(Math.abs(bani) % 100).padStart(2, '0')}`;
};

/** The county price for a contract's crop, in bani per kg, or null. */
export const priceFor = (data: Data, county: string, cropId: string | null, today: string): number | null => arendaPrice(data, county, cropId, today);

export interface YearRent {
  /** Money rent for the contracts in force. */
  bani: number;
  /** Rent in kind, per crop id. */
  kg: Map<string, number>;
  /** Money plus kind at the county price; null when a crop has no price. */
  leiEquivalentBani: number | null;
  /** Crops paid in kind whose county price isn't known. */
  unpriced: string[];
  /** On `taken` contracts: the tax the farm withholds, per landowner, added up (Codul fiscal art. 84). Null as above. */
  taxBani: number | null;
  contracts: number;
}

/** One direction's rent for a year, from the contracts in force on `today`. */
export function yearRent(contracts: readonly StoredContract[], direction: LeaseDirection, county: string, data: Data, today: string): YearRent {
  const live = contracts.filter((c) => c.direction === direction && activeOn(c, today));
  const kg = new Map<string, number>();
  const unpriced = new Set<string>();
  const perOwner = new Map<string, number | null>();
  let bani = 0;
  for (const c of live) {
    const due = rentDue(c, priceFor(data, county, c.rent_crop_id, today));
    bani += due.bani;
    if (due.cropId) {
      kg.set(due.cropId, (kg.get(due.cropId) ?? 0) + due.kg);
      if (due.leiEquivalentBani === null) unpriced.add(due.cropId);
    }
    const before = perOwner.has(c.landowner_id) ? perOwner.get(c.landowner_id)! : 0;
    perOwner.set(c.landowner_id, before === null || due.leiEquivalentBani === null ? null : before + due.leiEquivalentBani);
  }
  const owners = [...perOwner.values()];
  const known = owners.every((v) => v !== null);
  const leiEquivalentBani = known ? owners.reduce<number>((s, v) => s + (v ?? 0), 0) : null;
  const taxBani = direction === 'taken' && known ? owners.reduce<number>((s, v) => s + rentTax(v ?? 0, today, data.arenda.tax).taxBani, 0) : null;
  return { bani, kg, leiEquivalentBani, unpriced: [...unpriced], taxBani, contracts: live.length };
}

/**
 * The list for the accountant (§3.4): per landowner, the year's rent, the tax withheld and what they get. The CNP column
 * stays empty: the app never holds it (D4). Lei with a comma, as Romanian Excel reads them; `;` between columns.
 */
export function accountantCsv(
  contracts: readonly StoredContract[],
  owners: readonly StoredLandowner[],
  year: number,
  county: string,
  data: Data,
  cropName: (id: string) => string,
  day: number,
): string {
  const rows = landownerYears(rentPayments(contracts, `${year}-01`, `${year}-12`, county, data, day));
  const cell = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lei = (bani: number | null) => (bani === null ? '' : leiWithBani(bani, true));
  const kg = (r: (typeof rows)[number], key: 'grossKg' | 'paidKg') => r.kg.map((k) => `${k[key]} kg ${cropName(k.cropId).toLocaleLowerCase('ro')}`).join(', ');
  const head = ['Nume', 'Localitate', 'CNP', 'Arenda în bani (lei)', 'Arenda în produse', 'Valoarea totală, la prețul județului (lei)', 'Impozit reținut (lei)', 'Primește în bani (lei)', 'Primește în produse'];
  const body = rows
    .map((r) => ({ r, o: owners.find((o) => o.id === r.landownerId) }))
    .sort((a, b) => (a.o?.name ?? '').localeCompare(b.o?.name ?? '', 'ro'))
    .map(({ r, o }) => [o?.name ?? '', o?.locality ?? '', '', lei(r.grossBani), kg(r, 'grossKg'), lei(r.grossValueBani), lei(r.taxBani), lei(r.paidBani), kg(r, 'paidKg')]);
  return [head, ...body].map((line) => line.map(cell).join(';')).join('\r\n') + '\r\n';
}

/** "800 kg grâu/ha", "1.000 lei/ha", "500 lei și 400 kg porumb pe ha". */
export function rentWords(c: Pick<StoredContract, 'rent_bani_per_ha' | 'rent_kg_per_ha' | 'rent_crop_id'>, cropName: (id: string) => string): string {
  const lei = c.rent_bani_per_ha ? `${group(Math.round(c.rent_bani_per_ha / 100))} lei` : '';
  const kind = c.rent_kg_per_ha && c.rent_crop_id ? `${group(c.rent_kg_per_ha)} kg ${cropName(c.rent_crop_id).toLocaleLowerCase('ro')}` : '';
  return `${[lei, kind].filter(Boolean).join(' și ')} pe ha`;
}
