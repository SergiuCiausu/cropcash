/* Ported from farm-app by web/scripts/port-legacy.mjs. Edit farm-app, or edit here and stop re-running the port. */
/* eslint-disable */
// @ts-nocheck
export default function install() {
/* The pension chart: what the money grows to, year by year, until the target age.
   Built like the main chart (chart.js): the chosen growth is a solid line, the other two are dotted
   with their names at the end, and a thin line shows what the farmer puts in himself.
   It uses Recharts when it loads, and a plain SVG when it doesn't. */
window.PensionChart = function () {
  const { esc, about } = CC;
  const KEYS = ['low', 'probable', 'high'];
  const sum = (bani) => `${about(bani)} lei`;

  /* path: E.pensionPath(...). names: { low: '2% pe an', ... }. chosen: one of KEYS. */
  const rowsOf = (path) => path.map((p) => ({ age: p.age, a: String(p.age), paid: p.paidIn, ...p.value }));
  const othersOf = (chosen) => KEYS.filter((k) => k !== chosen);
  /* With many years, a label every few years keeps the axis readable. */
  const every = (rows, wide) => Math.max(1, Math.ceil(rows.length / (wide ? 11 : 6)));
  /* The ages on the axis: every few years, always the target age, never two crowded at the end. */
  function axisAges(rows, wide) {
    const step = every(rows, wide), end = rows.length - 1;
    return rows.filter((r, i) => i === end || (i % step === 0 && end - i >= Math.ceil(step / 2))).map((r) => r.a);
  }
  /* Names sit just past the end of each line, spread so two names never overlap. */
  const TOP = 14, AXIS = 26, GAP = 14, NAME_W = 66;
  const nameOf = (k, names) => names[k] ?? 'Ce pui tu';
  function endNames(rows, chosen, names, y, H) {
    const end = rows[rows.length - 1];
    const list = [...KEYS, 'paid'].map((k) => ({ k, y: y(end[k]), on: k === chosen })).sort((a, b) => a.y - b.y);
    list.forEach((n, i) => { if (i && n.y < list[i - 1].y + GAP) n.y = list[i - 1].y + GAP; });
    const over = list[list.length - 1].y - (H - AXIS - 4);
    if (over > 0) list.forEach((n) => { n.y = Math.max(TOP / 2, n.y - over); });
    return Object.fromEntries(list.map((n) => [n.k, n.y]));
  }
  const describe = (rows, chosen, names) => {
    const end = rows[rows.length - 1];
    return `La ${end.age} de ani: ${sum(end[chosen])} cu ${names[chosen]}. ${othersOf(chosen).map((k) => `Cu ${names[k]}: ${sum(end[k])}`).join('. ')}. Tu pui ${sum(end.paid)}.`;
  };

  function plainChart(host, rows, chosen, names) {
    const W = host.clientWidth || 640, H = host.clientHeight || 260;
    const top = Math.max(1, ...rows.map((r) => r.high));
    const x = (i) => 10 + (i / Math.max(1, rows.length - 1)) * (W - 20 - NAME_W);
    const y = (v) => TOP + (1 - v / top) * (H - TOP - AXIS);
    const at = endNames(rows, chosen, names, y, H);
    const path = (k) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r[k]).toFixed(1)}`).join(' ');
    const end = rows.length - 1, shown = new Set(axisAges(rows, W >= 480));
    const endLabel = (k, cls = 'c-lab') => `<text class="${cls}" x="${(x(end) + 6).toFixed(1)}" y="${at[k].toFixed(1)}" dy=".35em">${esc(nameOf(k, names))}</text>`;
    host.innerHTML = `<svg class="plain" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(describe(rows, chosen, names))}">
      <line class="c-base" x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>
      <path class="c-paid" d="${path('paid')}"/>${endLabel('paid')}
      ${othersOf(chosen).map((k) => `<path class="c-alt" d="${path(k)}"/>${endLabel(k)}`).join('')}
      <path class="c-line" d="${path(chosen)}"/>${endLabel(chosen, 'c-lab on')}
      ${rows.map((r, i) => (shown.has(r.a) ? `<text class="c-lab" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : 'middle'}">${r.a}</text>` : '')).join('')}
    </svg>`;
  }

  const roots = new Map();
  function rechartsChart(host, rows, chosen, names) {
    const R = window.Recharts, h = React.createElement;
    if (!roots.has(host)) roots.set(host, ReactDOM.createRoot(host));
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', describe(rows, chosen, names));
    const end = rows.length - 1, alt = othersOf(chosen), H = host.clientHeight || 260;
    const top = Math.max(1, ...rows.map((r) => r.high));
    const at = endNames(rows, chosen, names, (v) => TOP + (1 - v / top) * (H - TOP - AXIS), H);
    const label = (k, cls = 'c-lab') => ({ x, index }) => (index === end ? h('text', { x: x + 6, y: at[k], dy: '.35em', className: cls }, nameOf(k, names)) : null);
    const quiet = { dot: false, activeDot: false, legendType: 'none', isAnimationActive: false, type: 'monotone', strokeLinecap: 'round' };
    const Tip = ({ active, payload }) => {
      const r = active && payload?.length ? payload[0].payload : null;
      return r
        ? h('div', { className: 'ch-tip' }, h('b', null, `La ${r.age} de ani`), h('span', null, `${sum(r[chosen])}, cu ${names[chosen]}`),
          alt.map((k) => h('span', { key: k }, `Cu ${names[k]}: ${sum(r[k])}`)), h('span', null, `Tu pui: ${sum(r.paid)}`))
        : null;
    };
    roots.get(host).render(h(R.ResponsiveContainer, { width: '100%', height: '100%' },
      h(R.ComposedChart, { data: rows, margin: { top: TOP, right: NAME_W, bottom: 0, left: 10 } },
        h(R.XAxis, { dataKey: 'a', scale: 'point', padding: { left: 0, right: 0 }, ticks: axisAges(rows, host.clientWidth >= 480), interval: 0, tickLine: false, axisLine: false, height: 26, tick: { className: 'c-lab' } }),
        h(R.YAxis, { hide: true, domain: [0, top] }),
        h(R.ReferenceLine, { y: 0, stroke: 'var(--hair-2)' }),
        h(R.Tooltip, { cursor: { stroke: 'var(--hair-2)', strokeWidth: 1 }, isAnimationActive: false, content: Tip }),
        h(R.Line, { ...quiet, dataKey: 'paid', stroke: 'var(--text-2)', strokeOpacity: 0.55, strokeWidth: 1.2, tooltipType: 'none', label: label('paid') }),
        ...alt.map((k) => h(R.Line, { ...quiet, key: k, dataKey: k, stroke: 'var(--text-2)', strokeWidth: 1.6, strokeDasharray: '1 5', tooltipType: 'none', label: label(k) })),
        h(R.Line, { dataKey: chosen, type: 'monotone', stroke: 'var(--on-hero)', strokeWidth: 2.2, strokeLinecap: 'round', dot: false, activeDot: { r: 5 }, isAnimationActive: false, label: label(chosen, 'c-lab on') }))));
  }

  /* Nothing to draw at or past the target age. */
  function draw(host, path, chosen, names) {
    if (!path.length) { host.innerHTML = ''; return; }
    (window.Recharts && window.React && window.ReactDOM ? rechartsChart : plainChart)(host, rowsOf(path), chosen, names);
  }

  return { draw, describe: (path, chosen, names) => describe(rowsOf(path), chosen, names) };
};

}
