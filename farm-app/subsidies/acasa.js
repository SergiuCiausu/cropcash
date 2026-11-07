/* Acasă: the salary, the money on hand, what comes next and the calls worth a look.
   Everything is calculated here from the saved farm, so it works without internet.
   Opportunities are the saved list until W8 connects them. */
(function () {
  const { FARM, TODAY, esc, exact, date, daysLeft, zile, icon } = CC;
  CC.start();

  const el = (id) => document.getElementById(id);
  const E = CropEngine;
  const data = CC.data();
  const plan = CC.farmPlan();
  const t = plan.timelines.medium;
  const chart = FarmChart(plan, () => 'medium');
  const lei = (bani) => `${bani < 0 ? '−' : ''}${exact(Math.abs(bani))} lei`;
  const MAX_ROWS = 5, MAX_CALLS = 5;

  el('hello').textContent = `Bună, ${FARM.name}`;
  el('lead').textContent = 'Banii fermei tale, pe scurt.';
  if (CC.onServer) document.querySelector('.page-h .acts').insertAdjacentHTML('afterbegin', '<a class="btn btn-line" href="bani.html">Contul tău</a>');

  /* ---- The salary and the money on hand ---- */
  const salary = E.salaryBreakdown(plan, 'medium', data);
  el('h-amount').textContent = `${lei(plan.monthlySalary)} pe lună`;
  el('now').textContent = lei(plan.startBalance);
  el('low').textContent = `Cel mai jos: ${lei(t.lowest.balance)}, în ${chart.monthName(t.lowest.key)}`;

  /* ---- Old age: what the plan puts aside, and what it grows to (the same sum as "Contul tău") ---- */
  const P = E.pensionParams(data);
  const monthly = plan.smoothing.pensionMonthly ?? 0;
  const sim = monthly > 0 ? E.simulatePensionScenarios(FARM.age, monthly, P) : null;
  const roundBani = P.roundLei * 100;
  el('old-age').href = 'pensie.html';
  el('old-month').textContent = monthly > 0 ? `${lei(monthly)} pe lună` : 'Nimic deocamdată';
  el('old-sum').textContent = sim
    ? `La ${P.targetAge} de ani: ${lei(Math.floor(sim.atTarget.probable / roundBani) * roundBani)}`
    : monthly > 0 ? `Pui ${lei(monthly)} pe lună.` : 'Nu pui încă nimic deoparte.';

  function drawChart() {
    const rows = chart.points();
    const low = rows.find((r) => r.long === chart.monthName(t.lowest.key));
    chart.draw(el('fc'), rows, low, `Banii tăi lună de lună. Cel mai jos: ${lei(low.v)}, în ${low.long}. La final, ${chart.yearEnds(rows)}.`);
  }
  new ResizeObserver(drawChart).observe(el('fc'));

  /* ---- Tiles ---- */
  const TILES = [
    ['recolte.html', 'plus', 'Notează o vânzare', 'Sau o cheltuială', ''],
    ['salariu.html', 'shield', 'Salariul tău', 'Cum l-am calculat', 't-b'],
    ['subventii.html', 'bank', 'Subvenția ta', `${lei(plan.subsidies.totals.lei.probable)} de la APIA`, ''],
    ['prognoza.html', 'chart', 'Prognoză', 'Îți ajung banii?', 't-c'],
  ];
  el('tiles').innerHTML = TILES.map(([href, ic, title, sub, tone]) => `<a class="${tone}" href="${href}"><span class="i">${icon(ic)}</span><span class="go">${icon('arrow')}</span><span class="t"><b>${esc(title)}</b><small>${esc(sub)}</small></span></a>`).join('');

  /* ---- What comes next ---- */
  const done = CC.doneTasks();
  const ahead = t.months
    .flatMap((m) => m.entries.map((e) => CC.planItem(e, m.key)))
    .filter((i) => i.date && daysLeft(i.date) >= 0 && !(i.task && done.has(i.id)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const coming = ahead.slice(0, MAX_ROWS);
  const nextMoney = ahead.find((i) => i.direction === 'in');
  el('h-why').textContent = salary.deficit
    ? `În ${chart.monthName(salary.limitingMonth)} banii nu ajung.`
    : nextMoney ? `Următorii bani: ${lei(nextMoney.value)}, pe ${date(nextMoney.date).replace(/[.]$/, '')}.` : '';
  const when = (d) => (d === 0 ? 'Azi' : `În ${zile(d)}`);
  const amount = (i) => (i.direction === 'none' ? when(daysLeft(i.date)) : `${i.direction === 'in' ? '+' : '−'}${lei(i.value)}`);
  el('coming').innerHTML = coming.length
    ? coming.map((i) => `<li><span><b>${esc(i.title)}</b><small>${esc(date(i.date))}</small></span><span class="ac-amt${i.direction === 'in' ? ' pos' : ''}">${esc(amount(i))}</span></li>`).join('')
    : '<li class="ac-none">Nimic planificat.</li>';

  /* ---- Calls still open: the ones followed first, then the soonest ---- */
  const follows = CC.loadFollows();
  const calls = new Map();
  const fits = E.pageFits(CC.monitor.calls(), FARM, data, TODAY);
  for (const c of CC.monitor.calls()) {
    const followed = follows.has(c.key);
    const open = c.deadline ? c.deadline >= TODAY : c.status === 'open';
    /* Calls for businesses only wait on the Oportunități page, in their own group: none of them is for farms. */
    const close = ['near', 'check'].includes(fits[c.key]?.level);
    if (!open || !(followed || close)) continue;
    const id = `${CC.callName(c)}|${c.deadline}`;
    const seen = calls.get(id);
    calls.set(id, { name: CC.callName(c), deadline: c.deadline, followed: followed || !!seen?.followed });
  }
  const rows = [...calls.values()].sort((a, b) => b.followed - a.followed || (a.deadline || '9').localeCompare(b.deadline || '9'));
  const left = (r) => (r.deadline ? when(daysLeft(r.deadline)) : 'Fără termen');
  el('calls').innerHTML = rows.length
    ? rows.slice(0, MAX_CALLS).map((r) => `<li><span><b>${esc(r.name)}</b><small>${r.followed ? 'O urmărești' : 'Deschisă acum'}</small></span><span class="ac-amt">${esc(left(r))}</span></li>`).join('')
    : '<li class="ac-none">Nicio oportunitate deschisă acum.</li>';

  /* ---- Weather: needs a farm on the server. Offline it shows the last saved copy. ---- */
  if (!CC.onServer) return;
  const WEATHER = 'cropcash.weather';
  const wx = data.params.weather;
  const realToday = E.todayInRomania(new Date());
  const seat = data.counties.counties.find((c) => c.code === CC.me.county)?.seat_ro;
  const savedWeather = () => {
    try {
      const parsed = E.WeatherForecastSchema.safeParse(JSON.parse(localStorage.getItem(WEATHER)));
      return parsed.success && parsed.data.countyCode === CC.me.county ? parsed.data : null;
    } catch (e) { return null; }
  };
  const dayName = (iso) => {
    if (iso === realToday) return 'Azi';
    if (daysFrom(iso) === 1) return 'Mâine';
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('ro-RO', { weekday: 'long', timeZone: 'UTC' });
  };
  const daysFrom = (iso) => (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${realToday}T00:00:00Z`)) / 864e5;
  const whole = (n) => (n === null ? '–' : Math.round(n));
  const rain = (d) => (d.rainChancePct === null || d.rainMm === null ? '–' : `${Math.round(d.rainChancePct)}%, ${CC.num(Math.round(d.rainMm * 10) / 10)} mm`);
  function drawWeather(forecast, failed) {
    const days = forecast ? E.upcomingWeather(forecast.days, realToday) : [];
    const box = el('weather');
    box.hidden = false;
    if (!days.length) {
      box.innerHTML = `<h2>Vremea în ${esc(FARM.county)}</h2><p class="note">${!failed ? 'Se încarcă vremea…' : navigator.onLine ? 'Nu am putut aduce vremea acum. Încearcă mai târziu.' : 'Pornește internetul ca să vezi vremea.'}</p>`;
      return;
    }
    const alerts = E.weatherAlerts(days, wx).map((a) => `<p class="wx-alert">${a.kind === 'frost' ? 'Risc de îngheț' : 'Vânt prea tare pentru stropit'}: ${esc(a.dates.map((d) => dayName(d).toLowerCase()).join(', '))}.</p>`).join('');
    const old = failed || forecast.stale;
    box.innerHTML = `<div class="card-h"><h2>Vremea în ${esc(FARM.county)}</h2><span>Următoarele ${wx.forecast_days.value} zile</span></div>${alerts}
      <table class="wx-table"><thead><tr><th scope="col">Ziua</th><th scope="col">Noapte / zi</th><th scope="col">Ploaie</th><th scope="col">Vânt</th></tr></thead>
      <tbody>${days.map((d) => `<tr><th scope="row">${esc(dayName(d.date))}</th><td${E.isFrost(d, wx) ? ' class="wx-frost"' : ''}>${whole(d.tempMinC)}° / ${whole(d.tempMaxC)}°</td><td>${rain(d)}</td><td>${d.windMaxKmh === null ? '–' : `${Math.round(d.windMaxKmh)} km/h`}</td></tr>`).join('')}</tbody></table>
      ${old ? `<p class="note">Date din ${date(forecast.fetchedAt.slice(0, 10))}. Pornește internetul ca să vezi ce e nou.</p>` : ''}
      ${seat ? `<p class="note">Prognoză pentru ${esc(seat)}. La câmp poate fi altfel.</p>` : ''}
      <p class="note"><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Date meteo: Open-Meteo.com</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> · Cifre rotunjite.</p>`;
  }
  const kept = savedWeather();
  drawWeather(kept, false);
  CC.live().then((Live) => Live.api('/api/weather')).then((raw) => {
    const fresh = E.WeatherForecastSchema.parse(raw);
    try { localStorage.setItem(WEATHER, JSON.stringify(fresh)); } catch (e) { /* shown for this visit */ }
    drawWeather(fresh, false);
  }).catch(() => drawWeather(kept, true));
})();
