import subsidiesJson from '../../../../docs/data/subsidies-2026.json';
import historyJson from '../../../../docs/data/subsidies-history.json';
import calendarJson from '../../../../docs/data/calendar-2026.json';
import cropsJson from '../../../../docs/data/crops-reference.json';
import apiaCropsJson from '../../../../docs/data/apia-crop-codes.json';
import countiesJson from '../../../../docs/data/counties.json';
import planParamsJson from '../../../../docs/data/plan-params.json';
import pensionFundsJson from '../../../../docs/data/pension-funds.json';
import pensionOptionsJson from '../../../../docs/data/pension-options.json';
import fundingGuidesJson from '../../../../docs/data/funding-guides.json';
import arendaJson from '../../../../docs/data/arenda-prices-2026.json';
import contractTypesJson from '../../../../docs/data/contract-types.json';
import contractTaxesJson from '../../../../docs/data/contract-taxes-2026.json';
import exciseJson from '../../../../docs/data/excise-schemes.json';
import fuelJson from '../../../../docs/data/fuel-excise.json';
import { ArendaPricesSchema, type ArendaPrices } from '../arenda/prices';
import { ContractTypesSchema, type ContractTypes } from '../contracts/types';
import { ContractTaxesSchema, type ContractTaxes } from '../contracts/taxes';
import {
  CalendarFileSchema,
  CountiesFileSchema,
  FundingGuidesFileSchema,
  PensionFundsFileSchema,
  PensionOptionsFileSchema,
  PlanParamsFileSchema,
  CropsFileSchema,
  ApiaCropTableSchema,
  HistoryFileSchema,
  SubsidiesFileSchema,
  type CalendarFile,
  type CountiesFile,
  type FundingGuidesFile,
  type PensionFundsFile,
  type PensionOptionsFile,
  type PlanParamsFile,
  type CropsFile,
  type ApiaCropTable,
  type HistoryFile,
  type SubsidiesFile,
} from './schemas';
import { ExciseSchemesFileSchema, type ExciseSchemesFile } from './excise';
import { FuelExciseSchema, type FuelExcise } from '../reports/fuel';
import { buildCatalogue, expandCropFamilies, type CatalogueCrop } from './catalogue';

/** All reference data from docs/data, validated. The single source of figures. */
export interface AppData {
  subsidies: SubsidiesFile;
  history: HistoryFile;
  calendar: CalendarFile;
  /** Crops with figures. A crop with several APIA codes is one crop per code (data/catalogue.ts). */
  crops: CropsFile;
  /** APIA Tabel 1, as printed. */
  apiaTable: ApiaCropTable;
  /** Every APIA crop, with or without figures, named as APIA names it. */
  catalogue: CatalogueCrop[];
  counties: CountiesFile;
  params: PlanParamsFile;
  pensionFunds: PensionFundsFile;
  pensionOptions: PensionOptionsFile;
  fundingGuides: FundingGuidesFile;
  /** The tax on rent and the county prices for rent in kind (docs/15-arenda.md). */
  arenda: ArendaPrices;
  /** How each kind of contract ends, its default notice and reminder days (docs/16-contracts-law.md). */
  contractTypes: ContractTypes;
  /** The taxes to the state contracts bring: VAT, micro tax, land tax (docs/16-contracts-law.md §6). */
  contractTaxes: ContractTaxes;
  /** The excise schemes a farmer can use; only a refund counts as revenue (docs/accize-plan.md). */
  excise: ExciseSchemesFile;
  /** The diesel refund: rates by day, caps per ha, deadlines (docs/04-farmer-reports.md §1). */
  fuel: FuelExcise;
}

/**
 * docs/data/*.json exactly as written, before any check, keyed by their AppData name. The admin
 * panel's changes are made to these (data/overrides.ts), so they go through the same checks.
 */
export const RAW_FILES = {
  subsidies: subsidiesJson,
  history: historyJson,
  calendar: calendarJson,
  crops: cropsJson,
  apiaTable: apiaCropsJson,
  counties: countiesJson,
  params: planParamsJson,
  pensionFunds: pensionFundsJson,
  pensionOptions: pensionOptionsJson,
  fundingGuides: fundingGuidesJson,
  arenda: arendaJson,
  contractTypes: contractTypesJson,
  contractTaxes: contractTaxesJson,
  excise: exciseJson,
  fuel: fuelJson,
} as const;

export type FileName = keyof typeof RAW_FILES;
export type RawFiles = { readonly [K in FileName]: unknown };
export const FILE_NAMES = Object.keys(RAW_FILES) as FileName[];

/** Parses and validates the files and derives what's derived. Throws if any file is malformed. */
export function buildData(raw: RawFiles): AppData {
  const apiaTable = ApiaCropTableSchema.parse(raw.apiaTable);
  const cropsFile = CropsFileSchema.parse(raw.crops);
  const crops = { ...cropsFile, crops: expandCropFamilies(cropsFile.crops, apiaTable) };
  return {
    subsidies: SubsidiesFileSchema.parse(raw.subsidies),
    history: HistoryFileSchema.parse(raw.history),
    calendar: CalendarFileSchema.parse(raw.calendar),
    crops,
    apiaTable,
    catalogue: buildCatalogue(apiaTable, crops.crops),
    counties: CountiesFileSchema.parse(raw.counties),
    params: PlanParamsFileSchema.parse(raw.params),
    pensionFunds: PensionFundsFileSchema.parse(raw.pensionFunds),
    pensionOptions: PensionOptionsFileSchema.parse(raw.pensionOptions),
    fundingGuides: FundingGuidesFileSchema.parse(raw.fundingGuides),
    arenda: ArendaPricesSchema.parse(raw.arenda),
    contractTypes: ContractTypesSchema.parse(raw.contractTypes),
    contractTaxes: ContractTaxesSchema.parse(raw.contractTaxes),
    excise: ExciseSchemesFileSchema.parse(raw.excise),
    fuel: FuelExciseSchema.parse(raw.fuel),
  };
}

let cached: AppData | null = null;

/** Parses and validates docs/data/*.json once. Throws if any file is malformed. */
export function loadData(): AppData {
  if (!cached) cached = buildData(RAW_FILES);
  return cached;
}
