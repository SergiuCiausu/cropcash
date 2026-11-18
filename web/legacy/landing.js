/* The landing page's script, from landing-variations/10-harvest.html. The farm is Ion's (lib/landing-data.ts via FF), the text is Romanian, and Recharts comes from npm instead of unpkg. */
// @ts-nocheck
export default function install() {

document.querySelectorAll("[data-ic]").forEach((e) => e.insertAdjacentHTML("afterbegin", FF.icon(e.dataset.ic)));
const nav = document.getElementById("nav");
const paintNav = () => nav.classList.toggle("is-scrolled", scrollY > 150);
addEventListener("scroll", paintNav, { passive: true });
paintNav();

/* Already signed in on this phone: the account buttons open the farm instead. Read from storage,
   so it works offline too (Live.hasSession, lib/live/auth.ts). */
(function account() {
  let signedIn = false;
  try { signedIn = Live.hasSession(localStorage); } catch (e) { /* blocked storage: signed out */ }
  if (!signedIn) return;
  document.querySelectorAll("[data-account]").forEach((a) => {
    a.href = "/acasa";
    a.querySelector("[data-label]").textContent = "Mergi la ferma ta";
  });
})();

/* The app's sample farm */
(function farm() {
  const { S, lei } = FF;
  const each = (k, fn) => document.querySelectorAll(`[data-f="${k}"]`).forEach(fn);
  const set = (k, v) => each(k, (e) => (e.textContent = v));

  FF.on(() => {
    const s = FF.series(S.path), low = FF.lowOf(s);
    set("end", lei(s[11])); set("low-m", low.month); set("low-v", lei(low.v));
    set("poor", lei(FF.series("poor")[11])); set("good", lei(FF.series("good")[11]));
  });

  /* Recharts loads only as the charts come near. If it cannot load, the plain bars and hand-drawn forecast stay. */
  async function charts() {
    try { await window.__loadRecharts(); (await import("./charts.js")).default(); } catch (e) { /* plain versions stay */ }
    const C = window.Charts, big = document.querySelector(".chart.big");
    if (!C) return FF.mountChart(big);
    C.forecast(big);
  }
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); charts(); } }, { rootMargin: "100px 0px" });
  io.observe(document.getElementById("forecast"));
})();

/* The four feature cards are live HTML on a shared 6-second loop, so the figures come from FF.
   Motion runs through the Web Animations API; only the count-ups touch the main thread, and they sleep through the hold. */
const LOOP = 6000, OUT = "cubic-bezier(.23, 1, .32, 1)", IN_OUT = "cubic-bezier(.77, 0, .175, 1)";
const at = (ms) => ms / LOOP;
const whole = (lei) => FF.lei(Math.round(lei) * 100, false);
const put = (el, text) => { if (el.textContent !== text) el.textContent = text; };
const scaleOf = (el) => new DOMMatrix(getComputedStyle(el).transform).a;
/* el goes from -> to over [inAt, inAt + inFor], holds, then returns over [outAt, outAt + outFor] */
const cycle = (el, from, to, inAt, inFor, outAt, outFor = 530) => el.animate([
  { ...from, offset: 0 }, { ...from, offset: at(inAt), easing: OUT }, { ...to, offset: at(inAt + inFor) },
  { ...to, offset: at(outAt), easing: IN_OUT }, { ...from, offset: at(outAt + outFor) }, { ...from, offset: 1 },
], { duration: LOOP, iterations: Infinity });

/* animate() builds the animations; update() redraws numbers, and rests between sleep[0] and sleep[1] */
function loopCard(animate, update, sleep = [0, 0]) {
  let anims = null, ticking = false, timer = 0, frame = 0;
  const tick = () => {
    if (!ticking) return;
    update();
    const t = anims[0].currentTime % LOOP;
    if (t > sleep[0] && t < sleep[1]) timer = setTimeout(tick, sleep[1] - t);
    else frame = requestAnimationFrame(tick);
  };
  return {
    play() {
      if (ticking) return;
      if (anims) anims.forEach((a) => a.play());
      else {
        anims = animate();
        /* start at the clear-out, so the finished card fades away instead of jumping to empty */
        anims.forEach((a) => (a.currentTime = 5000));
      }
      if (update) { ticking = true; tick(); }
    },
    pause() {
      ticking = false; clearTimeout(timer); cancelAnimationFrame(frame);
      if (anims) anims.forEach((a) => a.pause());
    },
  };
}

