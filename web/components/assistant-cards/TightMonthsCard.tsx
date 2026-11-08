'use client';
/* The hardest months, before any salary (get_tight_months). */
import type { CardData } from '../../../packages/shared/src/functions/cards';
import { Money } from '../app/bits';
import { monthName } from './words';

export function TightMonthsCard({ data }: { data: CardData<'tight_months'> }) {
  const { months, lowest, missing, spring } = data;
  return (
    <>
      <p className="eyebrow">Lunile grele</p>
      {months.length ? (
        <p className="ask-card-note">
          {months.length === 1 ? `Luna grea e ${monthName(months[0])}.` : `De la ${monthName(months[0])} până în ${monthName(months.at(-1)!)} ies mai mulți bani decât intră.`}
        </p>
      ) : (
        <p className="ask-card-note">Nicio lună nu iese pe minus.</p>
      )}
      <dl className="ask-card-facts">
        <dt>Cei mai puțini bani</dt>
        <dd className={lowest.balance < 0 ? 'ask-neg' : undefined}>
          <Money bani={lowest.balance} as="signed" /> <small>în {monthName(lowest.key)}</small>
        </dd>
        {spring.need > 0 && (
          <>
            <dt>Cheltuieli în lunile grele</dt>
            <dd>
              <Money bani={spring.need} />
            </dd>
            <dt>Bani în cont înainte de ele</dt>
            <dd>
              <Money bani={spring.available} />
            </dd>
          </>
        )}
      </dl>
      {missing > 0 && (
        <p className="ask-card-warn" role="note">
          Îți lipsesc <Money bani={missing} /> în {monthName(lowest.key)}, chiar fără salariu.
        </p>
      )}
    </>
  );
}
