'use client';
/* The safe monthly salary and why it isn't higher (explain_salary). */
import type { CardData } from '../../../packages/shared/src/functions/cards';
import { Money } from '../app/bits';
import { monthName } from './words';

export function SalaryCard({ data }: { data: CardData<'salary'> }) {
  const { salary, reason, limitingMonth, monthsUntilLimit, availableByThen, setAside } = data;
  return (
    <>
      <p className="eyebrow">Salariul tău sigur</p>
      <p className="ask-card-big">
        <Money bani={salary} /> <span>pe lună</span>
      </p>
      {reason === 'money_runs_out' && (
        <p className="ask-card-warn" role="note">
          Banii nu ajung până în {monthName(limitingMonth)}, nici fără salariu.
        </p>
      )}
      {reason === 'tight_month' && (
        <p className="ask-card-note">
          Nu poate fi mai mare din cauza lui {monthName(limitingMonth)}: până atunci ai <Money bani={availableByThen} /> pentru{' '}
          {monthsUntilLimit === 1 ? 'o lună' : `${monthsUntilLimit} luni`}.
        </p>
      )}
      {reason === 'end_of_plan' && <p className="ask-card-note">Banii ajung pentru toate lunile din plan.</p>}
      {setAside.pensionMonthly > 0 && (
        <p className="ask-card-note">
          Pentru pensie se pun deoparte <Money bani={setAside.pensionMonthly} /> pe lună, înainte de salariu.
        </p>
      )}
    </>
  );
}
