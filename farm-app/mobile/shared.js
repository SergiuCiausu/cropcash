/* Sample farm model, palettes and shared interactions for the three mobile variations.
   All figures are fictional. Money is held as integer bani and formatted by lei(). */
(function () {
  const PALETTES = [
    { id: "violet", name: "Field & Violet", note: "Lime and violet", v: { "a": "#5BA52A", "ink-a": "#3D7A13", "tint-a": "#E9F7D3", b: "#7C5CFC", "ink-b": "#5B3CD6", "tint-b": "#ECE8FF", bg: "#F8F8F3", deep1: "#2C5A14", deep2: "#4A32B0", hero: "#B4E85C" } },
    { id: "gold", name: "Field & Gold", note: "Lime and gold", v: { "a": "#5BA52A", "ink-a": "#3D7A13", "tint-a": "#E9F7D3", b: "#F2B81F", "ink-b": "#8A5C00", "tint-b": "#FFF2C9", bg: "#FBFAF1", deep1: "#2C5A14", deep2: "#8A5C00", hero: "#B4E85C" } },
    /* Two jobs: violet marks estimates and simulated money, gold marks what needs attention */
    { id: "both", name: "Field, Violet & Gold", note: "Violet for estimates, gold for bills", v: { "a": "#5BA52A", "ink-a": "#3D7A13", "tint-a": "#E9F7D3", b: "#7C5CFC", "ink-b": "#5B3CD6", "tint-b": "#ECE8FF", c: "#F2B81F", "ink-c": "#8A5C00", "tint-c": "#FFF2C9", bg: "#FBFAF3", deep1: "#2C5A14", deep2: "#4A32B0", hero: "#B4E85C" } },
    { id: "wheat", name: "Ripe Wheat", note: "Gold and olive", v: { a: "#E0A526", b: "#7C8B3A", "ink-a": "#855500", "ink-b": "#525E26", "tint-a": "#FBEFCF", "tint-b": "#EBEFD6", bg: "#FBF8F0", deep1: "#5F4108", deep2: "#856410", hero: "#F5CE4E" } },
    { id: "clay", name: "Turned Soil", note: "Terracotta and sage", v: { a: "#C8683A", b: "#6F9A7C", "ink-a": "#9A431C", "ink-b": "#3C674D", "tint-a": "#F8E4D9", "tint-b": "#DFEDE3", bg: "#FAF6F2", deep1: "#6F2E13", deep2: "#A04E27", hero: "#F6AE7E" } },
    { id: "vine", name: "Vineyard", note: "Plum and vine leaf", v: { a: "#8E3A74", b: "#6E9B46", "ink-a": "#7A2E63", "ink-b": "#46692A", "tint-a": "#F3E1EE", "tint-b": "#E5F0D9", bg: "#FAF6F9", deep1: "#4A1B40", deep2: "#7A2E63", hero: "#E6AEDC" } },
  ];

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    shield: '<path d="M12 3.5 5 6v5.5c0 4.500 3 7.500 7 9 4-1.500 7-4.500 7-9V6Z"/><path d="m9 12 2.200 2.200L15.200 10"/>',
    cal: '<rect x="4" y="5.500" width="16" height="15" rx="3"/><path d="M4 10.500h16M8.500 3.500v4M15.500 3.500v4"/>',
    home: '<path d="M4 10.500 12 4l8 6.500V19a1.500 1.500 0 0 1-1.500 1.500h-13A1.500 1.500 0 0 1 4 19Z"/><path d="M9.500 20.500V14h5v6.500"/>',
    chart: '<path d="M5 20v-7M12 20V5M19 20v-10"/>',
    sprout: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 5.500 4.500 5.500 4.500 10 7.500 12 12 12Z"/><path d="M12 14c0-3.500 2.500-6 7.500-6 0 4.500-3 6-7.500 6Z"/>',
    bank: '<path d="M3 21h18M5 21V10M19 21V10M9.500 21V10M14.500 21V10M3 10l9-6 9 6Z"/>',
    sack: '<path d="M6.500 8.500h11l1.500 12H5Z"/><path d="M9 8.500V7a3 3 0 0 1 6 0v1.500"/>',
    down: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>', up: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
    map: '<path d="M9 4 3 6.500v13L9 17l6 3 6-2.500v-13L15 7Z"/><path d="M9 4v13M15 7v13"/>',
    tool: '<path d="M20 7.500a5 5 0 0 1-6.700 4.700l-6.800 6.800a2 2 0 0 1-2.800-2.800l6.800-6.800A5 5 0 0 1 17 4l-3 3 3 3Z"/>',
    drop: '<path d="M12 3.500c3.500 4.500 6 7.500 6 10.500a6 6 0 0 1-12 0c0-3 2.500-6 6-10.500Z"/>',
    spray: '<path d="M9 9h6v11.500H9ZM10.500 9V5.500h3V9M16.500 4h.01M19.500 4h.01M18 6.500h.01M19.500 9h.01"/>',
    seed: '<path d="M12 21c-4.500-2-6-6-6-9.500C6 7.500 9 4 12 3c3 1 6 4.500 6 8.500 0 3.500-1.500 7.500-6 9.500Z"/><path d="M12 8v8"/>',
    check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  };
  const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n].replace(/\.500/g, ".5").replace(/\.200/g, ".2")}</svg>`;

  /* ---- Money ---- */
  const MINUS = "−";
  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function lei(b, dec = true) {
    const abs = Math.abs(Math.round(b)), whole = Math.floor(abs / 100), cents = String(abs % 100).padStart(2, "0");
    return `${b < 0 ? MINUS : ""}${group(whole)}${dec ? "," + cents : ""} lei`;
  }
  const signed = (b) => (b > 0 ? "+" : "") + lei(b);
  function parseAmount(s) {
    const t = s.replace(/lei/gi, "").trim();
    let n = NaN;
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) n = Number(t.replace(/\./g, "").replace(",", "."));
    else if (/^\d+([,.]\d{1,2})?$/.test(t)) n = Number(t.replace(",", "."));
    return n > 0 ? Math.round(n * 100) : null;
  }
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---- Sample farm ---- */
  const START = 14017050, GOAL = 6000000;
  const MONTHS = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  const MONTHS_LONG = ["November", "December", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October"];
  const INPUTS = [9000, 26250, 2000, 6000, 34000, 28000, 12000, 8000, 18000, 6000, 12250, 1000];
  const FIXED = 9450, F = { poor: .8, expected: 1, good: 1.15 };
  const COMING = [
    { ic: "bank", tone: "c", name: "Loan instalment", sub: "Monthly payment", bani: -345000, date: "12 nov." },
    { ic: "sack", tone: "c", name: "AgroNova Inputs", sub: "Winter fertiliser", bani: -575000, date: "15 nov." },
    { ic: "down", tone: "b", name: "APIA subsidy", sub: "Sample amount", bani: 4620000, date: "16 dec.", status: "Estimated" },
    { ic: "map", tone: "c", name: "Land rent", sub: "Yearly payment", bani: -2625000, date: "20 dec." },
  ];
  const RECENT = [
    { ic: "drop", tone: "b", name: "Fuel Depot Bărăgan", sub: "Diesel", bani: -325000, date: "6 nov.", status: "Pending" },
    { ic: "tool", name: "Service Drum Bun", sub: "Combine repair", bani: -118000, date: "28 oct." },
    { ic: "sprout", name: "Cereal Trade SRL", sub: "Sunflower, 33,6 t", bani: 7728000, date: "21 oct." },
    { ic: "sack", name: "AgroNova Inputs", sub: "Fertiliser, autumn", bani: -640000, date: "12 oct." },
  ];
  const COSTS = [["sack", "Fertiliser", 48200], ["drop", "Diesel", 30600], ["map", "Land rent", 26250], ["seed", "Seed", 24300], ["spray", "Crop protection", 19400], ["tool", "Repairs", 13750]];
  const CROPS = [
    { n: "Maize", ha: 10, t: "60 t", price: "1.000 lei / t", inc: "60.000 lei", m: "2.131 lei", mv: 2131, state: "Stored" },
    { n: "Sunflower", ha: 14, t: "33,6 t", price: "2.300 lei / t", inc: "77.280 lei", m: "1.651 lei", mv: 1651, state: "Sold" },
    { n: "Wheat", ha: 18, t: "93,6 t", price: "1.050 lei / t", inc: "98.280 lei", m: "1.591 lei", mv: 1591, state: "Sold" },
  ];
  const CLEAN = [
    { n: "Insurance on sold tractor", s: "Tractor sold in March", a: 41200 },
    { n: "Unused field-map subscription", s: "Not opened since April", a: 18900 },
    { n: "Second fuel card fee", s: "Same supplier, no fills", a: 6450 },
  ];
  const RULES = [["Set aside 5% of every sale", "Simulated", true], ["Warn me before lean months", "4 weeks ahead", true], ["Remind me of subsidy dates", "Simulated", false]];

  const S = { extra: 0, reserve: 3800000, path: "expected", tx: RECENT.slice(), sel: new Set(), moved: false, undo: null, view: "home" };
  const subs = [];
  const on = (fn) => { subs.push(fn); fn(); };
  const emit = () => subs.forEach((f) => f());

  function series(path) {
    const f = F[path], inc = [0, 46200, 0, 60000 * f, 0, 0, 0, 0, 0, 98280 * f, 77280 * f, 0];
    let b = START + S.extra; const out = [];
    for (let i = 0; i < 12; i++) { b = Math.round(b + (inc[i] - INPUTS[i] - FIXED) * 100); out.push(b); }
    return out;
  }
  const lowOf = (a) => { let k = 0; a.forEach((v, i) => { if (v < a[k]) k = i; }); return { i: k, v: a[k], month: MONTHS_LONG[k] }; };
  function table(path) {
    const f = F[path], s = series(path);
    const inc = [0, 46200, 0, 60000 * f, 0, 0, 0, 0, 0, 98280 * f, 77280 * f, 0];
    return s.map((bal, i) => ({ m: MONTHS_LONG[i], low: i === lowOf(s).i, in: Math.round(inc[i] * 100), out: (INPUTS[i] + FIXED) * 100, bal }));
  }
  const balance = () => START + S.extra;
  const freed = () => [...S.sel].reduce((t, i) => t + CLEAN[i].a, 0);

  /* ---- Shared markup ---- */
  const txRow = (t) => `<li class="tx"><span class="ti ${t.tone || ""}">${icon(t.ic)}</span><div class="tm"><b>${esc(t.name)}</b><small>${esc(t.sub)}</small></div><div class="ta"><b class="${t.bani > 0 ? "pos" : ""}">${signed(t.bani)}</b><small>${t.status ? `<span class="st">${t.status}</span><span class="sep">, </span>` : ""}${t.date}</small></div></li>`;
  const costTotal = COSTS.reduce((t, c) => t + c[2], 0);
  const costRows = () => COSTS.map(([ic, n, a]) => `<li class="cost"><span class="ti">${icon(ic)}</span><div><div class="cl"><b>${n}</b><span class="pct">${Math.round(a / costTotal * 100)}%</span><span class="amt">${lei(a * 100, false)}</span></div><div class="bar"><i style="transform:scaleX(${(a / COSTS[0][2]).toFixed(3)})"></i></div></div></li>`).join("");
  const cropBody = (c) => `<div class="crop-l"><span>Margin per hectare</span><span>${c.m}</span></div><div class="bar"><i style="transform:scaleX(${(c.mv / 2131).toFixed(3)})"></i></div><div class="crop-l" style="margin-top:8px"><span>Area</span><span>${c.ha} ha</span></div><div class="crop-l"><span>Harvest</span><span>${c.t}</span></div><div class="crop-l"><span>Price</span><span>${c.price}</span></div><div class="crop-l"><span>Income</span><span>${c.inc}</span></div>`;
  const cropState = (c) => `<span class="st-pill">${c.state}</span>`;
  const resCard = () => `<div class="res-card"><p class="res-label">Spring inputs reserve, simulated</p><p class="res-amt">${lei(S.reserve)}</p><div class="bar"><i style="transform:scaleX(${Math.min(1, S.reserve / GOAL).toFixed(4)})"></i></div><div class="res-note"><span>of ${lei(GOAL, false)}</span><span>By 1 mar. 2027</span></div></div>`;
  const cleanList = () => `<ul class="clean">${CLEAN.map((c, i) => { const on = S.sel.has(i); return `<li><div><b>${c.n}</b><small>${c.s}, ${lei(c.a)} a month</small></div><button type="button" class="chipb" data-cost="${i}" aria-pressed="${on}" aria-label="${on ? "Keep" : "Cancel"} ${c.n}"${S.moved ? " disabled" : ""}>${on ? "Cancelled" : "Cancel"}</button></li>`; }).join("")}</ul><button type="button" class="btn-move" data-move${freed() && !S.moved ? "" : " disabled"}>${S.moved ? "Moved to the reserve (simulated)" : freed() ? `Move ${lei(freed())} to the reserve` : "Choose a cost to cancel"}</button>`;
  const ruleRows = () => RULES.map(([n, s, v], i) => `<button type="button" class="rule" role="switch" data-rule="${i}" aria-checked="${v}"><span><b>${n}</b><small>${s}</small></span><span class="sw"></span></button>`).join("");

  /* ---- Chart: drawn at real pixel size so labels stay legible ---- */
  function smooth(p) {
    let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
    for (let i = 1; i < p.length; i++) { const a = p[i - 1], q = p[i], m = (a[0] + q[0]) / 2; d += ` C${m.toFixed(1)} ${a[1].toFixed(1)},${m.toFixed(1)} ${q[1].toFixed(1)},${q[0].toFixed(1)} ${q[1].toFixed(1)}`; }
    return d;
  }
  function drawChart(el) {
    const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
    const T = 10, B = 26, L = 2, R = 13, pts = (k) => [balance(), ...series(k)];
    const cur = pts(S.path), hi = pts("good"), lo = pts("poor");
    const mx = Math.max(...hi, ...lo), mn = Math.min(0, ...lo);
    const x = (i) => L + i / 12 * (W - L - R), y = (v) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
    const map = (a) => a.map((v, i) => [x(i), y(v)]);
    const band = `${smooth(map(hi))} L${map(lo).reverse().map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L")} Z`;
    const low = lowOf(series(S.path)), step = W < 300 ? 2 : 1;
    const labs = MONTHS.map((m, i) => (i % step && i !== low.i) ? "" : `<text class="c-lab${i === low.i ? " on" : ""}" x="${x(i + 1).toFixed(1)}" y="${H - 6}" text-anchor="middle">${m}</text>`).join("");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><line class="c-base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><path class="c-band" d="${band}"/><path class="c-line" d="${smooth(map(cur))}"/><circle class="c-dot" r="5" cx="${x(low.i + 1).toFixed(1)}" cy="${y(low.v).toFixed(1)}"/>${labs}</svg>`;
  }
  function mountChart(el) {
    el.setAttribute("role", "img");
    const label = () => el.setAttribute("aria-label", `Projected cash for twelve months. Lowest in ${lowOf(series(S.path)).month} at ${lei(lowOf(series(S.path)).v)}.`);
    new ResizeObserver(() => drawChart(el)).observe(el);
    on(() => { label(); drawChart(el); });
  }

  /* ---- Spring with velocity handoff; starts from the current value ---- */
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function spring(from, to, v0, { response = .35, damping = 1 }, update, done) {
    if (reduced()) { update(to); done && done(); return () => {}; }
    const k = (2 * Math.PI / response) ** 2, c = 2 * damping * Math.sqrt(k);
    let x = from, v = v0, last = performance.now(), id;
    const tick = (now) => {
      let dt = Math.min(.032, (now - last) / 1000); last = now;
      for (; dt > 0; dt -= .004) { const h = Math.min(.004, dt); v += (-k * (x - to) - c * v) * h; x += v * h; }
      if (Math.abs(x - to) < .3 && Math.abs(v) < 8) { update(to); done && done(); return; }
      update(x); id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }

  /* ---- Palette ---- */
  const DEFAULT = document.documentElement.dataset.defaultPalette || "violet";
  const LAYOUT = (location.pathname.split("/").pop() || "index").replace(/\.html$/, "");
  const KEY = `farm-palette:${LAYOUT}`;
  /* Single-accent palettes use their second color for both jobs */
  /* Six-category chart colors, each set checked with the dataviz palette validator */
  const FIELD_CH = ["#5BA52A", "#7C5CFC", "#3D7A13", "#5B3CD6", "#C98A00", "#B8476A"];
  const CH = { violet: FIELD_CH, gold: FIELD_CH, both: FIELD_CH, wheat: ["#B8860B", "#5B6FC8", "#2F7A4A", "#A04A12", "#5E8F1E", "#C0425A"], clay: ["#C8683A", "#6A5BC8", "#2F9A6C", "#8F3A12", "#B08A1E", "#3A6FC0"], vine: ["#8E3A74", "#5F9E2E", "#C25BA8", "#3A6E1A", "#B08A1E", "#5B6FC8"] };
  const tokens = (p) => ({ c: p.v.b, "ink-c": p.v["ink-b"], "tint-c": p.v["tint-b"], dn: p.v.c || p.v.hero, ...Object.fromEntries(CH[p.id].map((c, i) => [`ch${i + 1}`, c])), ...p.v });
  function palette(id, save = true) {
    const p = PALETTES.find((x) => x.id === id) || PALETTES.find((x) => x.id === DEFAULT);
    for (const [k, v] of Object.entries(tokens(p))) document.documentElement.style.setProperty(`--${k}`, v);
    document.documentElement.dataset.palette = p.id;
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = p.v.bg;
    document.querySelectorAll("[data-pal]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.pal === p.id));
    if (save) { try { localStorage.setItem(KEY, p.id); } catch (e) {} }
  }
  function mountPalette(host) {
    host.classList.add("pal");
    host.innerHTML = `<button type="button" class="pal-btn" aria-label="Color palette" aria-expanded="false"><span class="pal-dot"></span></button><div class="pal-menu" hidden><p>Color palette</p>${PALETTES.map((p) => `<button type="button" class="pal-opt" data-pal="${p.id}" aria-pressed="false" style="--c1:${p.v.a};--c2:${p.v.b};--c3:${tokens(p).c}"><i></i><span>${p.name}<small>${p.note}</small></span>${icon("check")}</button>`).join("")}</div>`;
    const btn = host.querySelector(".pal-btn"), menu = host.querySelector(".pal-menu");
    const set = (open) => { menu.hidden = !open; btn.setAttribute("aria-expanded", open); };
    btn.addEventListener("click", () => set(menu.hidden));
    menu.addEventListener("click", (e) => { const o = e.target.closest("[data-pal]"); if (o) { palette(o.dataset.pal); set(false); btn.focus(); } });
    document.addEventListener("pointerdown", (e) => { if (!host.contains(e.target)) set(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { set(false); btn.focus(); } });
    palette(document.documentElement.dataset.palette, false);
  }

  /* ---- Toast and undo ---- */
  let toastEl, toastT;
  function toast(msg, undo) {
    S.undo = undo || null;
    toastEl.querySelector("span").textContent = msg;
    toastEl.querySelector("button").hidden = !undo;
    toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 6000);
  }

  /* ---- Actions ---- */
  function record(kind, what, bani) {
    const b = kind === "sale" ? bani : -bani;
    const item = { ic: kind === "sale" ? "sprout" : "sack", name: what, sub: kind === "sale" ? "Sale" : "Expense", bani: b, date: "7 nov." };
    S.extra += b; S.tx.unshift(item); emit();
    toast(`${signed(b)} added`, () => { S.extra -= b; S.tx.splice(S.tx.indexOf(item), 1); emit(); toast("Undone"); });
  }
  function move() {
    const amt = freed(); if (!amt || S.moved) return;
    const sel = new Set(S.sel);
    S.moved = true; S.reserve += amt; S.extra -= amt; emit();
    toast(`${lei(amt)} moved, simulated`, () => { S.moved = false; S.reserve -= amt; S.extra += amt; S.sel = sel; emit(); toast("Undone"); });
  }
  function setPath(p) {
    S.path = p;
    document.querySelectorAll("[data-path]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.path === p));
    emit();
    if (!reduced()) document.querySelectorAll(".chart svg").forEach((s) => s.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 180, easing: "ease-out" }));
    FF.onPath && FF.onPath(p);
  }
  function go(view) {
    S.view = view;
    document.querySelectorAll("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== view));
    document.querySelectorAll("[data-go]").forEach((b) => (b.matches("nav *") ? (b.dataset.go === view ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")) : 0));
    document.querySelectorAll(".scroll").forEach((s) => (s.scrollTop = 0));
    FF.onView && FF.onView(view);
  }

  /* ---- Entry dialog ---- */
  let dlg, kind = "sale", opening = 0;
  function openEntry(k) {
    kind = k;
    dlg.querySelector("h2").textContent = k === "sale" ? "Record a sale" : "Add an expense";
    dlg.querySelector('[type="submit"]').textContent = k === "sale" ? "Add sale" : "Add expense";
    dlg.querySelector("#e-what-l").textContent = k === "sale" ? "What did you sell?" : "What did you pay for?";
    dlg.querySelector("form").reset();
    dlg.querySelectorAll(".err").forEach((e) => (e.textContent = ""));
    dlg.querySelectorAll("input").forEach((i) => i.removeAttribute("aria-invalid"));
    dlg.style.transform = "";
    dlg.showModal();
    const t = ++opening;
    requestAnimationFrame(() => requestAnimationFrame(() => t === opening && dlg.classList.add("in")));
  }
  function closeEntry() {
    opening++; dlg.classList.remove("in"); dlg.style.transform = "";
    const instant = reduced() || getComputedStyle(dlg).transitionDuration === "0s";
    setTimeout(() => dlg.open && !dlg.classList.contains("in") && dlg.close(), instant ? 0 : 320);
  }
  function buildEntry() {
    document.body.insertAdjacentHTML("beforeend", `<dialog id="entry" aria-labelledby="e-t"><form id="e-form" novalidate><div class="e-grab"><i></i></div><h2 id="e-t"></h2><label for="e-what" id="e-what-l"></label><input id="e-what" maxlength="60" autocomplete="off" aria-describedby="e-what-err"><p class="err" id="e-what-err"></p><label for="e-amt">Amount in lei</label><input id="e-amt" inputmode="decimal" autocomplete="off" placeholder="1.250,50" aria-describedby="e-amt-err"><p class="err" id="e-amt-err"></p><div class="e-acts"><button type="button" data-close>Cancel</button><button type="submit"></button></div></form></dialog>`);
    dlg = document.getElementById("entry");
    const what = dlg.querySelector("#e-what"), amt = dlg.querySelector("#e-amt");
    dlg.querySelector("[data-close]").addEventListener("click", closeEntry);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeEntry(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) { const r = dlg.getBoundingClientRect(); if (e.clientY < r.top) closeEntry(); } });
    dlg.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const w = what.value.trim(), b = parseAmount(amt.value);
      const we = w ? "" : "Add a short description.", ae = b ? "" : "Enter an amount above 0, such as 1.250,50.";
      dlg.querySelector("#e-what-err").textContent = we; dlg.querySelector("#e-amt-err").textContent = ae;
      what.toggleAttribute("aria-invalid", !!we); if (we) what.setAttribute("aria-invalid", "true");
      amt.toggleAttribute("aria-invalid", !!ae); if (ae) amt.setAttribute("aria-invalid", "true");
      if (we) return what.focus(); if (ae) return amt.focus();
      record(kind, w, b); closeEntry();
    });
  }

  /* ---- Boot ---- */
  const q = new URLSearchParams(location.search);
  /* A saved cyan choice no longer exists, so it falls through to this layout's default */
  let saved = null; try { saved = localStorage.getItem(KEY) || localStorage.getItem("farm-mobile-palette"); } catch (e) {}
  palette(q.get("palette") || saved || DEFAULT, false);

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-go],[data-entry],[data-rule],[data-cost],[data-move],[data-path],[data-undo],[data-jump]");
    if (!t) return;
    if (t.dataset.go) go(t.dataset.go);
    else if (t.dataset.entry) openEntry(t.dataset.entry);
    else if (t.dataset.rule) { const i = +t.dataset.rule, v = !RULES[i][2]; RULES[i][2] = v; document.querySelectorAll(`[data-rule="${i}"]`).forEach((r) => r.setAttribute("aria-checked", v)); }
    else if (t.dataset.cost) { const i = +t.dataset.cost; S.sel.has(i) ? S.sel.delete(i) : S.sel.add(i); emit(); }
    else if ("move" in t.dataset) move();
    else if (t.dataset.path) setPath(t.dataset.path);
    else if ("undo" in t.dataset) { const u = S.undo; S.undo = null; u && u(); }
    else if (t.dataset.jump) { go("home"); const el = document.getElementById(t.dataset.jump); FF.onJump ? FF.onJump(el) : el && el.scrollIntoView({ block: "start" }); }
  });
  addEventListener("message", (e) => {
    if (!e.data || e.data.type !== "farm") return;
    if (e.data.palette) palette(e.data.palette, false);
    if (e.data.view) go(e.data.view);
  });

  const FF = { S, PALETTES, tokens, palette, icon, lei, signed, series, lowOf, table, balance, on, emit, txRow, costRows, cropBody, cropState, resCard, cleanList, ruleRows, mountChart, mountPalette, spring, reduced, go, toast, closeEntry, COMING, CROPS, COSTS, costTotal, CLEAN, MONTHS, MONTHS_LONG,
    get dialog() { return dlg; },
    start() {
      document.querySelector(".app").insertAdjacentHTML("beforeend", `<div class="toast" id="toast" role="status"><span></span><button type="button" data-undo>Undo</button></div>`);
      toastEl = document.getElementById("toast");
      buildEntry();
      document.querySelectorAll("[data-ic]").forEach((el) => el.insertAdjacentHTML("afterbegin", icon(el.dataset.ic)));
      document.querySelectorAll("[data-pal-host]").forEach(mountPalette);
      go(q.get("view") || "home");
    },
  };
  window.FF = FF;
})();