function costsLoop(root) {
  const R = 84, C = 2 * Math.PI * R, ROWS = FF.COSTS.map(([, name, amount]) => ({ name, amount }));
  const total = ROWS.reduce((t, r) => t + r.amount, 0);
  const pct = (r) => Math.round((r.amount / total) * 100);
  const money = (v) => whole(v).replace(/\s*lei$/, "");
  let from = 0;
  const arcs = ROWS.map((r, i) => {
    const len = (r.amount / total) * C, start = from; from += len;
    return `<circle cx="104" cy="104" r="${R}" stroke="var(--ch${i + 1})" stroke-dasharray="${len - 4} ${C}" stroke-dashoffset="${-start}"/>`;
  }).join("");
  root.setAttribute("aria-label", `Cheltuielile sezonului, ${money(total)} lei: ${ROWS.map((r) => `${r.name} ${pct(r)}%`).join(", ")}.`);
  root.innerHTML = `<div class="lp-ring"><svg viewBox="0 0 208 208" aria-hidden="true">
    <mask id="costs-sweep" maskUnits="userSpaceOnUse" x="0" y="0" width="208" height="208"><circle cx="104" cy="104" r="${R}" fill="none" stroke="#fff" stroke-width="31" stroke-dasharray="${C} ${C}"/></mask>
    <g mask="url(#costs-sweep)" fill="none" stroke-width="27">${arcs}</g></svg>
    <div class="lp-total"><b>${money(total)}</b><span>lei în total</span></div></div>
    <ul class="lp-leg">${ROWS.map((r, i) => `<li><i style="background:var(--ch${i + 1})"></i><span>${r.name}</span><b>${pct(r)}%</b></li>`).join("")}</ul>`;
  const sweep = root.querySelector("mask circle"), number = root.querySelector(".lp-total b");
  return loopCard(() => [
    cycle(sweep, { strokeDashoffset: C }, { strokeDashoffset: 0 }, 70, 1460, 5400),
    ...[...root.querySelectorAll(".lp-leg li")].map((li, i) => cycle(li, { opacity: 0, transform: "translateX(10px)" }, { opacity: 1, transform: "none" }, 200 + i * 200, 670, 5400 - (5 - i) * 33)),
  ], () => put(number, money((1 - parseFloat(getComputedStyle(sweep).strokeDashoffset) / C) * total)), [1600, 5380]);
}

function marginLoop(root) {
  const max = Math.max(...FF.CROPS.map((c) => c.mv));
  root.setAttribute("aria-label", `Cât rămâne pe hectar: ${FF.CROPS.map((c) => `${c.n} ${c.m}`).join(", ")}.`);
  root.innerHTML = FF.CROPS.map((c) => `<div class="lp-row"><span>${c.n}</span><div class="lp-bar"><i style="transform:scaleX(${c.mv / max})"></i></div><b>${c.m}</b></div>`).join("");
  const bars = [...root.querySelectorAll(".lp-bar i")], values = [...root.querySelectorAll(".lp-row b")];
  return loopCard(() => bars.map((bar, i) => cycle(bar, { transform: "scaleX(0)" }, { transform: `scaleX(${FF.CROPS[i].mv / max})` }, 130 + i * 230, 1000, 5200 + i * 100)),
    () => bars.forEach((bar, i) => put(values[i], whole(scaleOf(bar) * max))), [1700, 5180]);
}

