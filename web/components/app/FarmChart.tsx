'use client';
/* The month-by-month money chart on Prognoză and Acasă (web/legacy/chart.js). A plain SVG line draws
   at once and stays if Recharts can't load; Recharts takes over when it arrives, with its tooltip. */
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useMoney } from '../../lib/cc/react';
import { highest, lowest, otherYears, yearName, type ChartRow, type Year } from '../../lib/ui/chart';
import { useRecharts, type Recharts } from './useRecharts';

interface Props {
  rows: ChartRow[];
  /** The point marked with a dot: the lowest month, or the last year on the long forecast. */
  low: ChartRow;
  year: Year;
  /** What a screen reader hears instead of the picture. */
  label: string;
}

export function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 280 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth || 640, h: el.clientHeight || 280 });
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  return { ref, ...size };
}

function PlainChart({ rows, low, year, label, w, h }: Props & { w: number; h: number }) {
  const T = 12;
  const B = 28;
  const top = highest(rows);
  const bottom = lowest(rows);
  const x = (i: number) => ((i + 0.5) / rows.length) * w;
  const y = (v: number) => T + (1 - (v - bottom) / (top - bottom || 1)) * (h - T - B);
  const path = (get: (r: ChartRow) => number) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(get(r)).toFixed(1)}`).join(' ');
  const end = rows.length - 1;
  const showLabel = (i: number) => w >= 480 || i % 2 === 0;
  return (
    <svg className="plain" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <line className="c-base" x1="0" x2={w} y1={y(0).toFixed(1)} y2={y(0).toFixed(1)} />
      {otherYears(rows, year).map((k, i) => (
        <g key={k}>
          <path className="c-alt" d={path((r) => r[k])} />
          <text className="c-lab" x={x(end).toFixed(1)} y={(y(rows[end][k]) + (i ? 15 : -7)).toFixed(1)} textAnchor="end">
            {yearName(k)}
          </text>
        </g>
      ))}
      <path className="c-line" d={path((r) => r.v)} />
      <circle className="c-dot" r="6" cx={x(rows.indexOf(low)).toFixed(1)} cy={y(low.v).toFixed(1)} />
      {rows.map((r, i) =>
        showLabel(i) ? (
          <text key={i} className="c-lab" x={x(i).toFixed(1)} y={h - 8} textAnchor="middle">
            {r.m}
          </text>
        ) : null,
      )}
    </svg>
  );
}


function RechartsChart({ R, rows, low, year, w }: Props & { R: Recharts; w: number }) {
  const money = useMoney();
  const alt = otherYears(rows, year);
  const end = rows.length - 1;
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) =>
    active && payload?.length ? (
      <div className="ch-tip">
        <b>{payload[0].payload.long}</b>
        <span>{money.signed(payload[0].payload.v)}</span>
        {alt.map((k) => (
          <span key={k}>{`${yearName(k)}: ${money.signed(payload[0].payload[k])}`}</span>
        ))}
      </div>
    ) : null;
  return (
    <R.ResponsiveContainer width="100%" height="100%">
      <R.ComposedChart data={rows} margin={{ top: 10, right: 14, bottom: 0, left: 14 }}>
        <R.XAxis dataKey="m" scale="point" interval={w >= 480 ? 0 : 1} tickLine={false} axisLine={false} height={26} tick={{ className: 'c-lab' }} />
        <R.YAxis hide domain={[lowest(rows), highest(rows)]} />
        <R.ReferenceLine y={0} stroke="var(--hair-2)" />
        <R.Tooltip cursor={{ stroke: 'var(--hair-2)', strokeWidth: 1 }} isAnimationActive={false} content={Tip as never} />
        {alt.map((k, i) => (
          <R.Line
            key={k}
            dataKey={k}
            type="monotone"
            stroke="var(--text-2)"
            strokeWidth={1.6}
            strokeDasharray="1 5"
            strokeLinecap="round"
            dot={false}
            activeDot={false}
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
            label={((p: { x: number; y: number; index: number }) =>
              p.index === end ? (
                <text x={p.x} y={p.y + (i ? 15 : -7)} textAnchor="end" className="c-lab">
                  {yearName(k)}
                </text>
              ) : null) as never}
          />
        ))}
        <R.Line dataKey="v" type="monotone" stroke="var(--on-hero)" strokeWidth={2.2} strokeLinecap="round" dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
        <R.ReferenceDot x={low.m} y={low.v} r={5} fill="var(--hero)" stroke="var(--on-hero)" strokeWidth={2} ifOverflow="visible" />
      </R.ComposedChart>
    </R.ResponsiveContainer>
  );
}

/** The chart in its box (the page's `.fc`-style element gives it a size). */
export default function FarmChart(props: Props & { className?: string; id?: string }) {
  const { ref, w, h } = useWidth();
  const R = useRecharts();
  const Chart = R ? (RechartsChart as ComponentType<Props & { R: Recharts; w: number }>) : null;
  return (
    <div ref={ref} className={props.className} id={props.id} {...(R ? { role: 'group', 'aria-label': props.label } : {})}>
      {Chart && R ? <Chart {...props} R={R} w={w} /> : <PlainChart {...props} w={w} h={h} />}
    </div>
  );
}
