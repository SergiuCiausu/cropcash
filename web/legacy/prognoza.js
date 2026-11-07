/* Ported from farm-app by web/scripts/port-legacy.mjs. Edit farm-app, or edit here and stop re-running the port. */
/* eslint-disable */
// @ts-nocheck
export default function install() {
/* "Prognoză": get_forecast, get_tight_months, plus crop figures from the plan.
   The chart itself is in chart.js. */
(function () {
  const { FARM, esc, exact, about, cents, ha, data: getData } = CC;
  CC.start();
  if (CC.closedView()) return;

  const el = (id) => document.getElementById(id);
  const data = getData();
  const plan = CC.farmPlan();
  const crops = new Map(data.crops.crops.map((c) => [c.id, c]));
  const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
  const monthNo = (key) => +key.split('-')[1] - 1;
  const monthName = (key) => `${MONTHS[monthNo(key)]} ${key.slice(0, 4)}`;
  const lei = (bani) => `${bani < 0 ? '−' : ''}${exact(Math.abs(bani))} lei`;
  const YEARS = [['bad', 'An slab'], ['medium', 'An normal'], ['good', 'An bun']];
  const sum = (t, key) => t.months.reduce((s, m) => s + m[key], 0);
  let year = 'medium';

  const yearChips = YEARS.map(([k, label]) => `<button type="button" class="chip" data-year="${k}">${label}</button>`).join('');
  el('years').innerHTML = yearChips;
  el('years-long').innerHTML = yearChips;

  /* ---- Chart ---- */
  const { points, draw, yearEnds } = FarmChart(plan, () => year);

  function drawChart() {
    if (CC.crop) return; // A crop has no balance of its own: the account is under Toată ferma.
    const rows = points(), lowKey = plan.timelines[year].lowest.key;
    const low = rows.find((r) => r.long === monthName(lowKey));
    draw(el('fc'), rows, low, `Banii tăi lună de lună. Cel mai jos: ${lei(low.v)}, în ${low.long}. La final, ${yearEnds(rows)}.`);
  }

  /* ---- The next years ---- */
  const long = CC.longForecast();
  const maxYears = data.params.long_forecast.max_years.value;
  const anii = (n) => (n === 1 ? '1 an' : `${n} ${n >= 20 ? 'de ' : ''}ani`);
  const KIND = { bad: 'Ani slabi', medium: 'Ani normali', good: 'Ani buni' };
  const upTo = (k, n) => window.CropEngine.firstYearsTotal(long[k], n);
  el('l-years').max = maxYears;
  el('l-years').value = maxYears;
  el('l-rules').textContent = data.params.long_forecast.subsidy_rules_until_year.value;
  function drawLong() {
    if (CC.crop) return;
    const n = +el('l-years').value;
    const rows = [{ m: 'azi', long: 'Azi', v: 0, bad: 0, medium: 0, good: 0 }, ...long[year].slice(0, n).map((y, i) => (
      { m: y.to.slice(0, 4), long: `Până în ${monthName(y.to)}`, v: upTo(year, i + 1).in, bad: upTo('bad', i + 1).in, medium: upTo('medium', i + 1).in, good: upTo('good', i + 1).in }
    ))];
    draw(el('l-chart'), rows, rows[rows.length - 1], `Banii care intră în ${anii(n)}: ${lei(rows[rows.length - 1].v)}. ${yearEnds(rows)}.`);
  }
  function renderLong() {
    const n = +el('l-years').value, t = upTo(year, n), last = long[year][n - 1];
    el('l-kind').textContent = KIND[year];
    el('l-out').textContent = anii(n);
    el('l-years').setAttribute('aria-valuetext', anii(n));
    el('l-head').innerHTML = `În ${anii(n)} intră <b>${about(t.in)} lei</b>`;
    el('l-range').textContent = `Între ${about(upTo('bad', n).in)} și ${about(upTo('good', n).in)} lei, la prețurile de azi, până în ${monthName(last.to)}.`;
    const tile = (label, value) => `<div><span>${label}</span><b>${value}</b></div>`;
    el('l-keys').innerHTML = `${tile('Intră', lei(t.in))}${tile('Ies', lei(t.out))}${tile('Rămân înainte de salariu', lei(t.left))}`;
    drawLong();
  }
  /* Each crop has its own time: the first money from each one, from what was sown. */
  const firstSales = [...plan.economics.map((c) => c.cropId)].flatMap((id) => {
    const m = plan.timelines.medium.months.find((x) => x.entries.some((e) => e.kind === 'crop_sale' && e.cropId === id && e.id.startsWith('sale:')));
    /* Sown late, the sale can fall after these 12 months. */
    const sown = FARM.parcels.find((p) => p.cropId === id)?.plantedMonth;
    const key = m?.key ?? (sown ? window.CropEngine.cropSeason(crops.get(id), sown).sale : null);
    return key ? [`${crops.get(id)?.name_ro} în ${SHORT[monthNo(key)]} ${key.slice(0, 4)}`] : [];
  });
  el('l-first').textContent = firstSales.length ? `Următoarea vânzare: ${firstSales.join(', ')}.` : '';

  /* ---- Figures ---- */
  function bars(list, total) {
    return list.map(([label, value]) => `<li><span>${esc(label)}</span><b>${exact(value)} lei</b><span class="meter"><i style="width:${Math.round((value / (total || 1)) * 100)}%"></i></span></li>`).join('');
  }
  function totals(t, direction) {
    const map = new Map();
    for (const e of t.months.flatMap((m) => m.entries)) {
      if (e.direction !== direction) continue;
      const crop = crops.get(e.cropId)?.name_ro;
      const label = e.kind === 'apia_advance' || e.kind === 'apia_balance' ? 'APIA' : (CC.crop && e.direction === 'out' && e.what) || crop || 'Altele';
      map.set(label, (map.get(label) ?? 0) + e.value);
    }
    return [...map].sort((a, b) => b[1] - a[1]);
  }

  function renderCrop(name) {
    const c = CC.crop, t = { months: c.months(plan.timelines[year]) };
    const inSum = sum(t, 'in'), outSum = sum(t, 'out'), left = inSum - outSum;
    const tile = (label, value) => `<div><span>${label}</span><b>${value}</b></div>`;
    el('c-title').textContent = `${name}: ${CC.harvests.projectName(CC.harvests.selected, c.id)}`;
    el('keys').innerHTML = `${tile('Intră', lei(inSum))}${tile('Costă', lei(outSum))}${tile('Rămâne', lei(left))}${tile('Rămâne pe hectar', lei(Math.round((left * 100) / c.ari)))}`;
    el('in').innerHTML = bars(totals(t, 'in'), inSum);
    el('out').innerHTML = bars(totals(t, 'out'), outSum);
  }

  function render() {
    const t = plan.timelines[year], normal = plan.timelines.medium;
    const name = YEARS.find(([k]) => k === year)[1];
    document.querySelectorAll('[data-year]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.year === year));
    if (CC.crop) return renderCrop(name);
    el('c-title').textContent = `${name}: banii tăi, lună de lună`;
    el('c-low').textContent = `Cel mai jos: ${lei(t.lowest.balance)}, în ${SHORT[monthNo(t.lowest.key)]}`;
    const inSum = sum(t, 'in'), outSum = sum(t, 'out');
    const last = t.months[t.months.length - 1];
    const tile = (label, value, sub) => `<div><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    el('keys').innerHTML = `${tile('Intră', lei(inSum))}${tile('Ies', lei(outSum))}
      ${tile('Cel mai jos', lei(t.lowest.balance), monthName(t.lowest.key))}${tile('Rămân la final', lei(last.balanceEnd), monthName(last.key))}`;
    el('in').innerHTML = bars(totals(t, 'in'), inSum);
    el('out').innerHTML = bars(totals(t, 'out'), outSum);

    const lost = sum(normal, 'in') - sum(plan.timelines.bad, 'in');
    el('bad').hidden = year !== 'bad';
    el('bad').innerHTML = `<div><p class="eyebrow">Într-un an slab</p><h2>Intră cu ${lei(lost)} mai puțin decât într-un an normal.</h2>
      <p>Costurile cresc și ele. La sfârșitul celor 12 luni ai cu ${lei(normal.months.at(-1).balanceEnd - t.months.at(-1).balanceEnd)} mai puțin.</p></div>`;
    drawChart();
    renderLong();
  }

  /* ---- What really happened so far ---- */
  const h = CC.harvests.selected;
  if (h.records.some((r) => !CC.crop || r.cropId === CC.crop.id)) {
    el('real').hidden = false;
    el('real-body').innerHTML = CC.harvests.compare(h, 'Până acum', CC.crop?.id);
  }

  /* ---- Crops ---- */
  el('crops').innerHTML = `<thead><tr><th scope="col">Cultura</th><th scope="col">Hectare</th><th scope="col">Intră</th><th scope="col">Costă</th><th scope="col">Rămâne pe hectar</th><th scope="col">Prețul la care nu pierzi</th></tr></thead>
    <tbody>${(CC.crop ? plan.economics.filter((c) => c.cropId === CC.crop.id) : plan.economics).map((c) => `<tr><th scope="row">${esc(crops.get(c.cropId)?.name_ro)}</th><td data-l="Hectare">${ha(c.areaAri)}</td><td data-l="Intră">${lei(c.income)}</td><td data-l="Costă">${lei(c.cost)}</td><td data-l="Rămâne pe hectar">${lei(c.marginPerHa)}</td><td data-l="Prețul la care nu pierzi">${cents(c.breakEvenPerKg)} lei/kg</td></tr>`).join('')}</tbody>`;
  const own = CC.harvests.state.gathered.length > 0;
  el('foot').textContent = `Am pornit de la ${exact(FARM.startBalanceBani)} lei în cont. ${own ? 'Producția și prețul sunt ce ai notat tu, unde le-ai notat. Restul, inclusiv costurile, sunt medii estimate.' : 'Costurile, producția și prețurile sunt medii estimate, nu cifrele tale.'}`;

  if (CC.crop) {
    document.querySelector('.page-h .lead').textContent = `Cât aduce și cât costă cultura de ${CC.crop.name.toLowerCase()}, într-un an întreg.`;
    el('pair').classList.add('solo');
    el('fc').hidden = el('fc').nextElementSibling.hidden = el('c-low').hidden = el('ani').hidden = true;
    el('in').closest('.bento').classList.add('h-gap');
    el('crops').closest('section').querySelector('h2').textContent = 'Doar din vânzare, într-un an normal';
    el('foot').textContent = `Subvenția e împărțită după hectare. Costurile, producția și prețurile sunt medii estimate, unde nu le-ai notat tu. Cel mai jos nivel al banilor și anii următori sunt la ${CC.harvests.projectName(CC.harvests.selected)}.`;
  }

  document.addEventListener('click', (e) => { const b = e.target.closest('[data-year]'); if (b) { year = b.dataset.year; render(); } });
  el('l-years').addEventListener('input', renderLong);
  new ResizeObserver(drawChart).observe(el('fc'));
  new ResizeObserver(drawLong).observe(el('l-chart'));
  render();
  if (location.hash === '#ani') el('ani').scrollIntoView();

  window.__prognoza = { plan };
})();

}
