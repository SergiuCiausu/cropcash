/**
 * Landowners and arendă contracts (docs/employees-arenda-plan.md §3.1–3.2, docs/15-arenda.md §1, migration 033).
 *
 * One `landowners` table for both directions (D5): on a `taken` contract the person is the landowner the farm
 * pays, on a `given` one the farm lets its own land to them and gets the rent. No CNP and no IBAN, ever (D4).
 * Money is integer bani, area integer ari, rent in kind whole kg.
 */
import { z } from 'zod';
import { addMonthsToDate, type IsoDate } from '../cashflow/dates';
import { MAX_FARM_HA } from '../farm';
import { areaTimesRate, haToAri, leiToBani, type Ari, type Bani } from '../money';
import type { PlotTenure } from '../plots/model';

export const RENT_PAYMENTS = ['cash', 'in_kind', 'mixed'] as const;
export type RentPayment = (typeof RENT_PAYMENTS)[number];
export const LEASE_DIRECTIONS = ['taken', 'given'] as const;
export type LeaseDirection = (typeof LEASE_DIRECTIONS)[number];
export const LAND_TAX_BY = ['farm', 'owner'] as const;
export type LandTaxBy = (typeof LAND_TAX_BY)[number];

/** Guards against typos, not market limits. */
const MAX_RENT_LEI_PER_HA = 20_000;
const MAX_RENT_KG_PER_HA = 10_000;
/** Most landowners on one farm (§3.1: "dozens to hundreds"). */
export const MAX_LANDOWNERS = 2_000;

const Day = z.iso.date();
const Text = (max: number) => z.string().trim().min(1).max(max);

const LandownerFields = {
  name: Text(80),
  /** The village: the list sorts and groups by it. */
  locality: Text(80).optional(),
  /** Many landowners have none (§3.1). */
  phone: z.string().trim().regex(/^\+?[0-9 ]{6,20}$/).optional(),
  payment: z.enum(RENT_PAYMENTS).optional(),
  /** „moștenitorii lui X” and the like. */
  note: Text(200).optional(),
};

export const LandownerInputSchema = z.strictObject(LandownerFields);
export type LandownerInput = z.input<typeof LandownerInputSchema>;
export const AddLandownerInputSchema = z.strictObject({ ...LandownerFields, clientId: z.uuid().optional() });
export const UpdateLandownerInputSchema = z.strictObject({ ...LandownerFields, id: z.uuid() });
/** Archived, never deleted: old rent payments keep their name. Their contracts are archived with them. */
export const ArchiveArendaInputSchema = z.strictObject({ id: z.uuid() });

const Ha = z
  .number()
  .positive()
  .max(MAX_FARM_HA)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'max 2 decimals');

const ContractFields = {
  landownerId: z.uuid(),
  direction: z.enum(LEASE_DIRECTIONS),
  areaHa: Ha,
  /** For land not yet on the map: where it is. */
  locality: Text(80).optional(),
  /** The farm's parcels under this contract (Harta). Empty: just the hectares. */
  plotIds: z.array(z.uuid()).max(500).default([]),
  startsOn: Day,
  /** Left out: until the crop of the agricultural year is gathered (Codul civil art. 1837). */
  endsOn: Day.optional(),
  /** Rent in money, whole lei per ha. */
  rentLeiPerHa: z.number().int().positive().max(MAX_RENT_LEI_PER_HA).optional(),
  /** Rent in kind, kg per ha of `rentCropId`. */
  rentKgPerHa: z.number().int().positive().max(MAX_RENT_KG_PER_HA).optional(),
  rentCropId: Text(40).optional(),
  /** The month the rent is paid (1–12). */
  payMonth: z.number().int().min(1).max(12).optional(),
  /** Who pays the land tax on these hectares. */
  landTaxBy: z.enum(LAND_TAX_BY).optional(),
  /** At the primărie (Codul civil art. 1838). */
  registrationNo: Text(40).optional(),
  registrationDate: Day.optional(),
};

export type ContractShape = z.output<z.ZodObject<typeof ContractFields>>;

/** The rules between fields. Migration 033 checks the same ones. */
function checkContract<T extends ContractShape>(c: T, ctx: z.core.$RefinementCtx<T>): void {
  const fail = (message: string, path: keyof ContractShape) => ctx.addIssue({ code: 'custom', message, path: [path] });
  if (c.rentLeiPerHa === undefined && c.rentKgPerHa === undefined) fail('rent in lei or in kg', 'rentLeiPerHa');
  if ((c.rentKgPerHa === undefined) !== (c.rentCropId === undefined)) fail('kg go with a crop', 'rentCropId');
  if (c.endsOn && c.endsOn < c.startsOn) fail('ends before it starts', 'endsOn');
  if (new Set(c.plotIds).size !== c.plotIds.length) fail('a parcel twice', 'plotIds');
}

