import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ChartSeries {
  /** Balance at the start, then at each month end (bani). */
  low: number[];
  mid: number[];
  high: number[];
}

type Pt = [number, number];

const smooth = (p: Pt[]) =>
  p.reduce((d, q, i) => {
    if (!i) return `M${q[0]} ${q[1]}`;
    const a = p[i - 1]!;
    const mx = (a[0] + q[0]) / 2;
    return `${d} C${mx} ${a[1]},${mx} ${q[1]},${q[0]} ${q[1]}`;
  }, '');

/**
 * Balance line with an optional low–high band and a marker on the lowest point
 * (ported from the prototype). Width follows the container.
 */
export function LineChart({
  series,
  active,
  labels,
  band,
  label,
  callout,
  mini,
}: {
  series: ChartSeries;
  active: keyof ChartSeries;
  /** One label per month (length = series length − 1). */
  labels: string[];
  band: boolean;
  label: string;
  callout?: (lowIndex: number) => ReactNode;
  mini?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrap.current?.querySelector('svg');
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w: W, h: H } = size;
  const values = series[active];
  const all = [...series.low, ...series.high, ...series.mid];
  const max = Math.max(...all, 1);
  const min = Math.min(0, ...all);
  const L = 4;
  const R = W - 4;
  const T = 10;
  const B = H - 24;
  const n = values.length - 1;
  const x = (i: number) => L + (i / n) * (R - L);
  const y = (v: number) => B - ((v - min) / (max - min || 1)) * (B - T);
  const pts = (s: number[]): Pt[] => s.map((v, i) => [x(i), y(v)]);

  let lowIdx = 1;
  for (let i = 1; i < values.length; i++) if (values[i]! < values[lowIdx]!) lowIdx = i;
  const activePts = pts(values);
  const lp = activePts[lowIdx];
  const every = W < 460 ? 2 : 1;
  const gid = `fade-${active}-${mini ? 'm' : 'b'}`;
  const calloutW = 170;

  return (
    <div className={`chart${mini ? ' mini' : ''}`} ref={wrap}>
      <svg viewBox={W ? `0 0 ${W} ${H}` : undefined} role="img" aria-label={label}>
        {W > 0 && lp && (
          <>
            <defs>
              <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" stopOpacity=".26" />
                <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1={L} x2={R} y1={y(0)} y2={y(0)} stroke="var(--line)" />
            {band && (
              <path
                d={`${smooth(pts(series.high))} L${pts(series.low)
                  .reverse()
                  .map((p) => p.join(' '))
                  .join(' L')} Z`}
                fill="var(--accent)"
                opacity={0.13}
              />
            )}
            <path d={`${smooth(activePts)} L${R} ${B} L${L} ${B} Z`} fill={`url(#${gid})`} />
            <path d={smooth(activePts)} fill="none" stroke="var(--accent)" strokeWidth={7} opacity={0.14} strokeLinecap="round" />
            <path d={smooth(activePts)} fill="none" stroke="var(--accent)" strokeWidth={2.6} strokeLinecap="round" />
            {callout && (
              <line x1={lp[0]} x2={lp[0]} y1={Math.max(54, lp[1] - 24)} y2={lp[1] - 7} stroke="var(--gold)" />
            )}
            <circle cx={lp[0]} cy={lp[1]} r={5.5} fill="var(--gold)" stroke="var(--surface-solid)" strokeWidth={2.5} />
            {labels.map((m, i) =>
              i % every === 0 ? (
                <text key={i} className="axis" x={x(i + 1)} y={H - 5} textAnchor={i === labels.length - 1 ? 'end' : 'middle'}>
                  {m}
                </text>
              ) : null,
            )}
          </>
        )}
      </svg>
      {callout && W > 0 && lp && (
        <div
          className="callout"
          style={{
            left: Math.max(calloutW / 2, Math.min(W - calloutW / 2, lp[0])),
            top: Math.max(0, lp[1] - 78),
          }}
        >
          {callout(lowIdx - 1)}
        </div>
      )}
    </div>
  );
}
