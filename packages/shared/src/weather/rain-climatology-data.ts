import rainJson from '../../../../docs/data/rain-climatology.json';
import { RainClimatologySchema, type RainClimatology } from './rain-climatology';

/**
 * docs/data/rain-climatology.json, validated once. Kept out of the package index on purpose: it's
 * ~230 KB for 42 counties, so only the API and the screens that show rain import it (`@cropcash/shared/rain-climatology`).
 */
let parsed: RainClimatology | null = null;
export function loadRainClimatology(): RainClimatology {
  parsed ??= RainClimatologySchema.parse(rainJson);
  return parsed;
}