export const ContractInputSchema = z.strictObject(ContractFields).superRefine(checkContract);
export type ContractInput = z.input<typeof ContractInputSchema>;
export const AddContractInputSchema = z.strictObject({ ...ContractFields, clientId: z.uuid().optional() }).superRefine(checkContract);
/** Every field again, so leaving one out clears it. */
export const UpdateContractInputSchema = z.strictObject({ ...ContractFields, id: z.uuid() }).superRefine(checkContract);

/** One parcel: whose land it is (plots.tenure, migration 032). */
export const SetPlotTenureInputSchema = z.strictObject({ plotId: z.uuid(), tenure: z.enum(['own', 'leased_in', 'leased_out']) });

/** „Câți proprietari ai?” at onboarding: how many the list should reach. Null clears it. */
export const SetLandownerCountInputSchema = z.strictObject({ count: z.number().int().min(1).max(MAX_LANDOWNERS).nullable() });

/** A `landowners` row. */
export interface StoredLandowner {
  id: string;
  name: string;
  locality: string | null;
  phone: string | null;
  payment: RentPayment | null;
  note: string | null;
  archived_at: string | null;
}

/** A `lease_contracts` row. */
export interface StoredContract {
  id: string;
  landowner_id: string;
  direction: LeaseDirection;
  area_ari: Ari;
  locality: string | null;
  plot_ids: string[];
  starts_on: IsoDate;
  ends_on: IsoDate | null;
  rent_bani_per_ha: Bani | null;
  rent_kg_per_ha: number | null;
  rent_crop_id: string | null;
  pay_month: number | null;
  land_tax_by: LandTaxBy | null;
  registration_no: string | null;
  registration_date: IsoDate | null;
  archived_at: string | null;
  /** What the farmer decided about its end (migration 048, docs/contracts-plan.md §3.2); absent before 048. */
  decision?: 'renew' | 'end' | 'renegotiate' | null;
  decided_on?: IsoDate | null;
}

export function landownerRow(l: z.output<typeof LandownerInputSchema>): Omit<StoredLandowner, 'id' | 'archived_at'> {
  return { name: l.name, locality: l.locality ?? null, phone: l.phone ?? null, payment: l.payment ?? null, note: l.note ?? null };
}

export function contractRow(c: ContractShape): Omit<StoredContract, 'id' | 'archived_at'> {
  return {
    landowner_id: c.landownerId,
    direction: c.direction,
    area_ari: haToAri(c.areaHa),
    locality: c.locality ?? null,
    plot_ids: c.plotIds,
    starts_on: c.startsOn,
    ends_on: c.endsOn ?? null,
    rent_bani_per_ha: c.rentLeiPerHa === undefined ? null : leiToBani(c.rentLeiPerHa),
    rent_kg_per_ha: c.rentKgPerHa ?? null,
    rent_crop_id: c.rentCropId ?? null,
    pay_month: c.payMonth ?? null,
    land_tax_by: c.landTaxBy ?? null,
    registration_no: c.registrationNo ?? null,
    registration_date: c.registrationDate ?? null,
  };
}

/** In force on `day`: not archived, started, not ended. */
export const activeOn = (c: Pick<StoredContract, 'starts_on' | 'ends_on' | 'archived_at'>, day: IsoDate) =>
  !c.archived_at && c.starts_on <= day && (c.ends_on === null || c.ends_on >= day);

export interface RentDue {
  /** The money part. */
  bani: Bani;
  /** The kind part, of `cropId`. */
  kg: number;
  cropId: string | null;
  /** Money plus the kind at the county price; null when there's kind and no price (docs/15-arenda.md §5). */
  leiEquivalentBani: Bani | null;
}

/** One year's rent on a contract. `priceBaniPerKg`: the county price for its crop (`inKindPriceBani`). */
export function rentDue(c: Pick<StoredContract, 'area_ari' | 'rent_bani_per_ha' | 'rent_kg_per_ha' | 'rent_crop_id'>, priceBaniPerKg: number | null): RentDue {
  const bani = c.rent_bani_per_ha ? areaTimesRate(c.area_ari, c.rent_bani_per_ha) : 0;
  const kg = c.rent_kg_per_ha ? Math.round((c.area_ari * c.rent_kg_per_ha) / 100) : 0;
  const leiEquivalentBani = kg === 0 ? bani : priceBaniPerKg === null ? null : bani + kg * priceBaniPerKg;
  return { bani, kg, cropId: kg ? c.rent_crop_id : null, leiEquivalentBani };
}

/** `day` moved back `months` months; the 31st falls on the month's last day. */
const monthsBefore = (day: IsoDate, months: number): IsoDate => addMonthsToDate(day, -months);

