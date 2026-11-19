/* „De raportat” for one farm: the deadlines ahead and the diesel quarter so far. Everything comes from
   docs/data (bundled) and the records on the phone, so it works offline and on Ion's farm. */
import fuelJson from '../../../docs/data/fuel-excise.json';
import { isFallow } from '../../../packages/shared/src/data/schemas';
import { fuelQuarterStatus, upcomingObligations } from '../../../packages/shared/src/obligations/index';
import { fuelCapCl, FuelExciseSchema, periodOf, recordsInPeriod, type CapParcel } from '../../../packages/shared/src/reports/index';
import type { FarmState } from './farm';
import type { FarmView } from './plan';

/** docs/data/fuel-excise.json, checked once. */
export const FUEL = FuelExciseSchema.parse(fuelJson);

export function farmObligations(view: FarmView, state: Pick<FarmState, 'harvests'>) {
  const data = view.data();
  const today = view.today;
  const parcels = view.farm.parcels;
  const list = upcomingObligations({
    calendar: data.calendar,
    fuel: FUEL,
    today,
    hasFallow: parcels.some((p) => isFallow(p.cropId)),
    horizonDays: data.params.obligation_horizon_days.value!,
  });
  const capParcels: CapParcel[] = parcels.map((p) => {
    const line = data.catalogue.find((c) => c.id === p.cropId);
    return { code: line?.code ?? null, heading: line?.heading ?? null, section: line?.section ?? null, areaHa: p.areaHa, name: view.cropName(p.cropId) || p.cropId };
  });
  const cap = fuelCapCl(capParcels, FUEL.caps_l_per_ha);
  const records = recordsInPeriod(periodOf('year', today.slice(0, 4)), state.harvests?.items ?? []);
  return {
    ...list,
    fuel: fuelQuarterStatus(records, FUEL, today, parcels.length ? cap.capCl : null),
    /** Crops on the farm with no litre cap in the law's annex. */
    uncapped: cap.uncapped,
    records: data.calendar.records ?? null,
    dueDays: data.params.obligation_due_days.value!,
  };
}
export type FarmObligations = ReturnType<typeof farmObligations>;
