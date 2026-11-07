import { useEffect, useRef, useState } from 'react';

export interface ForecastSeries {
  /** Balance today, then at each month end (bani). */
  lo: number[];
  mid: number[];
  hi: number[];
}

type Pt = [number, number];

function smooth(p: Pt[]): string {
  let d = `M${p[0]![0].toFixed(1)} ${p[0]![1].toFixed(1)}`;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const q = p[i]!;
    const m = (a[0] + q[0]) / 2;
    d += ` C${m.toFixed(1)} ${a[1].toFixed(1)},${m.toFixed(1)} ${q[1].toFixed(1)},${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Twelve-month balance line with the poor-to-good band and the tightest month marked
 * (ported from the prototype's drawChart). Drawn at real pixel size so labels stay legible.
 */
export function ForecastChart({
  series,
  active,
  labels,
  label,
  className = '',
}: {
  series: ForecastSeries;
  active: keyof ForecastSeries;
  /** One short month label per month (series length − 1). */
  labels: string[];
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w: W, h: H } = size;
  const cur = series[active];
  let lowI = 0;
  for (let i = 1; i < cur.length - 1; i++) if (cur[i + 1]! < cur[lowI + 1]!) lowI = i;

  let body = null;
  if (W && H && cur.length > 1) {
    const T = 10;
    const B = 26;
    const L = 2;
    const R = 13;
    const n = cur.length - 1;
    const mx = Math.max(...series.hi, ...series.lo, ...cur, 1);
    const mn = Math.min(0, ...series.lo, ...cur);
    const x = (i: number) => L + (i / n) * (W - L - R);
    const y = (v: number) => T + (1 - (v - mn) / (mx - mn || 1)) * (H - T - B);
    const map = (a: number[]): Pt[] => a.map((v, i) => [x(i), y(v)]);
    const band = `${smooth(map(series.hi))} L${map(series.lo)
      .reverse()
      .map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join(' L')} Z`;
    const step = W < 300 ? 2 : 1;
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <line className="c-base" x1={L} x2={W - R} y1={H - B} y2={H - B} />
        <path className="c-band" d={band} />
        <path className="c-line" d={smooth(map(cur))} />
        <circle className="c-dot" r={5} cx={x(lowI + 1)} cy={y(cur[lowI + 1]!)} />
        {labels.map((m, i) =>
          i % step && i !== lowI ? null : (
            <text key={i} className={`c-lab${i === lowI ? ' on' : ''}`} x={x(i + 1)} y={H - 6} textAnchor="middle">
              {m}
            </text>
          ),
        )}
      </svg>
    );
  }

  return (
    <div className={`chart ${className}`} ref={ref} role="img" aria-label={label}>
      {body}
    </div>
  );
}
