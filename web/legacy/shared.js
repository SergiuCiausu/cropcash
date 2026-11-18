/* Legacy page script, run by lib/boot.ts. Replaced page by page in docs/web-react-port-plan.md N5. */
/* eslint-disable */
// @ts-nocheck
import { iconSvg } from '../lib/ui/icons';
export default function install() {
/* Icons, money formatting and shared interactions. The landing page's farm is Ion's, from the engine. Money is held as integer bani and formatted by lei(). */
(function () {
  /* The icons live in lib/ui, shared with the React frame. */
  const icon = iconSvg;

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

  /* ---- The farm on the landing page: Ion, from the engine (web/lib/landing-data.ts) ---- */
  const L = window.__LANDING || { start: 0, months: [], series: { poor: [], expected: [], good: [] }, flows: { poor: [], expected: [], good: [] }, costs: [], crops: [], coming: [], income: [], salary: 0 };
  const START = L.start, GOAL = L.salary;
  const MONTHS = L.months.map((m) => m.short);
  const MONTHS_LONG = L.months.map((m) => m.long);
  const COMING = L.coming, RECENT = [], COSTS = L.costs, CROPS = L.crops, CLEAN = [], RULES = [];

  const S = { extra: 0, reserve: L.salary, path: "expected", tx: RECENT.slice(), sel: new Set(), moved: false, undo: null, view: "home" };
  const subs = [];
  const on = (fn) => { subs.push(fn); fn(); };
  const emit = () => subs.forEach((f) => f());

  const series = (path) => (L.series[path] || []).map((b) => b + S.extra);
  const lowOf = (a) => { let k = 0; a.forEach((v, i) => { if (v < a[k]) k = i; }); return { i: k, v: a[k], month: MONTHS_LONG[k] }; };
  function table(path) {
    const s = series(path), low = lowOf(s).i;
    return s.map((bal, i) => ({ m: MONTHS_LONG[i], low: i === low, in: L.flows[path][i].in, out: L.flows[path][i].out, bal }));
  }
  const balance = () => START + S.extra;
  const freed = () => [...S.sel].reduce((t, i) => t + CLEAN[i].a, 0);

  /* ---- Shared markup ---- */
  const txRow = (t) => `<li class="tx"><span class="ti ${t.tone || ""}">${icon(t.ic)}</span><div class="tm"><b>${esc(t.name)}</b><small>${esc(t.sub)}</small></div><div class="ta"><b class="${t.bani > 0 ? "pos" : ""}">${signed(t.bani)}</b><small>${t.status ? `<span class="st">${t.status}</span><span class="sep">, </span>` : ""}${t.date}</small></div></li>`;
  const costTotal = COSTS.reduce((t, c) => t + c[2], 0);
  const costRows = () => COSTS.map(([ic, n, a]) => `<li class="cost"><span class="ti">${icon(ic)}</span><div><div class="cl"><b>${n}</b><span class="pct">${Math.round(a / costTotal * 100)}%</span><span class="amt">${lei(a * 100, false)}</span></div><div class="bar"><i style="transform:scaleX(${(a / COSTS[0][2]).toFixed(3)})"></i></div></div></li>`).join("");
  const cropBody = (c) => `<div class="crop-l"><span>Rămâne pe hectar</span><span>${c.m}</span></div><div class="bar"><i style="transform:scaleX(${(c.mv / 2131).toFixed(3)})"></i></div><div class="crop-l" style="margin-top:8px"><span>Area</span><span>${c.ha} ha</span></div><div class="crop-l"><span>Harvest</span><span>${c.t}</span></div><div class="crop-l"><span>Price</span><span>${c.price}</span></div><div class="crop-l"><span>Income</span><span>${c.inc}</span></div>`;
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
    const NAME = { poor: "Poor", expected: "Expected", good: "Good" };
    const others = Object.keys(NAME).filter((k) => k !== S.path).sort((a, b) => pts(b)[12] - pts(a)[12]);
    const mx = Math.max(...hi, ...lo), mn = Math.min(0, ...lo);
    const x = (i) => L + i / 12 * (W - L - R), y = (v) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
    const map = (a) => a.map((v, i) => [x(i), y(v)]);
    const dotted = others.map((k, i) => { const end = y(pts(k)[12]) + (i ? 15 : -7); return `<path class="c-alt" d="${smooth(map(pts(k)))}"/><text class="c-lab" x="${x(12).toFixed(1)}" y="${end.toFixed(1)}" text-anchor="end">${NAME[k]}</text>`; }).join("");
    const low = lowOf(series(S.path)), step = W < 300 ? 2 : 1;
    const labs = MONTHS.map((m, i) => (i % step && i !== low.i) ? "" : `<text class="c-lab${i === low.i ? " on" : ""}" x="${x(i + 1).toFixed(1)}" y="${H - 6}" text-anchor="middle">${m}</text>`).join("");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><line class="c-base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>${dotted}<path class="c-line" d="${smooth(map(cur))}"/><circle class="c-dot" r="5" cx="${x(low.i + 1).toFixed(1)}" cy="${y(low.v).toFixed(1)}"/>${labs}</svg>`;
  }
  function mountChart(el) {
    el.setAttribute("role", "img");
    const label = () => el.setAttribute("aria-label", `Banii din cont, lună cu lună, pe douăsprezece luni. Cel mai puțin în ${lowOf(series(S.path)).month}: ${lei(lowOf(series(S.path)).v)}.`);
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
    if (e.data.view) go(e.data.view);
  });

  const FF = { S, icon, lei, signed, series, lowOf, table, balance, on, emit, txRow, costRows, cropBody, cropState, resCard, cleanList, ruleRows, mountChart, spring, reduced, go, toast, closeEntry, COMING, CROPS, COSTS, costTotal, CLEAN, GOAL, MONTHS, MONTHS_LONG,
    get dialog() { return dlg; },
    start() {
      document.querySelector(".app").insertAdjacentHTML("beforeend", `<div class="toast" id="toast" role="status"><span></span><button type="button" data-undo>Undo</button></div>`);
      toastEl = document.getElementById("toast");
      buildEntry();
      document.querySelectorAll("[data-ic]").forEach((el) => el.insertAdjacentHTML("afterbegin", icon(el.dataset.ic)));
      go(q.get("view") || "home");
    },
  };
  window.FF = FF;
})();

}
