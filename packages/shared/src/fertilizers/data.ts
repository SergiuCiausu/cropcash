import fertilizersJson from '../../../../docs/data/fertilizers.json';
import nitrogenLimitsJson from '../../../../docs/data/nitrogen-limits.json';
import { FertilizersFileSchema, NitrogenLimitsFileSchema, type FertilizersFile, type NitrogenLimitsFile } from './model';

export interface FertilizerData {
  /** The seed catalogue. The live one (with products editors added) comes from GET /api/fertilizers. */
  catalogue: FertilizersFile;
  limits: NitrogenLimitsFile;
}

let cached: FertilizerData | null = null;

/** Parses and validates docs/data/fertilizers.json and nitrogen-limits.json once. */
export function loadFertilizerData(): FertilizerData {
  cached ??= {
    catalogue: FertilizersFileSchema.parse(fertilizersJson),
    limits: NitrogenLimitsFileSchema.parse(nitrogenLimitsJson),
  };
  return cached;
}
