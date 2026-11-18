/*
 * A crop the farmer typed in themselves (P30) before the APIA list was in the app may now be on it
 * (docs/crops-catalog-plan.md, step 11). The app offers once to link it to that line: the crop keeps its
 * id and the farmer's figures, and takes APIA's name and code. Nothing in the stored data is rewritten
 * without the farmer's tap.
 */
import { foldRo, type CatalogueCrop } from '../data/catalogue';
import type { OwnCrop } from './harvests';

/** At most this many lines are offered: more than that and the name doesn't say which crop it is. */
export const MAX_OWN_MATCHES = 4;

/**
 * The catalogue lines an own crop's name stands for, best first: lines named exactly that, otherwise
 * lines whose name starts with it as whole words („Orzoaică” → de toamnă, de primăvară). Lines in `taken`
 * (crops already on the farm) are left out. Empty when the crop already has a line or nothing fits well
 * enough to ask.
 */
export function ownCropMatches(own: Pick<OwnCrop, 'name' | 'apiaCode'>, catalogue: readonly CatalogueCrop[], taken: readonly string[] = []): CatalogueCrop[] {
  if (own.apiaCode) return [];
  const name = foldRo(own.name);
  if (!name) return [];
  const lines = catalogue.filter((c) => !taken.includes(c.id) && c.kind !== 'other');
  const texts = (c: CatalogueCrop) => [c.name_ro, c.apia_name, ...c.aliases].map(foldRo);
  const words = name.split(' ');
  const tiers = [
    (t: string) => t === name,
    (t: string) => t.startsWith(`${name} `),
    // „Grâu de primăvară” → Grâu comun de primăvară, Grâu dur de primăvară.
    (t: string) => words.every((w) => t.split(' ').includes(w)),
  ];
  for (const fits of tiers) {
    const found = lines.filter((c) => texts(c).some(fits));
    if (found.length) return few(found);
  }
  return [];
}

/**
 * A short list or none. Past the limit, mixtures („Rapiță + triticale”) and energy crops go first: a farmer
 * who writes „Rapiță” means the crop itself.
 */
function few(lines: CatalogueCrop[]): CatalogueCrop[] {
  if (lines.length <= MAX_OWN_MATCHES) return lines;
  const mixed = (c: CatalogueCrop) => c.apia_name.includes('+') || /amestec|energetic/.test(foldRo(`${c.heading ?? ''} ${c.apia_name}`));
  const plain = lines.filter((c) => !mixed(c));
  return plain.length && plain.length <= MAX_OWN_MATCHES ? plain : [];
}

/** Links an own crop to a line on a draft of the harvests: APIA's name and code, the figures kept. */
export function linkOwnCrop(own: OwnCrop, line: Pick<CatalogueCrop, 'code' | 'name_ro'>): OwnCrop {
  return { ...own, name: line.name_ro, apiaCode: line.code };
}
