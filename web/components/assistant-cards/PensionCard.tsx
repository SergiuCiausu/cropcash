'use client';
/* How a monthly pension amount could grow until 65 (simulate_pension). A simulation, never advice. */
import type { CardData } from '../../../packages/shared/src/functions/cards';
import { num } from '../../lib/cc/format';
import { Money } from '../app/bits';

export function PensionCard({ data }: { data: CardData<'pension'> }) {
  const { age, targetAge, months, paidIn, results, minimum, minimumVerified, belowMinimum } = data;
  const monthly = Math.round(paidIn / months);
  return (
    <>
      <p className="eyebrow">Pensia: o simulare</p>
      <p className="ask-card-note">
        Dacă pui <Money bani={monthly} /> pe lună de la {age} la {targetAge} de ani, plătești în total <Money bani={paidIn} />.
      </p>
      <table className="ask-compare">
        <thead>
          <tr>
            <th scope="col" className="ask-left">
              Dacă banii cresc pe an cu
            </th>
            <th scope="col">La {targetAge} de ani</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.returnPct}>
              <th scope="row">{num(r.returnPct)}%</th>
              <td>
                <Money bani={r.total} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ask-card-note">Creșterile sunt doar exemple. Nimeni nu le poate promite.</p>
      {belowMinimum && (
        <p className="ask-card-warn" role="note">
          Suma e sub minimul fondului, de <Money bani={minimum} /> pe lună{minimumVerified ? '' : ' (neconfirmat)'}.
        </p>
      )}
    </>
  );
}
