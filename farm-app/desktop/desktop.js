/* Binds the shared sample farm to [data-f] slots, so each laptop layout is only markup and CSS. */
(function () {
  const { S, lei, icon } = FF;
  const set = (k, v) => document.querySelectorAll(`[data-f="${k}"]`).forEach((e) => (e.textContent = v));
  const html = (k, v) => document.querySelectorAll(`[data-f="${k}"]`).forEach((e) => (e.innerHTML = v));
  const TITLES = {
    home: ["Good morning, Maria", "Everything the farm needs from you this week."],
    stats: ["Forecast", "See whether the money lasts to harvest. A range, not a promise."],
    fields: ["Your fields", "What each crop left you this season, per hectare."],
    reserve: ["Reserves", "Money set aside for spring inputs, simulated in this demo."],
  };

  const TILES = [
    ['data-entry="sale"', "plus", "Record sale", "Money coming in"],
    ['data-entry="expense"', "minus", "Add expense", "Money going out"],
    ['data-go="reserve"', "shield", "Set aside", "For spring inputs"],
    ['data-jump="coming"', "cal", "Bills", "4 coming up"],
  ];
  const tiles = (only) => TILES.filter((_, i) => !only || only.includes(i)).map(([a, ic, t, s]) => `<button type="button" ${a}><span class="i">${icon(ic)}</span><span class="go">${icon("arrow")}</span><span class="t"><b>${t}</b><small>${s}</small></span></button>`).join("");

  const STEPS = ["var(--a)", "var(--b)", "var(--ink-a)", "var(--ink-b)", "var(--hero)", "var(--hair-2)"];
  function donut() {
    const C = 2 * Math.PI * 15.9; let off = 0, ring = "";
    FF.COSTS.forEach(([, , a], i) => { const l = a / FF.costTotal * C; ring += `<circle cx="21" cy="21" r="15.9" fill="none" stroke-width="5" style="stroke:${STEPS[i]}" stroke-dasharray="${Math.max(l - .7, .2).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`; off += l; });
    return `<div class="donut"><div class="ring"><svg viewBox="0 0 42 42" aria-hidden="true">${ring}</svg><div><span>162.500</span><small>lei total</small></div></div><ul class="leg">${FF.COSTS.map(([, n, a], i) => `<li><i style="background:${STEPS[i]}"></i><span>${n}</span><b>${Math.round(a / FF.costTotal * 100)}%</b></li>`).join("")}</ul></div>`;
  }

  function render() {
    const s = FF.series(S.path), low = FF.lowOf(s), pct = Math.round(S.reserve / 6000000 * 100);
    set("bal", lei(FF.balance()));
    set("res", lei(S.reserve));
    set("low-m", low.month); set("low-v", lei(low.v));
    set("bill", lei(FF.COMING[0].bani));
    set("pct", `${pct}%`);
    set("end", lei(s[11]));
    set("poor", lei(FF.series("poor")[11])); set("good", lei(FF.series("good")[11]));
    set("togo", `${lei(6000000 - S.reserve)} still to set aside`);
    set("tight", `Your tightest month is ${low.month}, at ${lei(low.v)}.`);
    document.querySelectorAll("[data-f=res-fill]").forEach((e) => (e.style.transform = `scaleX(${Math.min(1, S.reserve / 6000000)})`));
    html("coming", FF.COMING.map(FF.txRow).join(""));
    html("recent", S.tx.slice(0, 5).map(FF.txRow).join(""));
    html("res-card", FF.resCard());
    html("clean", FF.cleanList());
    html("months", `<div class="mrow head"><span>Month</span><span>In</span><span>Out</span><span>Closing balance</span></div>` + FF.table(S.path).map((r) => `<div class="mrow${r.low ? " low" : ""}"><span>${r.m}${r.low ? ", tightest" : ""}</span><span>${lei(r.in, false)}</span><span>${lei(r.out, false)}</span><span class="v">${lei(r.bal)}</span></div>`).join(""));
  }

  window.Desk = {
    boot() {
      FF.onView = (v) => {
        set("title", TITLES[v][0]); set("sub-title", TITLES[v][1]);
        scrollTo(0, 0);
        document.querySelectorAll("[data-right]").forEach((e) => (e.scrollTop = 0));
      };
      FF.start();
      document.querySelectorAll(".chart").forEach(FF.mountChart);
      html("tiles", tiles());
      html("tiles-2", tiles([2, 3]));
      html("donut", donut());
      html("costs", FF.costRows());
      html("rules", FF.ruleRows());
      html("crops", FF.CROPS.map((c) => `<article class="card crop"><h2>${c.n}${FF.cropState(c)}</h2><p class="n20">${c.m}</p><p class="lab">margin per hectare</p>${FF.cropBody(c).replace(/^.*?<\/div>/, "")}</article>`).join(""));
      html("margins", FF.CROPS.map((c) => `<div class="crop-m"><div class="crop-l"><span>${c.n}, ${c.ha} ha</span><span>${c.m} / ha</span></div><div class="bar"><i style="transform:scaleX(${(c.mv / 2131).toFixed(3)})"></i></div></div>`).join(""));
      const meta = document.querySelector('meta[name="theme-color"]');
      const sync = () => { if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--hero").trim(); };
      new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ["data-palette"] });
      sync();
      FF.on(render);
    },
  };
})();
