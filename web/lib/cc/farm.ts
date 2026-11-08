/* Whose farm the pages show, read from what's saved on the phone. This is the top of
   web/legacy/app.js, with the two modes from docs/13-auth-demo-loading-plan.md §A3:
   - demo (/ferma-lui-ion): always Ion, from docs/data/demo-ion.json. Signed-in or not, the saved
     farm copy is ignored, and Ion's own changes live under cropcash-demo-*.
   - farm: the signed-in farm, from the saved copy of /api/me plus the outbox. With no copy there is
     no farm (null), and the sign-in guard sends the farmer to /login or /onboarding first. */
import demoIon from '../../../docs/data/demo-ion.json';
import type { AppData } from '../../../packages/shared/src/data/index';
import { farmToday, withOwnCrops, harvestYear, type OwnCrop, type StoredFarm } from '../../../packages/shared/src/farm/index';
import { todayInRomania } from '../../../packages/shared/src/cashflow/dates';
import { farmForPages, type MeFarm as LiveMeFarm } from '../live/farm';

/** The saved /api/me copy, with the followed calls the calendar shows offline. */
export type MeFarm = LiveMeFarm & Pick<StoredFarm, 'opportunity_follows'>;
import { readOutbox, withOutbox, type OutboxItem } from '../live/outbox';
import { farmKeys, hasSession, KEYS, readJson, readText, type KeyStore, type Mode } from './storage';
import { loadHarvests, type HarvestState } from './harvests';
import type { CurrencyChoice } from './currency';
import { loadCurrency } from './currency';
import type { MonitorCopy } from './monitor';
import { savedMonitor } from './monitor';

/** A farm as the pages show it: the shape app.js has always called FARM. */
export interface PageFarm {
  name: string;
  age: number;
  county: string;
  region: string | null;
  startBalanceBani: number;
  summary: string;
  parcels: { cropId: string; areaHa: number; plantedMonth?: string }[];
  /** Ion only: what /ferma-lui-ion/bani shows instead of a Stripe account (lib/demo-account.ts). */
  account?: { payoutsShown: number };
}

const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} și ${names[names.length - 1]}` : names[0] ?? '');

/** Ion, from docs/data, never from a constant in page code. */
export function ionFarm(data: AppData): PageFarm {
  const county = data.counties.counties.find((c) => c.code === demoIon.county);
  const cropName = (id: string) => data.crops.crops.find((c) => c.id === id)?.name_ro ?? id;
  const parcels = demoIon.parcels.map((p) => ({ cropId: p.crop_id, areaHa: p.area_ha, ...(p.planted_month ? { plantedMonth: p.planted_month } : {}) }));
  const totalHa = parcels.reduce((s, p) => s + p.areaHa, 0);
  return {
    name: demoIon.name,
    age: demoIon.age,
    county: county?.name_ro ?? demoIon.county,
    region: county?.region_ro ?? null,
    startBalanceBani: demoIon.start_balance_lei * 100,
    account: { payoutsShown: demoIon.demo_account.payouts_shown.value },
    summary: `${String(totalHa).replace('.', ',')} ha, ${list(parcels.map((p) => cropName(p.cropId).toLocaleLowerCase('ro')))}`,
    parcels,
  };
}

/** Everything the pages read, taken from storage in one go. A change writes storage and reads it again. */
export interface FarmState {
  mode: Mode;
  signedIn: boolean;
  /** The saved /api/me copy with the outbox applied. Always null in the demo. */
  me: MeFarm | null;
  /** The copy as the server sent it, without the outbox, to compare with a fresh one. */
  meSaved: MeFarm | null;
  /** When the copy was saved (ISO time), for the offline banner. */
  copyAt: string | null;
  /** The demo clock's day when it's set, otherwise today in Romania. */
  today: string;
  baseYear: number;
  /** docs/data plus the farm's own crops (P30). */
  farmData: AppData;
  /** Null in farm mode when there's no farm copy yet. */
  baseFarm: PageFarm | null;
  isIon: boolean;
  harvests: HarvestState | null;
  /** The pension a farm not on the server chose on Pensie, in bani. */
  ownPension: number | null;
  follows: string[];
  doneTasks: string[];
  outbox: OutboxItem[];
  refused: OutboxItem[];
  monitor: MonitorCopy | null;
  currency: CurrencyChoice;
}

function ownCrops(store: KeyStore, mode: Mode, me: MeFarm | null): OwnCrop[] {
  if (me) return me.harvests?.ownCrops ?? [];
  return readJson<{ ownCrops?: OwnCrop[] }>(store, farmKeys(mode).harvests)?.ownCrops ?? [];
}

function stringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

function savedPension(store: KeyStore, mode: Mode): number | null {
  const v = readText(store, farmKeys(mode).pension);
  return v === null ? null : Number.isInteger(+v) && +v >= 0 ? +v : null;
}

export function readFarmState(mode: Mode, store: KeyStore, base: AppData, now: Date): FarmState {
  const keys = farmKeys(mode);
  const signedIn = hasSession(store);
  const outbox = mode === 'farm' ? readOutbox(readJson(store, KEYS.outbox)) : [];
  const meSaved = mode === 'farm' ? readJson<MeFarm>(store, KEYS.me) : null;
  const me = meSaved ? withOutbox(meSaved, outbox) : null;
  const today = farmToday(me ?? {}, todayInRomania(now));
  const farmData = withOwnCrops(base, ownCrops(store, mode, me));
  const baseFarm = mode === 'demo' ? ionFarm(farmData) : me ? (farmForPages(me, farmData, today) as PageFarm) : null;
  const baseYear = harvestYear(today);
  return {
    mode,
    signedIn,
    me,
    meSaved,
    copyAt: mode === 'farm' ? readText(store, KEYS.meAt) : null,
    today,
    baseYear,
    farmData,
    baseFarm,
    isIon: mode === 'demo',
    harvests: baseFarm ? loadHarvests({ store, mode, me, baseYear, baseFarm, farmData }) : null,
    ownPension: me ? null : savedPension(store, mode),
    follows: me ? (meSaved?.opportunity_follows ?? []).map((f) => f.stable_key) : stringList(readJson(store, keys.follows)),
    doneTasks: me ? (me.task_completions ?? []).map((t) => t.task_id) : stringList(readJson(store, keys.done)),
    outbox,
    refused: mode === 'farm' ? readOutbox(readJson(store, KEYS.refused)) : [],
    monitor: me ? savedMonitor(store) : null,
    currency: loadCurrency(store),
  };
}
