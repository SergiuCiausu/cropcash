'use client';
/* The salary with another monthly pension, or none (what_if_pension). Saves nothing. */
import type { CardData } from '../../../packages/shared/src/functions/cards';
import { Money } from '../app/bits';

export function PensionChangeCard({ data }: { data: CardData<'pension_change'> }) {
  const { monthly, pensionBefore, paidBefore, salaryAfter, minimum, minimumVerified, underMinimum } = data;
  const title = pensionBefore === 0 ? (monthly === 0 ? 'Fără pensie' : 'Dacă începi pensia') : monthly === 0 ? 'Dacă oprești pensia' : 'Dacă schimbi pensia';
  return (
    <>
      <p className="eyebrow">{title}</p>
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
            <th scope="row">Pensia pe lună</th>
            <td>
              <Money bani={pensionBefore} />
            </td>
            <td>
              <Money bani={monthly} />
            </td>
          </tr>
          <tr>
            <th scope="row">Salariul pe lună</th>
            <td>
              <Money bani={paidBefore} />
            </td>
            <td>
              <Money bani={salaryAfter} />
            </td>
          </tr>
        </tbody>
      </table>
      {underMinimum && (
        <p className="ask-card-warn" role="note">
          Suma e sub minimul fondului, de <Money bani={minimum} /> pe lună{minimumVerified ? '' : ' (neconfirmat)'}.
        </p>
      )}
      <p className="ask-card-note">Nu se schimbă nimic până nu apeși pe pagina Pensie.</p>
    </>
  );
}
