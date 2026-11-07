import subsidiesJson from '../../../../docs/data/subsidies-2026.json';
import historyJson from '../../../../docs/data/subsidies-history.json';
import calendarJson from '../../../../docs/data/calendar-2026.json';
import cropsJson from '../../../../docs/data/crops-reference.json';
import countiesJson from '../../../../docs/data/counties.json';
import planParamsJson from '../../../../docs/data/plan-params.json';
import pensionFundsJson from '../../../../docs/data/pension-funds.json';
import pensionOptionsJson from '../../../../docs/data/pension-options.json';
import fundingGuidesJson from '../../../../docs/data/funding-guides.json';
import {
  CalendarFileSchema,
  CountiesFileSchema,
  FundingGuidesFileSchema,
  PensionFundsFileSchema,
  PensionOptionsFileSchema,
  PlanParamsFileSchema,
  CropsFileSchema,
  HistoryFileSchema,
  SubsidiesFileSchema,
  type CalendarFile,
  type CountiesFile,
  type FundingGuidesFile,
  type PensionFundsFile,
  type PensionOptionsFile,
  type PlanParamsFile,
  type CropsFile,
  type HistoryFile,
  type SubsidiesFile,
} from './schemas';

export * from './schemas';

/** All reference data from docs/data, validated. The single source of figures. */
export interface AppData {
  subsidies: SubsidiesFile;
  history: HistoryFile;
  calendar: CalendarFile;
  crops: CropsFile;
  counties: CountiesFile;
  params: PlanParamsFile;
  pensionFunds: PensionFundsFile;
  pensionOptions: PensionOptionsFile;
  fundingGuides: FundingGuidesFile;
}

let cached: AppData | null = null;

/** Parses and validates docs/data/*.json once. Throws if any file is malformed. */
export function loadData(): AppData {
  if (!cached) {
    cached = {
      subsidies: SubsidiesFileSchema.parse(subsidiesJson),
      history: HistoryFileSchema.parse(historyJson),
      calendar: CalendarFileSchema.parse(calendarJson),
      crops: CropsFileSchema.parse(cropsJson),
      counties: CountiesFileSchema.parse(countiesJson),
      params: PlanParamsFileSchema.parse(planParamsJson),
      pensionFunds: PensionFundsFileSchema.parse(pensionFundsJson),
      pensionOptions: PensionOptionsFileSchema.parse(pensionOptionsJson),
      fundingGuides: FundingGuidesFileSchema.parse(fundingGuidesJson),
    };
  }
  return cached;
}