/**
 * The last day to refuse renewal in writing (Codul civil art. 1848): a year before the end, half that for a
 * contract of a year or less. Null without an end date.
 */
export function refuseRenewalBy(c: Pick<StoredContract, 'starts_on' | 'ends_on'>): IsoDate | null {
  if (!c.ends_on) return null;
  const oneYearOrLess = monthsBefore(c.ends_on, 12) <= c.starts_on;
  return monthsBefore(c.ends_on, oneYearOrLess ? 6 : 12);
}

export interface Expiring {
  contract: StoredContract;
  endsOn: IsoDate;
  refuseBy: IsoDate;
  /** Past the refusal day: unless it was already refused, it renews itself for the same length. */
  renews: boolean;
}

/**
 * The contracts to think about now: from `monthsAhead` months before the refusal day until they end, the most
 * urgent first. The default month ahead makes 13 months before the end for most contracts (docs/15-arenda.md §1).
 */
export function expiringContracts(contracts: readonly StoredContract[], today: IsoDate, monthsAhead = 1): Expiring[] {
  const out: Expiring[] = [];
  for (const c of contracts) {
    const refuseBy = refuseRenewalBy(c);
    if (c.archived_at || !refuseBy || !c.ends_on || c.ends_on < today) continue;
    if (today < monthsBefore(refuseBy, monthsAhead)) continue;
    out.push({ contract: c, endsOn: c.ends_on, refuseBy, renews: today > refuseBy });
  }
  return out.sort((a, b) => a.refuseBy.localeCompare(b.refuseBy));
}

export interface PlotForCoverage {
  id: string;
  name: string | null;
  tenure?: PlotTenure;
  archived_at: string | null;
  /** The parcel's own crop holder (`auto_crop_id`): hectares not yet on the map, never part of a contract. */
  auto_crop_id?: string | null;
}

export interface Coverage {
  /** Parcels marked as taken (given) in arendă that no contract in force names. */
  leasedWithoutContract: PlotForCoverage[];
  /** Contracts in force that name no parcel: just hectares. */
  contractsWithoutPlot: StoredContract[];
  /** A parcel in a contract whose tenure says otherwise (own land in a taken contract, say). */
  tenureMismatch: { plot: PlotForCoverage; contract: StoredContract }[];
  /** Contracts in force with no registration at the primărie (Codul civil art. 1838). */
  unregistered: StoredContract[];
  takenAri: Ari;
  givenAri: Ari;
  /** Per landowner, in force: the area each way and the contracts. */
  byLandowner: Map<string, { takenAri: Ari; givenAri: Ari; contracts: StoredContract[] }>;
}

const TENURE_OF: Record<LeaseDirection, PlotTenure> = { taken: 'leased_in', given: 'leased_out' };

/** How the parcels and the contracts in force on `day` match (§3.2). */
export function coverage(plots: readonly PlotForCoverage[], contracts: readonly StoredContract[], day: IsoDate): Coverage {
  const live = contracts.filter((c) => activeOn(c, day));
  const named = new Map<string, StoredContract[]>();
  for (const c of live) for (const id of c.plot_ids) named.set(id, [...(named.get(id) ?? []), c]);
  const byId = new Map(plots.filter((p) => !p.archived_at).map((p) => [p.id, p]));

  const leasedWithoutContract = [...byId.values()].filter((p) => {
    if (!p.tenure || p.tenure === 'own') return false;
    return !(named.get(p.id) ?? []).some((c) => TENURE_OF[c.direction] === p.tenure);
  });
  const tenureMismatch: Coverage['tenureMismatch'] = [];
  for (const c of live)
    for (const id of c.plot_ids) {
      const plot = byId.get(id);
      if (plot && (plot.tenure ?? 'own') !== TENURE_OF[c.direction]) tenureMismatch.push({ plot, contract: c });
    }

  const byLandowner: Coverage['byLandowner'] = new Map();
  let takenAri = 0;
  let givenAri = 0;
  for (const c of live) {
    const row = byLandowner.get(c.landowner_id) ?? { takenAri: 0, givenAri: 0, contracts: [] };
    if (c.direction === 'taken') {
      row.takenAri += c.area_ari;
      takenAri += c.area_ari;
    } else {
      row.givenAri += c.area_ari;
      givenAri += c.area_ari;
    }
    row.contracts.push(c);
    byLandowner.set(c.landowner_id, row);
  }

  return {
    leasedWithoutContract,
    contractsWithoutPlot: live.filter((c) => c.plot_ids.length === 0),
    tenureMismatch,
    unregistered: live.filter((c) => !c.registration_no),
    takenAri,
    givenAri,
    byLandowner,
  };
}
