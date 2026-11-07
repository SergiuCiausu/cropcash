import subsidiesJson from '../../../../docs/data/subsidies-2026.json';
import historyJson from '../../../../docs/data/subsidies-history.json';
import calendarJson from '../../../../docs/data/calendar-2026.json';
import cropsJson from '../../../../docs/data/crops-reference.json';
import {
  CalendarFileSchema,
  CropsFileSchema,
  HistoryFileSchema,
  SubsidiesFileSchema,
  type CalendarFile,
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
    };
  }
  return cached;
}
