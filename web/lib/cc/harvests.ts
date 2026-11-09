/* Harvests, as Recolte and the harvest picker have always seen them (web/legacy/app.js).
   A project is one crop in one harvest year ("Porumb 2027"); "Toată ferma 2027" is the same data
   added up. Records with no crop are shared costs and APIA money. Recolta 2027 runs from November
   2026, so the APIA advance that pays for it belongs to it.
   Signed in, the years come from the server and only the picked project stays on the phone. In the
   demo, everything stays on the phone under cropcash-demo-harvests. */
import type { AppData } from '../../../packages/shared/src/data/index';
import type { HarvestsInput, OwnCrop } from '../../../packages/shared/src/farm/index';

export { areaShare } from '../../../packages/shared/src/farm/index';
import { harvestsFromServer, type PageRecord } from '../live/farm';
import type { MeFarm, PageFarm } from './farm';
import { farmKeys, readJson, writeJson, type KeyStore, type Mode } from './storage';

export type { PageRecord };

export interface Planned {
  inBani: number;
  outBani: number;
  endBani?: number;
}

export interface HarvestParcel {
  cropId: string;
  areaHa: number;
  plantedMonth?: string;
  status?: 'open' | 'closed';
  planned?: Planned;
}

export interface Harvest {
  id: string;
  year: number;
  status: 'open' | 'closed';
  parcels: HarvestParcel[];
  openingBani: number;
  summary: string;
  records: PageRecord[];
  planned?: Planned;
  illustrative?: boolean;
}

export interface HarvestState {
  /** The picked harvest's id ("r2027"). */
  selected: string;
  /** The picked crop inside it, or null for the whole farm. */
  crop: string | null;
  items: Harvest[];
  /** What the farmer gathered, crop by crop. It belongs to the farm, not to one harvest. */
  gathered: NonNullable<HarvestsInput['gathered']>;
  /** What the farmer expects from a normal year, from Datele planului. It wins over the above (P29). */
  expected: NonNullable<HarvestsInput['expected']>;
  /** Crops the farmer described, which docs/data doesn't have. */
  ownCrops: OwnCrop[];
}

/** The first month of a harvest year: Recolta 2027 starts in November 2026. */
export const harvestMonth = (year: number) => `${year - 1}-11`;

export interface HarvestContext {
  store: KeyStore;
  mode: Mode;
  me: MeFarm | null;
  baseYear: number;
  baseFarm: PageFarm;
  farmData: AppData;
}

const firstHarvest = ({ baseYear, baseFarm }: Pick<HarvestContext, 'baseYear' | 'baseFarm'>): Harvest => ({
  id: `r${baseYear}`,
  year: baseYear,
  status: 'open',
  parcels: baseFarm.parcels,
  openingBani: baseFarm.startBalanceBani,
  summary: baseFarm.summary,
  records: [],
});

type Saved = Partial<HarvestState> & { items?: Harvest[] };

export function loadHarvests(ctx: HarvestContext): HarvestState {
  const saved = readJson<Saved>(ctx.store, farmKeys(ctx.mode).harvests) ?? {};
  let state: Partial<HarvestState> & Pick<HarvestState, 'selected' | 'crop' | 'items'>;
  if (ctx.me) {
    state = harvestsFromServer(ctx.me, ctx.baseYear, ctx.farmData, { selected: saved.selected, crop: saved.crop }) as HarvestState;
  } else {
    /* A sample year saved by an older version has no place here any more. */
    const items = Array.isArray(saved.items) ? saved.items.filter((h) => !h.illustrative) : [];
    state = items.length
      ? { ...saved, items, selected: items.some((h) => h.id === saved.selected) ? saved.selected! : items[items.length - 1].id, crop: saved.crop ?? null }
      : { selected: `r${ctx.baseYear}`, crop: null, items: [firstHarvest(ctx)] };
  }
  return {
    ...state,
    gathered: state.gathered ?? (ctx.baseFarm as { gathered?: HarvestState['gathered'] }).gathered ?? [],
    expected: state.expected ?? [],
    ownCrops: state.ownCrops ?? [],
  };
}

