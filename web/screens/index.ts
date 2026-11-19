/* Every shared app page. `satisfies` makes a page missing here a type error. */
import { acasa } from './acasa';
import { admin } from './admin';
import { bani } from './bani';
import { calendar } from './calendar';
import { datePlan } from './date-plan';
import { oportunitati } from './oportunitati';
import { pensie } from './pensie';
import { prognoza } from './prognoza';
import { harta } from './harta';
import { oameni } from './oameni';
import { arenda } from './arenda';
import { contracte } from './contracte';
import { rapoarte } from './rapoarte';
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
  rapoarte,
  harta,
  admin,
  oameni,
  arenda,
  contracte,
} satisfies Record<ScreenName, ScreenDef>;
