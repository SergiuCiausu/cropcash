/* Ported from farm-app/desktop/charts.js for the landing page: Recharts from npm (lib/boot.ts), Romanian labels, Ion's figures through FF. */
// @ts-nocheck
export default function install() {
/* Recharts islands inside the plain HTML page. If the libraries fail to load this file
   does nothing, and desktop.js falls back to the hand-drawn charts in shared.js. */
(function () {
  const R = window.Recharts;
  if (!R || !window.React || !window.ReactDOM) return;
  const h = React.createElement, { S, lei, MONTHS, MONTHS_LONG } = FF;
  document.documentElement.classList.add("has-recharts");

  const pts = (k) => [FF.balance(), ...FF.series(k)];
  const leg = (i) => `var(--ch${i + 1})`;
  const pctOf = (a) => Math.round(a / FF.costTotal * 100);

  /* One root per chart. Data moves only after the first paint, and never with reduced motion. */
  function mount(el, label, draw) {
    el.setAttribute("role", "group");
    const root = ReactDOM.createRoot(el);
    let first = true;
    FF.on(() => {
      el.setAttribute("aria-label", typeof label === "function" ? label() : label);
      root.render(draw(!first && !FF.reduced()));
      first = false;
    });
  }
  const box = (child) => h(R.ResponsiveContainer, { width: "100%", height: "100%" }, child);
  const Tip = ({ title, lines }) => h("div", { className: "ch-tip" }, h("b", null, title), lines.map((l, i) => h("span", { key: i }, l)));
  const tipOf = (fn) => ({ active, payload }) => (active && payload && payload.length ? h(Tip, fn(payload[0].payload)) : null);

  function forecast(el) {
    const label = () => { const l = FF.lowOf(FF.series(S.path)); return `Banii din cont, pe douăsprezece luni. Cel mai puțin în ${l.month}: ${lei(l.v)}. Treci cu mouse-ul sau folosește săgețile pentru fiecare lună.`; };
    const tick = (low) => ({ x, y, payload, index }) => {
      const i = index - 1, wide = el.clientWidth >= 300;
      if (index === 0 || (!wide && i % 2 && i !== low)) return h("g");
      return h("text", { x, y: y + 12, textAnchor: "middle", className: `c-lab${i === low ? " on" : ""}` }, payload.value);
    };
    if (el.classList.contains("big")) el.insertAdjacentHTML("afterend", `<ul class="ch-leg"><li><i class="l"></i>Anul ales</li><li><i class="r"></i>Ceilalți ani</li><li><i class="d"></i>Luna cu cei mai puțini bani</li></ul>`);
    mount(el, label, (animate) => {
      const cur = pts(S.path), hi = pts("good"), lo = pts("poor"), low = FF.lowOf(FF.series(S.path));
      const mid = pts("expected"), NAME = { poor: "An slab", expected: "An normal", good: "An bun" };
      const data = cur.map((v, i) => ({ m: i ? MONTHS[i - 1] : "azi", long: i ? MONTHS_LONG[i - 1] : "Azi", v, poor: lo[i], expected: mid[i], good: hi[i] }));
      const min = Math.min(0, ...lo), max = Math.max(...hi, ...lo);
      const others = Object.keys(NAME).filter((k) => k !== S.path).sort((a, b) => data[12][b] - data[12][a]);
      const endLabel = (k, above) => ({ x, y, index }) => (index === 12 ? h("text", { x: x - 2, y: y + (above ? -7 : 15), textAnchor: "end", className: "c-lab" }, NAME[k]) : null);
      const dotted = (k, i) => h(R.Line, { key: k, dataKey: k, type: "monotone", stroke: "var(--on-hero-2)", strokeWidth: 1.6, strokeDasharray: "1 5", strokeLinecap: "round", dot: false, activeDot: false, label: endLabel(k, i === 0), legendType: "none", tooltipType: "none", isAnimationActive: false });
      return box(h(R.ComposedChart, { data, margin: { top: 10, right: 14, bottom: 0, left: 2 } },
        h(R.XAxis, { dataKey: "m", scale: "point", interval: 0, tickLine: false, axisLine: { stroke: "var(--hair-2)" }, height: 26, tick: tick(low.i) }),
        h(R.YAxis, { hide: true, domain: [min, max] }),
        h(R.Tooltip, { cursor: { stroke: "var(--on-hero-2)", strokeWidth: 1 }, isAnimationActive: false, content: tipOf((d) => ({ title: d.long, lines: d.poor === d.good ? [lei(d.v)] : [lei(d.v), ...others.map((k) => `${NAME[k]}: ${lei(d[k], false)}`)] })) }),
        ...others.map(dotted),
        h(R.Line, { dataKey: "v", type: "monotone", stroke: "var(--on-hero)", strokeWidth: 2.2, strokeLinecap: "round", dot: false, activeDot: { r: 5, fill: "var(--surface)", stroke: "var(--on-hero)", strokeWidth: 2 }, isAnimationActive: animate, animationDuration: 250 }),
        h(R.ReferenceDot, { x: MONTHS[low.i], y: low.v, r: 5, fill: "var(--hero)", stroke: "var(--on-hero)", strokeWidth: 2, ifOverflow: "visible" })));
    });
  }

  const donutHTML = () => `<div class="donut"><div class="pie"><div class="pie-chart"></div><div class="pie-c"><span>${lei(FF.costTotal * 100, false).replace(/s*lei$/, "")}</span><small>lei în total</small></div></div><ul class="leg">${FF.COSTS.map(([, n, a], i) => `<li><i style="background:${leg(i)}"></i><span>${n}</span><b>${pctOf(a)}%</b></li>`).join("")}</ul></div>`;
  function donut(el) {
    const data = FF.COSTS.map(([, name, value], i) => ({ name, value, fill: leg(i) }));
    mount(el, "Cheltuielile sezonului, pe lucrări. Lista de lângă grafic dă partea fiecăreia.", () => box(h(R.PieChart, null,
      h(R.Pie, { data, dataKey: "value", nameKey: "name", innerRadius: "72%", outerRadius: "100%", paddingAngle: 2, startAngle: 90, endAngle: -270, stroke: "none", isAnimationActive: false }),
      h(R.Tooltip, { isAnimationActive: false, allowEscapeViewBox: { x: true, y: true }, wrapperStyle: { zIndex: 5 }, content: tipOf((d) => ({ title: d.name, lines: [lei(d.value * 100, false), `${pctOf(d.value)}% din cheltuielile sezonului`] })) }))));
  }

  /* Horizontal bars with direct labels, plus a hidden list so the figures stay readable by screen readers. */
  function bars(el, title, data, tip) {
    el.style.height = `${data.length * 38 + 4}px`;
    const inner = document.createElement("div"); inner.style.height = "100%"; el.append(inner);
    el.insertAdjacentHTML("beforeend", `<ul class="vh">${data.map((d) => `<li>${d.name}: ${d.label}</li>`).join("")}</ul>`);
    const max = Math.max(...data.map((d) => d.value));
    const tick = ({ x, y, payload }) => h("text", { x: 0, y: y + 4, textAnchor: "start", className: "c-name" }, payload.value);
    mount(inner, title, () => box(h(R.BarChart, { data, layout: "vertical", margin: { top: 0, right: 92, bottom: 0, left: 0 } },
      h(R.XAxis, { type: "number", hide: true, domain: [0, max] }),
      h(R.YAxis, { type: "category", dataKey: "name", width: 108, axisLine: false, tickLine: false, interval: 0, tick }),
      h(R.Tooltip, { isAnimationActive: false, cursor: { fill: "var(--hair)" }, content: tipOf(tip) }),
      h(R.Bar, { dataKey: "value", fill: "var(--a)", barSize: 14, radius: [0, 4, 4, 0], isAnimationActive: false },
        h(R.LabelList, { dataKey: "label", position: "right", className: "c-val" })))));
  }
  const costs = (el) => bars(el, "Cheltuielile sezonului, pe lucrări, de la cea mai mare.", FF.COSTS.map(([, name, value]) => ({ name, value, label: lei(value * 100, false) })),
    (d) => ({ title: d.name, lines: [d.label, `${pctOf(d.value)}% din cheltuielile sezonului`] }));
  const crops = (el) => bars(el, "Cât rămâne pe hectar, pe culturi, de la cea mai mare.", FF.CROPS.map((c) => ({ name: c.n, value: c.mv, label: `${c.m} / ha`, ha: c.ha })),
    (d) => ({ title: d.name, lines: [d.label, `${d.ha} ha lucrate`] }));

  window.Charts = { forecast, donut, donutHTML, costs, crops };
})();

}
