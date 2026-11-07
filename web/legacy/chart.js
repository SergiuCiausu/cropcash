/* Ported from farm-app by web/scripts/port-legacy.mjs. Edit farm-app, or edit here and stop re-running the port. */
/* eslint-disable */
// @ts-nocheck
export default function install() {
/* The month-by-month money chart, on Prognoză and Acasă.
   It uses Recharts when it loads, and a plain SVG line when it doesn't. */
window.FarmChart = function (plan, getYear) {
  const { esc, exact } = CC;
  const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
  const monthNo = (key) => +key.split('-')[1] - 1;
  const monthName = (key) => `${MONTHS[monthNo(key)]} ${key.slice(0, 4)}`;
  const lei = (bani) => `${bani < 0 ? '−' : ''}${exact(Math.abs(bani))} lei`;
  const YEARS = [['bad', 'An slab'], ['medium', 'An normal'], ['good', 'An bun']];

  const points = () => {
    const pick = (k) => plan.timelines[k].months.map((m) => m.balanceEnd);
    const bad = pick('bad'), medium = pick('medium'), good = pick('good');
    return plan.timelines[getYear()].months.map((m, i) => ({ m: SHORT[monthNo(m.key)], long: monthName(m.key), v: pick(getYear())[i], bad: bad[i], medium: medium[i], good: good[i] }));
  };
  /* The two years not chosen, highest first, so their names sit above and below the lines. */
  const yearName = (k) => YEARS.find(([y]) => y === k)[1];
  const others = (rows) => YEARS.map(([k]) => k).filter((k) => k !== getYear()).sort((a, b) => rows[rows.length - 1][b] - rows[rows.length - 1][a]);
  const lowest = (rows) => Math.min(0, ...rows.flatMap((r) => [r.bad, r.medium, r.good]));
  const highest = (rows) => Math.max(0, ...rows.flatMap((r) => [r.bad, r.medium, r.good]));
  const yearEnds = (rows) => others(rows).map((k) => `${yearName(k)}: ${lei(rows[rows.length - 1][k])}`).join(', ');

  function plainChart(host, rows, low, label) {
    const W = host.clientWidth || 640, H = host.clientHeight || 280, T = 12, B = 28;
    const top = highest(rows), bottom = lowest(rows);
    const x = (i) => ((i + 0.5) / rows.length) * W;
    const y = (v) => T + (1 - (v - bottom) / (top - bottom || 1)) * (H - T - B);
    const path = (get) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(get(r)).toFixed(1)}`).join(' ');
    const end = rows.length - 1;
    const dotted = others(rows).map((k, i) => `<path class="c-alt" d="${path((r) => r[k])}"/><text class="c-lab" x="${x(end).toFixed(1)}" y="${(y(rows[end][k]) + (i ? 15 : -7)).toFixed(1)}" text-anchor="end">${yearName(k)}</text>`).join('');
    const showLabel = (i) => W >= 480 || i % 2 === 0;
    host.innerHTML = `<svg class="plain" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
      <line class="c-base" x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>
      ${dotted}<path class="c-line" d="${path((r) => r.v)}"/>
      <circle class="c-dot" r="6" cx="${x(rows.indexOf(low)).toFixed(1)}" cy="${y(low.v).toFixed(1)}"/>
      ${rows.map((r, i) => (showLabel(i) ? `<text class="c-lab" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${r.m}</text>` : '')).join('')}
    </svg>`;
  }

  const roots = new Map();
  function rechartsChart(host, rows, low, label) {
    const R = window.Recharts, h = React.createElement;
    if (!roots.has(host)) roots.set(host, ReactDOM.createRoot(host));
    const root = roots.get(host);
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', label);
    const min = lowest(rows), max = highest(rows), alt = others(rows), end = rows.length - 1;
    const Tip = ({ active, payload }) => (active && payload?.length
      ? h('div', { className: 'ch-tip' }, h('b', null, payload[0].payload.long), h('span', null, lei(payload[0].payload.v)), alt.map((k) => h('span', { key: k }, `${yearName(k)}: ${lei(payload[0].payload[k])}`)))
      : null);
    root.render(h(R.ResponsiveContainer, { width: '100%', height: '100%' },
      h(R.ComposedChart, { data: rows, margin: { top: 10, right: 14, bottom: 0, left: 14 } },
        h(R.XAxis, { dataKey: 'm', scale: 'point', interval: host.clientWidth >= 480 ? 0 : 1, tickLine: false, axisLine: false, height: 26, tick: { className: 'c-lab' } }),
        h(R.YAxis, { hide: true, domain: [min, max] }),
        h(R.ReferenceLine, { y: 0, stroke: 'var(--hair-2)' }),
        h(R.Tooltip, { cursor: { stroke: 'var(--hair-2)', strokeWidth: 1 }, isAnimationActive: false, content: Tip }),
        ...alt.map((k, i) => h(R.Line, { key: k, dataKey: k, type: 'monotone', stroke: 'var(--text-2)', strokeWidth: 1.6, strokeDasharray: '1 5', strokeLinecap: 'round', dot: false, activeDot: false, legendType: 'none', tooltipType: 'none', isAnimationActive: false, label: ({ x, y, index }) => (index === end ? h('text', { x, y: y + (i ? 15 : -7), textAnchor: 'end', className: 'c-lab' }, yearName(k)) : null) })),
        h(R.Line, { dataKey: 'v', type: 'monotone', stroke: 'var(--on-hero)', strokeWidth: 2.2, strokeLinecap: 'round', dot: false, activeDot: { r: 5 }, isAnimationActive: false }),
        h(R.ReferenceDot, { x: low.m, y: low.v, r: 5, fill: 'var(--hero)', stroke: 'var(--on-hero)', strokeWidth: 2, ifOverflow: 'visible' }))));
  }

  const draw = (...args) => (window.Recharts && window.React && window.ReactDOM ? rechartsChart : plainChart)(...args);

  return { points, draw, yearEnds, monthName };
};

}
