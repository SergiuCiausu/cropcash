/* How firm a status is, and which part of the app a file belongs to (docs/admin-verificari-plan.md).
   One place for both, so the page, the API and the tests agree. */

/** check: marked DE-VERIFICAT. weak: from the press, an unofficial site, a brief or a proposal. assumption: our own choice. */
export type VerifyLevel = 'check' | 'weak' | 'assumption';
export const VERIFY_LEVELS: readonly VerifyLevel[] = ['check', 'weak', 'assumption'];

const LEVEL_OF: Readonly<Record<string, VerifyLevel>> = {
  'DE-VERIFICAT': 'check',
  'din-presă': 'weak',
  'din-sursă-neoficială': 'weak',
  'din-documentatie': 'weak',
  'din-brief': 'weak',
  parțial: 'weak',
  propunere: 'weak',
  presupunere: 'assumption',
};

/** The level of a status; null for a firm one (confirmat, oficial, din-2025…) or one that isn't about facts (done, setare). */
export const levelOf = (status: string): VerifyLevel | null => LEVEL_OF[status] ?? null;

/** A status that counts as checked: an item whose file status became one of these is done. */
export const isFirmStatus = (status: string) => !(status in LEVEL_OF);

export type VerifyArea = 'subsidies' | 'taxes' | 'fuel' | 'arenda' | 'calendar' | 'pension' | 'crops' | 'contracts' | 'map' | 'plan' | 'questions';

export const AREA_OF_FILE: Readonly<Record<string, VerifyArea>> = {
  'subsidies-2026.json': 'subsidies',
  'subsidies-history.json': 'subsidies',
  'apia-coupled.json': 'subsidies',
  'apia-papers.json': 'subsidies',
  'livestock.json': 'subsidies',
  'vat-2026.json': 'taxes',
  'contract-taxes-2026.json': 'taxes',
  'anaf-efactura.json': 'taxes',
  'oblio.json': 'taxes',
  'fuel-excise.json': 'fuel',
  'excise-schemes.json': 'fuel',
  'arenda-prices-2026.json': 'arenda',
  'calendar-2026.json': 'calendar',
  'pension-funds.json': 'pension',
  'pension-options.json': 'pension',
  'crops-reference.json': 'crops',
  'apia-crop-codes.json': 'crops',
  'fertilizers.json': 'crops',
  'nitrogen-limits.json': 'crops',
  'contract-types.json': 'contracts',
  'plots-params.json': 'map',
  'lpis.json': 'map',
  'counties.json': 'plan',
  'plan-params.json': 'plan',
};

export const areaOfFile = (file: string): VerifyArea => AREA_OF_FILE[file] ?? 'plan';
