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
    const label = () => { const l = FF.lowOf(FF.series(S.path)); return `Projected cash for twelve months. Lowest in ${l.month} at ${lei(l.v)}. Hover or use the arrow keys for each month.`; };
    const tick = (low) => ({ x, y, payload, index }) => {
      const i = index - 1, wide = el.clientWidth >= 300;
      if (index === 0 || (!wide && i % 2 && i !== low)) return h("g");
      return h("text", { x, y: y + 12, textAnchor: "middle", className: `c-lab${i === low ? " on" : ""}` }, payload.value);
    };
    if (el.classList.contains("big")) el.insertAdjacentHTML("afterend", `<ul class="ch-leg"><li><i class="l"></i>Selected path</li><li><i class="r"></i>Poor to good harvest</li><li><i class="d"></i>Tightest month</li></ul>`);
    mount(el, label, (animate) => {
      const cur = pts(S.path), hi = pts("good"), lo = pts("poor"), low = FF.lowOf(FF.series(S.path));
      const data = cur.map((v, i) => ({ m: i ? MONTHS[i - 1] : "now", long: i ? MONTHS_LONG[i - 1] : "Today", v, range: [Math.min(lo[i], hi[i]), Math.max(lo[i], hi[i])] }));
      const min = Math.min(0, ...lo), max = Math.max(...hi, ...lo);
      return box(h(R.ComposedChart, { data, margin: { top: 10, right: 14, bottom: 0, left: 2 } },
        h(R.XAxis, { dataKey: "m", scale: "point", interval: 0, tickLine: false, axisLine: { stroke: "var(--hair-2)" }, height: 26, tick: tick(low.i) }),
        h(R.YAxis, { hide: true, domain: [min, max] }),
        h(R.Tooltip, { cursor: { stroke: "var(--on-hero-2)", strokeWidth: 1 }, isAnimationActive: false, content: tipOf((d) => ({ title: d.long, lines: d.range[0] === d.range[1] ? [lei(d.v)] : [lei(d.v), `Range ${lei(d.range[0], false)} to ${lei(d.range[1], false)}`] })) }),
        h(R.Area, { dataKey: "range", type: "monotone", stroke: "none", fill: "var(--on-hero)", fillOpacity: .1, activeDot: false, legendType: "none", isAnimationActive: animate, animationDuration: 250, tooltipType: "none" }),
        h(R.Line, { dataKey: "v", type: "monotone", stroke: "var(--on-hero)", strokeWidth: 2.2, strokeLinecap: "round", dot: false, activeDot: { r: 5, fill: "var(--surface)", stroke: "var(--on-hero)", strokeWidth: 2 }, isAnimationActive: animate, animationDuration: 250 }),
        h(R.ReferenceDot, { x: MONTHS[low.i], y: low.v, r: 5, fill: "var(--hero)", stroke: "var(--on-hero)", strokeWidth: 2, ifOverflow: "visible" })));
    });
  }

  const donutHTML = () => `<div class="donut"><div class="pie"><div class="pie-chart"></div><div class="pie-c"><span>162.500</span><small>lei total</small></div></div><ul class="leg">${FF.COSTS.map(([, n, a], i) => `<li><i style="background:${leg(i)}"></i><span>${n}</span><b>${pctOf(a)}%</b></li>`).join("")}</ul></div>`;
  function donut(el) {
    const data = FF.COSTS.map(([, name, value], i) => ({ name, value, fill: leg(i) }));
    mount(el, "Season costs by category. The list beside the chart gives each share.", () => box(h(R.PieChart, null,
      h(R.Pie, { data, dataKey: "value", nameKey: "name", innerRadius: "72%", outerRadius: "100%", paddingAngle: 2, startAngle: 90, endAngle: -270, stroke: "none", isAnimationActive: false }),
      h(R.Tooltip, { isAnimationActive: false, allowEscapeViewBox: { x: true, y: true }, wrapperStyle: { zIndex: 5 }, content: tipOf((d) => ({ title: d.name, lines: [lei(d.value * 100, false), `${pctOf(d.value)}% of season costs`] })) }))));
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
  const costs = (el) => bars(el, "Season costs by category, largest first.", FF.COSTS.map(([, name, value]) => ({ name, value, label: lei(value * 100, false) })),
    (d) => ({ title: d.name, lines: [d.label, `${pctOf(d.value)}% of season costs`] }));
  const crops = (el) => bars(el, "Margin per hectare by crop, largest first.", FF.CROPS.map((c) => ({ name: c.n, value: c.mv, label: `${c.m} / ha`, ha: c.ha })),
    (d) => ({ title: d.name, lines: [d.label, `${d.ha} ha farmed`] }));

  window.Charts = { forecast, donut, donutHTML, costs, crops };
})();
