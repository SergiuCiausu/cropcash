/* The map's colours (docs/harta-plan.md, step 7): warm pastels from color-palette-idea.jpg for the land,
   and for each crop a colour, a pattern and an icon, chosen by botanical genus so all of APIA's wheat
   lines look like wheat. These are drawing choices, not figures. */
import type { Crop } from '../../../packages/shared/src/data/index';

/** The base map: cream land, mint green, sky water, soft lavender buildings, navy text. */
export const LAND = {
  land: '#FBF6EC',
  farmland: '#F6EED9',
  green: '#D7EFD9',
  wood: '#C5E4C8',
  water: '#BFE0F4',
  waterLine: '#9CCBEA',
  sand: '#F5E9C9',
  building: '#EDE4F7',
  road: '#FFFFFF',
  roadCasing: '#E9DCCB',
  rail: '#D9CBE8',
  boundary: '#C9B8E6',
  text: '#2B3550',
  halo: '#FFFDF8',
  sky: '#CFE6F7',
  horizon: '#FDE7EF',
  fog: '#FBF1F5',
  shadow: '#B9A6CF',
  highlight: '#FFFFFF',
} as const;

/** Parcel outlines and the selected parcel. */
export const INK = { outline: '#2B3550', selected: '#7C5CFC', approx: '#6A5A8C' } as const;

export type Pattern = 'stripes' | 'dots' | 'ring' | 'none';

export interface CropLook {
  color: string;
  pattern: Pattern;
  /** An emoji; null draws no icon (fallow land). */
  icon: string | null;
}

interface Group {
  genera: string[];
  look: CropLook;
  /** A different icon for some genera of the group. */
  icons?: Record<string, string>;
}

const GROUPS: Group[] = [
  { genera: ['Triticum'], look: { color: '#F6D77A', pattern: 'stripes', icon: '🌾' } },
  { genera: ['Hordeum', 'Secale', 'Avena', 'Triticosecale', 'Oryza', 'Sorghum', 'Panicum', 'Fagopyrum', 'Chenopodium', 'Amaranthus'], look: { color: '#EFDCA4', pattern: 'stripes', icon: '🌾' } },
  { genera: ['Zea'], look: { color: '#F9C784', pattern: 'dots', icon: '🌽' } },
  { genera: ['Helianthus'], look: { color: '#FFE071', pattern: 'ring', icon: '🌻' } },
  { genera: ['Brassica', 'Sinapis', 'Camelina', 'Linum', 'Carthamus', 'Papaver', 'Ricinus', 'Sesanum', 'Cannabis', 'Humulus'], look: { color: '#E4EE8E', pattern: 'dots', icon: '🌼' } },
  { genera: ['Glycine', 'Pisum', 'Phaseolus', 'Vicia', 'Lens', 'Cicer', 'Vigna', 'Lupinus', 'Arachis', 'Lathyrus'], look: { color: '#BDE7C8', pattern: 'dots', icon: '🫘' } },
  {
    genera: ['Medicago', 'Trifolium', 'Onobrychis', 'Lotus', 'Melilotus', 'Galega', 'Trigonella', 'Phacelia', 'Dactylis', 'Festuca', 'Lolium', 'Phleum', 'Phalaris', 'Elytrigia', 'Agropyron cristatum', 'Bromus inermis', 'Poa pratensis', 'Miscanthus', 'Arundo'],
    look: { color: '#A9DDB4', pattern: 'stripes', icon: '🍀' },
  },
  {
    genera: ['Solanum', 'Capsicum', 'Cucumis', 'Citrullus', 'Raphanus', 'Cichorium', 'Cynara', 'Agaricus'],
    look: { color: '#F6B9A7', pattern: 'dots', icon: '🥬' },
    icons: { Solanum: '🥔', Capsicum: '🌶️', Cucumis: '🥒', Citrullus: '🍉', Agaricus: '🍄' },
  },
  { genera: ['Beta'], look: { color: '#F4B8C8', pattern: 'dots', icon: '🌱' } },
  {
    genera: ['Prunus', 'Malus', 'Pyrus', 'Cydonia', 'Juglans', 'Corylus', 'Castanea', 'Morus', 'Rubus', 'Ribes', 'Fragaria', 'Actinidia', 'Elaeagnus', 'Crataegus', 'Rosa'],
    look: { color: '#F7C6D9', pattern: 'ring', icon: '🍎' },
    icons: { Prunus: '🍑', Pyrus: '🍐', Juglans: '🌰', Corylus: '🌰', Castanea: '🌰', Fragaria: '🍓', Rubus: '🍓', Ribes: '🍓', Morus: '🍇', Actinidia: '🥝' },
  },
  { genera: ['Vitis'], look: { color: '#D8C7F4', pattern: 'ring', icon: '🍇' } },
  { genera: ['Lavandula', 'Mentha', 'Foeniculum', 'Coriandrum', 'Pimpinella', 'Dracocephalum', 'Nicotiana'], look: { color: '#E1D2F7', pattern: 'dots', icon: '🌿' } },
  {
    genera: ['Acer', 'Quercus', 'Tilia', 'Ulmus', 'Pinus', 'Picea', 'Robinia', 'Populus', 'Salix', 'Paulownia', 'Gleditsia', 'Aesculus', 'Euphorbia', 'Jatropha', 'Crotalaria'],
    look: { color: '#B9D3B0', pattern: 'none', icon: '🌳' },
  },
];

