'use client';
/* Acasă: the next deadline from „De raportat” when it's close (plan-params obligation_due_days). */
import { useMemo } from 'react';
import { dueSoon } from '../../../packages/shared/src/obligations/index';
import { date, zile } from '../../lib/cc/format';
import { farmObligations } from '../../lib/cc/obligations';
import { useFarm, useView } from '../../lib/cc/react';
import { useHref } from './bits';
import { PageLink } from './Frame';

export function ReportingDue() {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const href = useHref();
  const due = useMemo(() => {
    const ob = farmObligations(view, farm);
    return dueSoon(ob.upcoming, ob.dueDays).filter((i) => i.open);
  }, [view, farm]);
  const first = due[0];
  if (!first) return null;
  const when = first.daysLeft === 0 ? 'azi' : `în ${zile(first.daysLeft)}`;
  return (
    <section className="card s12 pp-warn" role="status" aria-labelledby="ac-reporting">
      <h2 id="ac-reporting">De depus {when}: {first.titleRo.charAt(0).toLocaleLowerCase('ro') + first.titleRo.slice(1)}</h2>
      <p className="note">
        Până pe {date(first.end, true)}.
        {due.length > 1 ? ` Mai ai ${due.length === 2 ? 'un termen' : `${due.length - 1} termene`} în curând.` : ''}{' '}
        <PageLink path="/de-raportat" href={href('/de-raportat')}>
          Vezi ce duci
        </PageLink>
      </p>
    </section>
  );
}
