'use client';
/* "Pot să-mi iau…?": what one purchase changes. It shows the effect only, never a yes or no. */
import type { CardData } from '../../../packages/shared/src/functions/cards';
import { Money } from '../app/bits';
import { monthName } from './words';

export function PurchaseCard({ data }: { data: CardData<'purchase'> }) {
  const { amount, month, salaryBefore, salaryAfter, lowestBefore, lowestAfter, goesShort } = data;
  const salaryDrop = salaryBefore - salaryAfter;
  return (
    <>
      <p className="eyebrow">Dacă cumperi în {monthName(month)}</p>
      <p className="ask-card-big">
        <Money bani={amount} />
      </p>
      <table className="ask-compare">
        <thead>
          <tr>
            <td />
            <th scope="col">Acum</th>
            <th scope="col">După</th>
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
          <tr>
            <th scope="row">Cei mai puțini bani în cont</th>
            <td>
              <Money bani={lowestBefore.balance} as="signed" />
              <small>{monthName(lowestBefore.key)}</small>
            </td>
            <td className={lowestAfter.balance < 0 ? 'ask-neg' : undefined}>
              <Money bani={lowestAfter.balance} as="signed" />
              <small>{monthName(lowestAfter.key)}</small>
            </td>
          </tr>
        </tbody>
      </table>
      {salaryDrop > 0 ? (
        <p className="ask-card-note">
          Salariul scade cu <Money bani={salaryDrop} /> pe lună.
        </p>
      ) : (
        <p className="ask-card-note">Salariul rămâne la fel.</p>
      )}
      {goesShort && (
        <p className="ask-card-warn" role="note">
          În {monthName(lowestAfter.key)} ți-ar lipsi bani în cont.
        </p>
      )}
    </>
  );
}
