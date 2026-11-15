/* docs/data/siruta-tr-ct.json as places by code, read once. The file ships with the app (step 1b). */
import trCt from '../../../../docs/data/siruta-tr-ct.json';
import { placesFromFile, type Place } from './siruta';

let byCode: Map<number, Place> | null = null;
/** The places of Teleorman and Constanța, by SIRUTA code. */
export const placesTrCt = (): ReadonlyMap<number, Place> => (byCode ??= placesFromFile(trCt));
