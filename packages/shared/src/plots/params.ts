import paramsJson from '../../../../docs/data/plots-params.json';
import { PlotsParamsSchema, type PlotsParams } from './model';

let cached: PlotsParams | undefined;

/** docs/data/plots-params.json, checked once. */
export function loadPlotsParams(): PlotsParams {
  return (cached ??= PlotsParamsSchema.parse(paramsJson));
}
