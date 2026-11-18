'use client';
/* Decision D3 (docs/employees-arenda-plan.md §1.3): the farm's own people do the field work, but a crop
   still plans with the average cost per ha, which pays someone else for that work. The card sends the
   farmer to their own cost per ha on Datele planului. The app never cuts a guessed share out of the
   average. Read from the copy on the phone, so it shows offline too. */
import { cropsNeedingOwnCost } from '../../../packages/shared/src/payroll/index';
import type { StoredFarm } from '../../../packages/shared/src/farm/index';
import { useFarm, useView } from '../../lib/cc/react';
import { useHref } from './bits';
import { PageLink } from './Frame';

const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} și ${names[names.length - 1]}`);

export function OwnCostCard() {
  const farm = useFarm()!;
  const view = useView('farm');
  const href = useHref();
  const me = farm.me;
  if (!me || !view || me.own_field_work !== true) return null;
  const ids = cropsNeedingOwnCost(
    { parcels: me.parcels as StoredFarm['parcels'], harvests: { years: [], gathered: [], expected: view.harvests.expected } as unknown as StoredFarm['harvests'], own_field_work: true },
    view.data(),
  );
  if (ids.length === 0) return null;
  return (
    <section className="card s12" aria-labelledby="own-cost">
      <div className="card-h">
        <h2 id="own-cost">Costul pe hectar al fermei tale</h2>
      </div>
      <p className="note">
        Ai spus că lucrările pe câmp le fac oamenii tăi. La {list(ids.map((id) => view.cropName(id).toLowerCase()))} planul folosește încă media, care
        socotește și plata altcuiva pentru arat, semănat și recoltat. Salariile oamenilor sunt deja în plan, așa că munca lor ar fi socotită de
        două ori. Scrie costul tău pe hectar, fără munca lor.
      </p>
      <div className="ob-actions">
        <PageLink className="btn btn-dark" path="/date-plan" href={href('/date-plan')}>
          Scrie costul pe hectar
        </PageLink>
      </div>
    </section>
  );
}
