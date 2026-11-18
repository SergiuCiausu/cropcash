'use client';
/* The pension chart: what the money grows to, year by year, until the target age (web/legacy/pension-chart.js).
   Built like the main chart: the chosen growth is a solid line, the other two are dotted with their
   names at the end, and a thin line shows what the farmer puts in himself. "Compară cu" adds a gold
   dashed line with what another way would cost. A plain SVG draws at once; Recharts takes over when it arrives. */
import type { pensionPath } from '../../../packages/shared/src/pension/index';
import { about } from '../../lib/cc/format';
import { useMoney } from '../../lib/cc/react';
import { useWidth } from './FarmChart';
import { useRecharts, type Recharts } from './useRecharts';

const KEYS = ['low', 'probable', 'high'] as const;
export type Growth = (typeof KEYS)[number];
type Line = Growth | 'paid' | 'cmp';
export interface PensionCompare {
  name: string;
  short: string;
  path: { age: number; paid: number }[];
}
interface Row {
  age: number;
  a: string;
  paid: number;
  low: number;
  probable: number;
  high: number;
  cmp?: number | null;
}
interface Props {
  path: ReturnType<typeof pensionPath>;
  chosen: Growth;
  names: Record<Growth, string>;
  compare: PensionCompare | null;
}

/* Names sit just past the end of each line, spread so two names never overlap. */
const TOP = 14;
const AXIS = 26;
const GAP = 14;
const NAME_W = 66;
const others = (chosen: Growth) => KEYS.filter((k) => k !== chosen);
const topOf = (rows: Row[]) => Math.max(1, ...rows.map((r) => Math.max(r.high, r.cmp ?? 0)));
/** The ages on the axis: every few years, always the target age, never two crowded at the end. */
function axisAges(rows: Row[], wide: boolean) {
  const step = Math.max(1, Math.ceil(rows.length / (wide ? 11 : 6)));
  const end = rows.length - 1;
  return rows.filter((_, i) => i === end || (i % step === 0 && end - i >= Math.ceil(step / 2))).map((r) => r.a);
}
function endNames(rows: Row[], hasCompare: boolean, chosen: Growth, y: (v: number) => number, H: number) {
  const end = rows[rows.length - 1];
  const lines: Line[] = [...KEYS, 'paid', ...(hasCompare ? (['cmp'] as const) : [])];
  const list = lines.map((k) => ({ k, y: y(end[k] ?? 0), on: k === chosen })).sort((a, b) => a.y - b.y);
  list.forEach((n, i) => {
    if (i && n.y < list[i - 1].y + GAP) n.y = list[i - 1].y + GAP;
  });
  const over = list[list.length - 1].y - (H - AXIS - 4);
  if (over > 0) list.forEach((n) => (n.y = Math.max(TOP / 2, n.y - over)));
  return Object.fromEntries(list.map((n) => [n.k, n.y])) as Record<Line, number>;
}


