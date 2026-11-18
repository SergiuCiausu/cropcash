'use client';
/* What a credit would change (what_if_credit). Information only: no bank, no offer, no advice. */
import type { CardData } from '../../../packages/shared/src/functions/cards';
import { Money } from '../app/bits';
import { monthName } from './words';

export function CreditCard({ data }: { data: CardData<'credit'> }) {
  const { amount, salaryBefore, salaryAfter, capacity, withinLimit, availableFrom, inTime } = data;
  return (
    <>
      <p className="eyebrow">Dacă iei un credit</p>
      <p className="ask-card-big">
        <Money bani={amount} />
      </p>
      <table className="ask-compare">
        <thead>
          <tr>
            <td />
            <th scope="col">Acum</th>
            <th scope="col">Cu credit</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Salariul pe lună</th>
            <td>
              <Money bani={salaryBefore} />
            </td>
            <td>
              <Money bani={salaryAfter} />
            </td>
          </tr>
        </tbody>
      </table>
      <dl className="ask-card-facts">
        <dt>Cel mult, pe adeverința APIA</dt>
        <dd>
          <Money bani={capacity} />
        </dd>
        {availableFrom && (
          <>
            <dt>Adeverința se poate lua din</dt>
            <dd>{monthName(availableFrom)}</dd>
          </>
        )}
      </dl>
      {!withinLimit && (
        <p className="ask-card-warn" role="note">
          Suma e mai mare decât se poate lua pe adeverința APIA.
        </p>
      )}
      {!inTime && (
        <p className="ask-card-warn" role="note">
          {availableFrom ? `Creditul pe adeverință se poate lua abia din ${monthName(availableFrom)}.` : 'Nu se știe încă din ce lună se poate lua adeverința.'}
        </p>
      )}
    </>
  );
}
