/* Every shared app page. `satisfies` makes a page missing here a type error. */
import { acasa } from './acasa';
import { bani } from './bani';
import { calendar } from './calendar';
import { datePlan } from './date-plan';
import { oportunitati } from './oportunitati';
import { pensie } from './pensie';
import { prognoza } from './prognoza';
import { recolte } from './recolte';
import { salariu } from './salariu';
import { subventii } from './subventii';
import { surse } from './surse';
import type { ScreenDef, ScreenName } from './types';

export type { ScreenDef, ScreenName } from './types';

export const SCREENS = {
  acasa,
  subventii,
  oportunitati,
  surse,
  calendar,
  prognoza,
  recolte,
  salariu,
  pensie,
  'date-plan': datePlan,
  bani,
} satisfies Record<ScreenName, ScreenDef>;
