'use client';
/* „De hotărât” on Acasă (docs/contracts-plan.md §3.4): the contract whose last day to act is the closest, and how many
   more wait. Nothing when no contract is due. Read from the contracts on the phone, so it shows offline too. */
import { useMemo } from 'react';
import { contractViews, contractWindow, dueLine, kindName, toDecide, uninsured } from '../../lib/cc/contracts';
import { useFarm, useView } from '../../lib/cc/react';
import { useHref } from './bits';
import { PageLink } from './Frame';
import '../../styles/people.css';

export function ContractsDue() {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const href = useHref();
  const data = view.data();
  const today = view.today;
  const due = useMemo(() => toDecide(contractViews(farm.contracts, data, contractWindow(today, data.params.forecast.plan_months.value)), today), [farm.contracts, data, today]);
  const first = due[0];
  if (!first) return null;
  const late = first.end.status === 'overdue' || uninsured(first, today);
  return (
    <section className={`card s12${late ? ' pp-warn' : ''}`} role="status" aria-labelledby="ac-contracts">
      <h2 id="ac-contracts">
        De hotărât: {kindName(data, first.kind).toLocaleLowerCase('ro')} cu {first.party}
      </h2>
      <p className="note">
        {dueLine(first, today)}
        {due.length > 1 ? ` Mai ai ${due.length === 2 ? 'un contract' : `${due.length - 1} contracte`} de hotărât.` : ''}{' '}
        <PageLink path="/contracte" href={href('/contracte')}>
          Vezi contractele
        </PageLink>
      </p>
    </section>
  );
}
