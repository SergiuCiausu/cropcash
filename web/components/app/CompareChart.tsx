'use client';
/* The admin preview's chart (docs/admin-panel-plan.md step 9): the normal year's money, month by month,
   now (dotted) and with the draft (solid), one over the other. Plain SVG: it is worked out on the
   phone and must draw offline, at once, in the narrow side column. */
import type { MonthPair } from '../../lib/cc/admin';
import { useMoney } from '../../lib/cc/react';
import { monthName, shortMonth } from '../../lib/ui/chart';
import { useWidth } from './FarmChart';

const TOP = 12;
const AXIS = 26;

/** The line through the months a plan has; a month it lacks breaks the line. */
export function linePath(months: MonthPair[], get: (m: MonthPair) => number | null, x: (i: number) => number, y: (v: number) => number): string {
  let pen = false;
  return months
    .map((m, i) => {
      const v = get(m);
      if (v === null) return (pen = false), '';
      const cmd = `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
      return cmd;
    })
    .filter(Boolean)
    .join(' ');
}

/** The month with the lowest balance under the draft (the first, on a tie). */
export function lowestAfter(months: MonthPair[]): number {
  let at = -1;
  months.forEach((m, i) => {
    if (m.after !== null && (at < 0 || m.after < months[at].after!)) at = i;
  });
  return at;
}

export default function CompareChart({ months, moved }: { months: MonthPair[]; moved: boolean }) {
  const { ref, w, h } = useWidth();
  const money = useMoney();
  if (!months.length) return null;
  const values = months.flatMap((m) => [m.before, m.after]).filter((v): v is number => v !== null);
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const x = (i: number) => ((i + 0.5) / months.length) * w;
  const y = (v: number) => TOP + (1 - (v - bottom) / (top - bottom || 1)) * (h - TOP - AXIS);
  const low = lowestAfter(months);
  const end = months[months.length - 1];
  const step = w >= 360 ? 1 : 2;
  const label = [
    'Banii lună de lună, într-un an normal, înainte de salariu.',
    low >= 0 ? `Cu ciorna, cel mai jos: ${money.signed(months[low].after!)}, în ${monthName(months[low].key)}.` : '',
    end.before !== null ? `La final, acum: ${money.signed(end.before)}.` : '',
    end.after !== null ? `La final, cu ciorna: ${money.signed(end.after)}.` : '',
    moved ? '' : 'Cele două linii sunt la fel.',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <figure className="adm-chart">
      <div ref={ref} className="adm-chart-box">
        <svg className="plain" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
          <line className="c-base" x1="0" x2={w} y1={y(0).toFixed(1)} y2={y(0).toFixed(1)} />
          <path className="c-alt" d={linePath(months, (m) => m.before, x, y)} />
          <path className="c-line" d={linePath(months, (m) => m.after, x, y)} />
          {low >= 0 && <circle className="c-dot" r="5" cx={x(low).toFixed(1)} cy={y(months[low].after!).toFixed(1)} />}
          {months.map((m, i) =>
            (months.length - 1 - i) % step === 0 ? (
              <text key={m.key} className={i === low ? 'c-lab on' : 'c-lab'} x={x(i).toFixed(1)} y={h - 8} textAnchor="middle">
                {shortMonth(m.key)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
      <figcaption className="adm-legend" aria-hidden="true">
        <span className="adm-key was">Acum</span>
        <span className="adm-key now">Cu ciorna</span>
      </figcaption>
    </figure>
  );
}