function billsLoop(root) {
  const rows = FF.COMING.slice(0, 4);
  root.setAttribute("aria-label", `Urmează: ${rows.map((t) => `${t.name} ${FF.signed(t.bani)}, ${t.date}`).join("; ")}`);
  root.innerHTML = rows.map(FF.txRow).join("");
  return loopCard(() => [...root.children].map((li, i) => cycle(li, { opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }, 70 + i * 300, 800, 5200 + i * 67)));
}

/* The salary: the year's money (APIA and each crop, from the plan) falls into one bar that pays every month. */
function reserveLoop(root) {
  const NOW = FF.GOAL / 100, CHIPS = (window.__LANDING?.income ?? []).map((c) => c.name), n = Math.max(1, CHIPS.length);
  root.setAttribute("aria-label", `Salariul lunar: ${whole(NOW)}, din ${CHIPS.join(", ")}.`);
  root.innerHTML = `<ul class="lp-chips" style="grid-template-columns:repeat(${n}, minmax(0, 1fr))">${CHIPS.map((c) => `<li>${c}<i></i></li>`).join("")}</ul>
    <div class="lp-bar"><i style="width:100%"></i></div>
    <div class="lp-foot"><b>${whole(NOW)}</b><span>pe lună, salariul lui ${window.__LANDING?.name ?? ""}</span></div>`;
  const fill = root.querySelector(".lp-bar i"), value = root.querySelector(".lp-foot b");
  const step = (k) => ({ transform: `scaleX(${k / n})` });
  const fills = [{ ...step(0), offset: 0 }, { ...step(0), offset: at(730), easing: OUT }];
  for (let k = 1; k <= n; k++) fills.push({ ...step(k), offset: at(730 + k * 400), ...(k < n ? { easing: OUT } : {}) });
  fills.push({ ...step(n), offset: at(5400), easing: IN_OUT }, { ...step(0), offset: at(5930) }, { ...step(0), offset: 1 });
  return loopCard(() => [
    fill.animate(fills, { duration: LOOP, iterations: Infinity }),
    ...[...root.querySelectorAll(".lp-chips li")].map((li, i) => cycle(li, { opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }, i * 400, 330, 5270 + i * 67)),
    ...[...root.querySelectorAll(".lp-chips i")].map((coin, i) => {
      const t = 330 + i * 400;
      return coin.animate([
        { opacity: 0, transform: "translateY(0)", offset: 0 }, { opacity: 0, transform: "translateY(0)", offset: at(t) },
        { opacity: 1, transform: "translateY(5px)", offset: at(t + 120) }, { opacity: 1, transform: "translateY(30px)", offset: at(t + 380) },
        { opacity: 0, transform: "translateY(44px)", offset: at(t + 470) }, { opacity: 0, transform: "translateY(44px)", offset: 1 },
      ], { duration: LOOP, iterations: Infinity });
    }),
  ], () => put(value, whole(Math.round(scaleOf(fill) * NOW))), [2000, 5380]);
}

/* Each card starts once it is properly on screen, and stays still with reduced motion, data saver, or after Pause. */
(function loops() {
  const btn = document.getElementById("motion");
  const saver = !!(navigator.connection && navigator.connection.saveData);
  let paused = matchMedia("(prefers-reduced-motion: reduce)").matches || saver;
  const cards = [["margin", marginLoop], ["bills", billsLoop], ["costs", costsLoop], ["reserve", reserveLoop]].map(([id, build]) => {
    const el = document.getElementById(`${id}-loop`);
    return { box: el.parentElement, ctl: build(el), visible: false };
  });
  const sync = (c) => (c.visible && !paused ? c.ctl.play() : c.ctl.pause());
  const label = () => { btn.textContent = paused ? "Pornește animațiile" : "Oprește animațiile"; btn.setAttribute("aria-pressed", paused); };
  const io = new IntersectionObserver((list) => list.forEach((e) => {
    const c = cards.find((k) => k.box === e.target); c.visible = e.isIntersecting; sync(c);
  }), { threshold: .3 });
  cards.forEach((c) => io.observe(c.box));
  btn.addEventListener("click", () => { paused = !paused; label(); cards.forEach(sync); });
  label();
})();

}
