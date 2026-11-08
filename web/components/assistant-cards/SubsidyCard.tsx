'use client';
/* The APIA subsidy (estimate_subsidy): always a range, never a promise, unless the farmer saved APIA's decision. */
import type { CardData } from '../../../packages/shared/src/functions/cards';
import { Money } from '../app/bits';

export function SubsidyCard({ data }: { data: CardData<'subsidy'> }) {
  const { totals, schemes, decision } = data;
  const same = totals.lei.min === totals.lei.max;
  return (
    <>
      <p className="eyebrow">{decision ? `Subvenția APIA ${decision.campaignYear}, din decizia ta` : 'Subvenția APIA, estimată'}</p>
      {same ? (
        <p className="ask-card-big">
          <Money bani={totals.lei.probable} />
        </p>
      ) : (
        <>
          <p className="ask-card-big">
            <Money bani={totals.lei.probable} /> <span>cel mai probabil</span>
          </p>
          <p className="ask-card-note">
            Între <Money bani={totals.lei.min} /> și <Money bani={totals.lei.max} />. Suma o hotărăște APIA.
          </p>
        </>
      )}
      <dl className="ask-card-facts">
        <dt>Avansul</dt>
        <dd>
          <Money bani={totals.advanceLei} />
        </dd>
        <dt>Restul</dt>
        <dd>
          <Money bani={totals.balanceLei.probable} />
        </dd>
      </dl>
      {schemes.length > 0 && (
        <details className="ask-card-more">
          <summary>Vezi pe scheme</summary>
          <table className="ask-compare">
            <tbody>
              {schemes.map((s) => (
                <tr key={s.code}>
                  <th scope="row">{s.nameRo}</th>
                  <td>
                    <Money bani={s.leiIndicative.probable} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}