export default function PensionChart({ path, chosen, names, compare: against }: Props) {
  const { text } = useMoney();
  const { ref, w: W, h: H } = useWidth();
  const R = useRecharts();

  const compare = against?.path?.length ? against : null;
  const sum = (bani: number) => text(`${about(bani)} lei`);
  const cost = new Map((compare?.path ?? []).map((p) => [p.age, p.paid]));
  const rows: Row[] = path.map((p) => ({ age: p.age, a: String(p.age), paid: p.paidIn, ...p.value, ...(compare ? { cmp: cost.get(p.age) ?? null } : {}) }));
  /* Nothing to draw at or past the target age. */
  if (!rows.length) return <div ref={ref} className="chart pn-chart" />;

  const end = rows.length - 1;
  const last = rows[end];
  const alt = others(chosen);
  const top = topOf(rows);
  const y = (v: number) => TOP + (1 - v / top) * (H - TOP - AXIS);
  const at = endNames(rows, !!compare, chosen, y, H);
  const nameOf = (k: Line) => (k === 'paid' ? 'Ce pui tu' : k === 'cmp' ? compare!.short : names[k]);
  const label = `La ${last.age} de ani: ${sum(last[chosen])} cu ${names[chosen]}. ${alt.map((k) => `Cu ${names[k]}: ${sum(last[k])}`).join('. ')}. Tu pui ${sum(last.paid)}.${compare ? ` ${compare.name}: ai de plătit ${sum(last.cmp ?? 0)}.` : ''}`;
  const ticks = axisAges(rows, W >= 480);

  if (!R) {
    const x = (i: number) => 10 + (i / Math.max(1, end)) * (W - 20 - NAME_W);
    const line = (k: Line) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r[k] ?? 0).toFixed(1)}`).join(' ');
    const shown = new Set(ticks);
    const endLabel = (k: Line, cls = 'c-lab') => (
      <text className={cls} x={(x(end) + 6).toFixed(1)} y={at[k].toFixed(1)} dy=".35em">
        {nameOf(k)}
      </text>
    );
    return (
      <div ref={ref} className="chart pn-chart">
        <svg className="plain" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          <line className="c-base" x1="0" x2={W} y1={y(0).toFixed(1)} y2={y(0).toFixed(1)} />
          <path className="c-paid" d={line('paid')} />
          {endLabel('paid')}
          {compare && (
            <>
              <path className="c-cmp" d={line('cmp')} />
              {endLabel('cmp', 'c-lab cmp')}
            </>
          )}
          {alt.map((k) => (
            <g key={k}>
              <path className="c-alt" d={line(k)} />
              {endLabel(k)}
            </g>
          ))}
          <path className="c-line" d={line(chosen)} />
          {endLabel(chosen, 'c-lab on')}
          {rows.map((r, i) =>
            shown.has(r.a) ? (
              <text key={r.a} className="c-lab" x={x(i).toFixed(1)} y={H - 8} textAnchor={i === 0 ? 'start' : 'middle'}>
                {r.a}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    );
  }

  const endText = (k: Line, cls = 'c-lab') =>
    ((p: { x: number; index: number }) =>
      p.index === end ? (
        <text x={p.x + 6} y={at[k]} dy=".35em" className={cls}>
          {nameOf(k)}
        </text>
      ) : null) as never;
  const quiet = { dot: false, activeDot: false, legendType: 'none', isAnimationActive: false, type: 'monotone', strokeLinecap: 'round', tooltipType: 'none' } as const;
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) => {
    const r = active && payload?.length ? payload[0].payload : null;
    return r ? (
      <div className="ch-tip">
        <b>La {r.age} de ani</b>
        <span>
          {sum(r[chosen])}, cu {names[chosen]}
        </span>
        {alt.map((k) => (
          <span key={k}>{`Cu ${names[k]}: ${sum(r[k])}`}</span>
        ))}
        <span>Tu pui: {sum(r.paid)}</span>
        {compare && <span>{`${compare.name}: ai de plătit ${sum(r.cmp ?? 0)}`}</span>}
      </div>
    ) : null;
  };
  return (
    <div ref={ref} className="chart pn-chart" role="group" aria-label={label}>
      <R.ResponsiveContainer width="100%" height="100%">
        <R.ComposedChart data={rows} margin={{ top: TOP, right: NAME_W, bottom: 0, left: 10 }}>
          <R.XAxis dataKey="a" scale="point" padding={{ left: 0, right: 0 }} ticks={ticks} interval={0} tickLine={false} axisLine={false} height={26} tick={{ className: 'c-lab' }} />
          <R.YAxis hide domain={[0, top]} />
          <R.ReferenceLine y={0} stroke="var(--hair-2)" />
          <R.Tooltip cursor={{ stroke: 'var(--hair-2)', strokeWidth: 1 }} isAnimationActive={false} content={Tip as never} />
          <R.Line {...quiet} dataKey="paid" stroke="var(--text-2)" strokeOpacity={0.55} strokeWidth={1.2} label={endText('paid')} />
          {compare && <R.Line {...quiet} dataKey="cmp" stroke="var(--ink-c)" strokeWidth={1.8} strokeDasharray="6 4" label={endText('cmp', 'c-lab cmp')} />}
          {alt.map((k) => (
            <R.Line {...quiet} key={k} dataKey={k} stroke="var(--text-2)" strokeWidth={1.6} strokeDasharray="1 5" label={endText(k)} />
          ))}
          <R.Line dataKey={chosen} type="monotone" stroke="var(--on-hero)" strokeWidth={2.2} strokeLinecap="round" dot={false} activeDot={{ r: 5 }} isAnimationActive={false} label={endText(chosen, 'c-lab on')} />
        </R.ComposedChart>
      </R.ResponsiveContainer>
    </div>
  );
}
