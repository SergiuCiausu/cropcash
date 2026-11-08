'use client';
/* The next 12 months (get_forecast): money left at the end of each month, then the figures by month.
   Plain SVG, not Recharts: it draws at once, offline too, with no library to load inside the sheet. */
import type { CardData } from '../../../packages/shared/src/functions/cards';
import { useMoney } from '../../lib/cc/react';
import { Money } from '../app/bits';
import { monthName, monthShort, SCENARIO } from './words';

const W = 320;
const H = 140;
const PAD_TOP = 8;
const PAD_BOTTOM = 22;

export function MonthsCard({ data }: { data: CardData<'months'> }) {
  const { scenario, months, endBalance, lowest } = data;
  const money = useMoney();
  const values = months.map((m) => m.balanceEnd);
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const span = top - bottom || 1;
  const plot = H - PAD_TOP - PAD_BOTTOM;
  const y = (v: number) => PAD_TOP + ((top - v) / span) * plot;
  const slot = W / months.length;
  const bar = slot * 0.62;

  return (
    <>
      <p className="eyebrow">Următoarele {months.length} luni, într-un {SCENARIO[scenario]}</p>
      <p className="ask-card-note">Banii din cont la sfârșitul fiecărei luni, fără salariu.</p>
      <svg className="ask-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cei mai puțini bani: ${money.signed(lowest.balance)}, în ${monthName(lowest.key)}. La final: ${money.signed(endBalance)}.`}>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="ask-chart-zero" />
        {months.map((m, i) => {
          const x = i * slot + (slot - bar) / 2;
          const y0 = y(Math.max(0, m.balanceEnd));
          const h = Math.max(1, Math.abs(y(m.balanceEnd) - y(0)));
          const cls = m.balanceEnd < 0 ? 'ask-bar neg' : m.key === lowest.key ? 'ask-bar low' : 'ask-bar';
          return (
            <g key={m.key}>
              <rect x={x} y={y0} width={bar} height={h} rx={2} className={cls} />
              <text x={x + bar / 2} y={H - 6} textAnchor="middle" className="ask-chart-label">
                {monthShort(m.key)}
              </text>
            </g>
          );
        })}
      </svg>
      <dl className="ask-card-facts">
        <dt>Cei mai puțini bani</dt>
        <dd className={lowest.balance < 0 ? 'ask-neg' : undefined}>
          <Money bani={lowest.balance} as="signed" /> <small>în {monthName(lowest.key)}</small>
        </dd>
        <dt>La final</dt>
        <dd className={endBalance < 0 ? 'ask-neg' : undefined}>
          <Money bani={endBalance} as="signed" />
        </dd>
      </dl>
      <details className="ask-card-more">
        <summary>Vezi pe luni</summary>
        <table className="ask-compare">
          <thead>
            <tr>
              <td />
              <th scope="col">Intră</th>
              <th scope="col">Iese</th>
              <th scope="col">Rămân</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key}>
                <th scope="row">{monthShort(m.key)}</th>
                <td>
                  <Money bani={m.in} />
                </td>
                <td>
                  <Money bani={m.out} />
                </td>
                <td className={m.balanceEnd < 0 ? 'ask-neg' : undefined}>
                  <Money bani={m.balanceEnd} as="signed" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