/** Signed in, only the picked project is kept here; the rest lives on the server. */
export function saveHarvests(store: KeyStore, mode: Mode, signedInFarm: boolean, state: HarvestState): boolean {
  return writeJson(store, farmKeys(mode).harvests, signedInFarm ? { selected: state.selected, crop: state.crop } : state);
}

export const openHarvests = (state: HarvestState) => state.items.filter((h) => h.status === 'open').sort((a, b) => a.year - b.year);

export const selectedHarvest = (state: HarvestState) =>
  state.items.find((h) => h.id === state.selected) ?? openHarvests(state)[0] ?? state.items[state.items.length - 1];

/** Whole-farm pages follow the harvest under way by date, whichever one is picked. */
export const currentHarvest = (state: HarvestState, baseYear: number) => state.items.find((h) => h.year === baseYear) ?? selectedHarvest(state);

export const cropParcel = (h: Harvest, cropId: string) => h.parcels.find((p) => p.cropId === cropId);

export const projectClosed = (h: Harvest, cropId: string | null = null) =>
  (cropId ? (cropParcel(h, cropId)?.status ?? h.status) : h.status) === 'closed';

/**
 * What a page works on. Whole-farm pages (Acasă, Salariu, Bani, …) take the harvest under way and
 * every record since it began; the others take the picked harvest and, if one is picked, its crop.
 */
export function harvestScope(state: HarvestState, baseYear: number, wholeFarm: boolean) {
  const selected = selectedHarvest(state);
  const selectedCrop = !wholeFarm && state.crop && cropParcel(selected, state.crop) ? state.crop : null;
  const scope = wholeFarm ? currentHarvest(state, baseYear) : selected;
  const records = wholeFarm
    ? state.items.flatMap((h) => h.records).filter((r) => r.date >= `${harvestMonth(baseYear)}-01`)
    : selected.status === 'open'
      ? selected.records
      : [];
  return { selected, selectedCrop, scope, records };
}

/** A page record as a transaction the engine reads. */
export const toTransaction = (r: PageRecord) => ({
  id: r.id,
  kind: r.kind,
  category: r.category ?? null,
  crop_id: r.cropId ?? null,
  amount_bani: r.amountBani,
  occurred_at: `${r.date}T12:00:00Z`,
  note: null,
  source: 'manual',
});

export const toParcel = (p: HarvestParcel) => ({
  crop_id: p.cropId,
  area_ari: Math.round(p.areaHa * 100),
  is_arable: true,
  ...(p.plantedMonth ? { planted_month: p.plantedMonth } : {}),
});

export interface CropTab {
  /** Null is the whole farm. */
  cropId: string | null;
  label: string;
  /** Beside the name: the hectares, or that the crop is finished. */
  sub: string | null;
  current: boolean;
}

/** The strip at the top of a page: the whole farm first, then each crop of this harvest. */
export function cropTabs(h: Pick<Harvest, 'parcels' | 'status'>, active: string | null, cropName: (id: string) => string): CropTab[] {
  return [
    { cropId: null, label: 'Toată ferma', sub: null, current: active === null },
    ...h.parcels.map((p) => ({
      cropId: p.cropId,
      label: cropName(p.cropId),
      sub: projectClosed(h as Harvest, p.cropId) ? 'încheiată' : `${String(p.areaHa).replace('.', ',')} ha`,
      current: p.cropId === active,
    })),
  ];
}

export const moneyIn = (rows: PageRecord[]) => rows.filter((r) => r.amountBani > 0).reduce((s, r) => s + r.amountBani, 0);
export const moneyOut = (rows: PageRecord[]) => -rows.filter((r) => r.amountBani < 0).reduce((s, r) => s + r.amountBani, 0);

export const harvestName = (h: Pick<Harvest, 'year'>) => `Recolta ${h.year}`;
export const statusWord = (h: Pick<Harvest, 'status'>) => (h.status === 'open' ? 'în lucru' : 'încheiată');