const BY_GENUS = new Map<string, CropLook>(GROUPS.flatMap((g) => g.genera.map((genus) => [genus, { ...g.look, icon: g.icons?.[genus] ?? g.look.icon }] as const)));

export const FALLOW: CropLook = { color: '#EDE6D6', pattern: 'none', icon: null };
/** For a parcel with no crop this year. */
export const NO_CROP: CropLook = { color: '#ECE8E1', pattern: 'none', icon: null };

/** Pastels for a crop whose genus isn't above, picked by its id so it keeps its colour. */
const SPARE = ['#F7C6D9', '#BDE7C8', '#FFE9A8', '#D8C7F4', '#BFE0F4', '#F9D3B4'];

export function cropLook(crop: Pick<Crop, 'id' | 'genus' | 'kind'> | undefined): CropLook {
  if (!crop) return NO_CROP;
  if (crop.kind === 'fallow') return FALLOW;
  const known = crop.genus ? BY_GENUS.get(crop.genus) : undefined;
  if (known) return known;
  let h = 0;
  for (const ch of crop.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { color: SPARE[h % SPARE.length]!, pattern: 'none', icon: '🌱' };
}

// ── Colour by result per hectare, or by the next piece of work ─────────────

const mix = (a: string, b: string, t: number) => {
  const n = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  const c = (i: number) => Math.round(n(a, i) + (n(b, i) - n(a, i)) * Math.min(1, Math.max(0, t)));
  return `#${[0, 1, 2].map((i) => c(i).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

export const RESULT = { none: '#E4E1EA', zero: '#F3EFE6', loss: '#EE7F9A', gain: '#5DBB7E' } as const;

/**
 * A loss in pink, a gain in green, stronger the further from zero, against the farm's own biggest
 * result per hectare (so no threshold has to be invented).
 */
export function resultColor(perHa: number | null, largest: number): string {
  if (perHa === null) return RESULT.none;
  if (perHa === 0 || largest <= 0) return RESULT.zero;
  const t = 0.35 + 0.65 * (Math.abs(perHa) / largest);
  return mix(RESULT.zero, perHa < 0 ? RESULT.loss : RESULT.gain, t);
}

export type TodoLevel = 'overdue' | 'soon' | 'later' | 'none';
export const TODO_COLORS: Record<TodoLevel, string> = { overdue: '#F28B82', soon: '#FFD966', later: '#C9B8F5', none: '#E4E1EA' };
