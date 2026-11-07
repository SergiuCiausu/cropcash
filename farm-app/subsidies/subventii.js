/* "Subvenția ta": estimate_subsidy, get_subsidy_payments, list_schemes, explain_subsidy, check_scheme, what_if_subsidy.
   Every figure comes from the engine bundle. */
(function () {
  const { FARM, TODAY, esc, about, exact, cents, ha, num, date, daysLeft, zile, icon, verify } = CC;
  CC.start();
  if (CC.closedView()) return;

  const data = CC.data();
  const compute = (farm) => CropEngine.computeSubsidies(farm, data);
  const plan = CC.farmPlan();
  const base = plan.subsidies;
  const stored = { birth_year: +TODAY.slice(0, 4) - FARM.age, parcels: FARM.parcels.map((p) => ({ crop_id: p.cropId, area_ari: Math.round(p.areaHa * 100), is_arable: true })) };
  const schemeData = (code) => data.subsidies.schemes.find((s) => s.code === code);
  const event = (id) => data.calendar.events.find((e) => e.id === id);
  const set = (id, html) => { document.getElementById(id).innerHTML = html; };
  const rulesUnverified = (code) => (schemeData(code)?.eligibility?.rules ?? []).some((r) => r.status === 'DE-VERIFICAT');
  const needsVerify = (s) => s.schemeStatus === 'DE-VERIFICAT' || s.unverified.length > 0;

  /* ---- Estimate ---- */
  const { totals } = base;
  /* APIA pays one amount for the farm, so a crop sees its part by hectares. */
  const part = CC.crop ? CC.crop.share : (bani) => bani;
  const decided = !!base.decision;
  const rate = base.rates.FEGA;
  const drop = Math.round((1 - (base.schemes.find((s) => s.code === 'PD-01')?.factors.min ?? 1)) * 100);
  set('total', `${about(part(totals.lei.probable))} lei`);
  set('range', decided ? 'din decizia ta de plată' : `între ${about(part(totals.lei.min))} lei și ${about(part(totals.lei.max))} lei`);
  set('why', decided ? 'Planul și salariul tău socotesc cu această sumă, nu cu estimarea noastră.' : `Suma exactă depinde de câți fermieri cer bani anul ăsta. În ultimii ani, sprijinul de bază a ieșit și cu ${drop}% mai mic decât era plănuit.`);
  set('sum', `<p>Avansul<b>${exact(part(totals.advanceLei))} lei</b></p><p>Restul<b>${exact(part(totals.balanceLei.probable))} lei</b></p>`);
  set('rate', `Calculat la ${num(rate.value)} lei pentru un euro. ${rate.confirmed ? 'E cursul BCE din 30 septembrie 2026. Anunțul APIA pentru curs e încă de verificat, așa că sumele în lei se pot schimba puțin.' : 'Cursul oficial pentru 2026 nu e verificat încă, așa că sumele în lei se pot schimba puțin.'}`);

  /* ---- The real total, from the farmer's payment decision ---- */
  const decisionBox = document.getElementById('decision');
  async function sendDecision(action) {
    try {
      await CC.send(action);
      location.reload();
    } catch (e) {
      Papers.tell('Nu am putut salva', CC.failText(e));
    }
  }
  /* What the farmer is about to accept, worked out on the phone with the same plan the server uses. */
  const salaryWith = (bani) => {
    const salary = (farm) => CC.farmPlan(farm).salary.salary;
    const before = salary(CC.me), after = salary({ ...CC.me, apia_decision: { campaignYear: data.subsidies.meta.campaign_year, totalBani: bani } });
    return after === before ? `Salariul tău rămâne ${exact(after)} lei pe lună.` : `Salariul tău trece de la ${exact(before)} lei la ${exact(after)} lei pe lună.`;
  };
  if (!CC.crop) {
    decisionBox.hidden = false;
    decisionBox.innerHTML = decided
      ? '<button type="button" class="h-quiet on-hero" data-no-decision>Scoate suma din decizie</button>'
      : Papers.button('Ai decizia de plată? Pune suma reală', 'login.html?next=subventii.html');
    document.getElementById('schemes-note').hidden = !decided;
  }
  decisionBox.addEventListener('click', async (e) => {
    if (e.target.closest('[data-no-decision]')) return sendDecision((Live) => Live.write('clear_apia_decision', {}));
    if (!e.target.closest('[data-paper]')) return undefined;
    const reading = await Papers.pick({ accepts: ['apia_decizie'], pages: true });
    if (!reading) return undefined;
    /* Not on a farm the server knows yet: nothing to save it on, so the plan can't use it. */
    if (!CC.me) return Papers.tell('Nu am unde salva suma', 'Fă-ți mai întâi ferma, apoi pune decizia.');
    const totalBani = await Papers.confirmDecision(reading, salaryWith);
    if (!totalBani) return undefined;
    return sendDecision((Live) => Live.write('save_apia_decision', { campaignYear: data.subsidies.meta.campaign_year, totalBani }));
  });

  if (CC.crop) {
    document.querySelector('.page-h .lead').textContent = `Partea pentru ${CC.crop.name.toLowerCase()} din subvenția fermei.`;
    document.querySelector('.hero-card .eyebrow').textContent = `Pentru ${CC.crop.name.toLowerCase()} primești cam`;
    set('why', `APIA plătește o singură sumă pentru toată ferma, de ${about(totals.lei.probable)} lei. Aici vezi partea după hectare: ${ha(CC.crop.ari)} din ${ha(CC.crop.totalAri)} ha.`);
    ['schemes', 'reasons'].forEach((id) => { document.getElementById(id).closest('section').hidden = true; });
  }

  /* ---- Payments: the plan always counts on the last day of each window ---- */
  const adv = event('apia-avans'), bal = event('apia-sold');
  /* The plan's own flag, so a date still to be checked is marked as it is in Calendar. */
  const entries = plan.timelines.medium.months.flatMap((m) => m.entries);
  const unverified = (kind) => !!entries.find((e) => e.kind === kind)?.unverified;
  /* Only a farm on the server knows whether the advance came. Signed out there's nothing to say. */
  const advanceIn = (CC.me?.transactions ?? []).some((t) => t.kind === 'apia_advance');
  const pending = CC.me && !advanceIn ? ['Încă n-a intrat la tine'] : [];
  const crumb = CC.crop ? `, partea pentru ${CC.crop.name.toLowerCase()}` : '';
  const between = (e) => `Între ${date(e.start)} și ${date(e.end, e.end.slice(0, 4) !== TODAY.slice(0, 4))}`;
  const min = part(totals.balanceLei.min), max = part(totals.balanceLei.max);
  const payments = {
    adv: {
      title: 'Avansul de la APIA', event: adv, value: part(totals.advanceLei), unverified: unverified('apia_advance'),
      lines: [between(adv), ...pending],
      text: [`Plățile se fac între ${date(adv.start)} și ${date(adv.end, true)}. Planul socotește cu ultima zi, ca să fii acoperit dacă banii vin târziu.`, ...pending],
    },
    bal: {
      title: 'Restul de la APIA', event: bal, value: part(totals.balanceLei.probable), range: decided ? null : [min, max], unverified: unverified('apia_balance'),
      lines: decided ? [between(bal)] : [between(bal), `Între ${about(min)} și ${about(max)} lei`],
      text: [`Vine între ${date(bal.start)} și ${date(bal.end, true)}. Nu știm exact luna. Noi am socotit că vine abia pe ${date(bal.end)}, ca să fii acoperit.`],
    },
  };
  /* The same row as the Calendar list. */
  set('pay', Object.entries(payments).map(([key, p]) => `<button type="button" class="crow" data-pay="${key}"><span class="ti">${icon('down')}</span>
      <span class="r-main"><b>${p.title}${p.unverified ? ` ${verify}` : ''}</b>${p.lines.map((l) => `<small>${l}</small>`).join('')}</span>
      <span class="c-amt pos">+${exact(p.value)} lei</span></button>`).join(''));

  /* The same pop-up as Calendar. It reads only what's already on the page, so it works with no signal. */
  function openPayment(key) {
    const p = payments[key], box = document.getElementById('detail');
    const tile = (label, value, sub) => `<div><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const days = daysLeft(p.event.end);
    box.innerHTML = `<div class="top"><div><h2 id="d-title" tabindex="-1" autofocus>${esc(p.title + crumb)}</h2></div><button type="button" class="x" data-close aria-label="Închide">×</button></div>
      <div class="key-facts">${tile('Când', date(p.event.end, true), days >= 0 ? `mai sunt ${zile(days)}` : '')}${tile('Suma', `${exact(p.value)} lei`, p.range ? `între ${about(p.range[0])} și ${about(p.range[1])} lei` : '')}</div>
      ${p.unverified ? `<p class="note gap">${verify} Verifică la instituție înainte să te bazezi pe această dată.</p>` : ''}
      ${p.text.map((t) => `<p class="d-text">${t}</p>`).join('')}
      ${p.event.source_url ? `<p class="note gap"><a href="${esc(p.event.source_url)}" rel="noopener" target="_blank">Vezi sursa</a></p>` : ''}
      <div class="acts"><a class="btn btn-line" href="calendar.html">Vezi în calendar</a><button type="button" class="btn btn-line" data-close>Închide</button></div>`;
    box.showModal();
  }
  document.getElementById('pay').addEventListener('click', (e) => { const b = e.target.closest('[data-pay]'); if (b) openPayment(b.dataset.pay); });
  document.getElementById('detail').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target.id === 'detail') e.currentTarget.close();
  });

  const axisStart = '2026-10-01', axisEnd = '2027-07-01';
  const span = CC.daysLeft(axisEnd) - CC.daysLeft(axisStart);
  const at = (iso) => ((CC.daysLeft(iso) - CC.daysLeft(axisStart)) / span) * 100;
  const bar = (cls, from, to) => `<i class="${cls}" style="left:${at(from).toFixed(2)}%;width:${(at(to) - at(from)).toFixed(2)}%"></i>`;
  set('axis', `${bar('adv', adv.start, adv.end)}${bar('bal', bal.start, bal.end)}<i class="now" style="left:${at(TODAY).toFixed(2)}%"></i>`);
  set('axis-m', ['oct.', 'nov.', 'dec.', 'ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.'].map((m) => `<span>${m}</span>`).join(''));

  /* ---- Schemes and their explanation ---- */
  const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } };
  function explain(s) {
    const src = schemeData(s.code)?.source_url;
    const haTxt = ha(s.units);
    const notes = s.unverified.map((u) => u.note).filter(Boolean);
    return `<dl class="facts">
      <dt>Calculul</dt><dd>${haTxt} ha × ${num(s.amountEurPerUnit)} € = ${cents(s.eur.probable)} €</dd>
      <dt>În lei</dt><dd>${about(s.leiIndicative.probable)} lei, la ${num(rate.value)} lei pentru un euro</dd>
      <dt>Avans</dt><dd>${cents(s.advanceEur)} €</dd>
      <dt>Stare</dt><dd>${s.schemeStatus === 'DE-VERIFICAT' ? 'Suma e de verificat.' : 'Suma e confirmată pentru 2026.'}${s.unverified.length ? ' O condiție e de verificat.' : ''}</dd>
      ${notes.length ? `<dt>De verificat</dt><dd>${notes.map(esc).join(' ')}</dd>` : ''}
      <dt>Sursa</dt><dd>${src ? `<a href="${esc(src)}" rel="noopener" target="_blank">${esc(host(src))}</a>` : 'Lipsește'}</dd>
    </dl>`;
  }
  set('schemes', base.schemes.map((s) => `<details class="scheme"><summary><b>${esc(s.nameRo)} ${needsVerify(s) ? verify : ''}</b><span class="amt">${about(s.leiIndicative.probable)} lei</span>${icon('arrow')}</summary>${explain(s)}</details>`).join(''));

  /* ---- Why not ---- */
  const AREA = new Set(['total_ha', 'arable_ha', 'unproductive_ha']);
  function reasonText(c) {
    const fmt = (v) => (AREA.has(c.field) ? num(v) : String(v));
    const e = fmt(c.expected), a = fmt(c.actual);
    const key = `${c.field}:${c.op}`;
    return {
      'age:<': `Doar pentru fermierii sub ${e} de ani. Tu ai ${a}.`,
      'total_ha:<=': `Doar pentru fermele de cel mult ${e} ha. Tu ai ${a} ha.`,
      'total_ha:>=': `Trebuie cel puțin ${e} ha. Tu ai ${a} ha.`,
      'arable_ha:>=': `Trebuie cel puțin ${e} ha de teren arabil. Tu ai ${a} ha.`,
      'arable_ha:>': 'Nu ai teren arabil declarat.',
      'distinct_crops:>=': `Trebuie cel puțin ${e} culturi diferite. Tu ai ${a}.`,
      'unproductive_ha:>': 'Doar dacă lași zone necultivate, ca fâșii sau margini de câmp. Suma pentru 2026 nu e anunțată încă.',
    }[key] ?? 'Nu se potrivește cu ferma ta.';
  }
  const reasonRow = (tag, tone, name, code, reasons) => `<div class="reason"><div class="r-top"><b>${esc(name)}${rulesUnverified(code) ? ` ${verify}` : ''}</b><span class="tag ${tone}">${tag}</span></div>
    ${[...new Set(reasons)].map((r) => `<small>${esc(r)}</small>`).join('')}</div>`;
  const reasonRows = [
    ...base.notEligible.map((n) => reasonRow('Nu primești', 'd', n.nameRo, n.code, n.failed.map(reasonText))),
    ...base.excluded.map((x) => reasonRow('Nu știm încă', 'n', x.nameRo, x.code, ['Suma pentru anul ăsta nu e anunțată încă.'])),
  ];
  set('reasons', reasonRows.join('') || '<p class="note">Primești tot ce se potrivește fermei tale.</p>');

  /* ---- Simulator ---- */
  /* Whole farm: total hectares and which crops. One crop: only that crop's hectares change, and the rest of the farm stays put. */
  const CROPS = data.crops.crops;
  const focus = CC.crop ? CC.crop.id : null;
  const cropWord = focus ? CC.crop.name.toLowerCase() : '';
  const toAri = (p) => Math.round(p.areaHa * 100);
  const farmParcels = FARM.parcels.map((p) => ({ cropId: p.cropId, areaHa: p.areaHa }));
  const otherParcels = focus ? farmParcels.filter((p) => p.cropId !== focus) : [];
  const OTHER_ARI = otherParcels.reduce((sum, p) => sum + toAri(p), 0);
  const FARM_ARI = farmParcels.reduce((sum, p) => sum + toAri(p), 0);
  const START_ARI = FARM_ARI - OTHER_ARI;
  const START_PICK = new Set(farmParcels.map((p) => p.cropId));
  const MAX_ARI = Math.ceil((Math.max(6000, Math.ceil(FARM_ARI / 100) * 100) - OTHER_ARI) / 100) * 100;
  /* The rules change at these farm sizes, seen from the hectares the slider moves. */
  const LIMITS = [1000, 5000].map((a) => a - OTHER_ARI).filter((a) => a >= 100);
  const state = { ari: START_ARI, picked: new Set(START_PICK) };

  const isToday = () => state.ari === START_ARI && state.picked.size === START_PICK.size && [...state.picked].every((id) => START_PICK.has(id));
  function farmFor(ari, picked) {
    if (focus) return { age: FARM.age, parcels: [...otherParcels, { cropId: focus, areaHa: ari / 100 }] };
    const ids = CROPS.map((c) => c.id).filter((id) => picked.has(id));
    const share = Math.floor(ari / ids.length);
    return { age: FARM.age, parcels: ids.map((cropId, i) => ({ cropId, areaHa: (i === 0 ? ari - share * (ids.length - 1) : share) / 100 })) };
  }
  /* A crop's part goes by hectares, the way the rest of the app splits APIA money. */
  const partOf = (bani, ari) => (focus ? Math.round((bani * ari) / (ari + OTHER_ARI)) : bani);

  /* The curve is cached per set of crops. The two extra points make each threshold a clean drop. */
  const curves = {};
  function curve() {
    const key = [...state.picked].sort().join();
    if (curves[key]) return curves[key];
    const ariPoints = new Set(LIMITS.flatMap((a) => [a, a + 1]));
    for (let a = 100; a <= MAX_ARI; a += Math.ceil(MAX_ARI / 120 / 50) * 50) ariPoints.add(a);
    curves[key] = [...ariPoints].filter((a) => a <= MAX_ARI).sort((a, b) => a - b).map((ari) => {
      const { min, max, probable } = compute(farmFor(ari, state.picked)).totals.lei;
      return { ari, min: partOf(min, ari), max: partOf(max, ari), probable: partOf(probable, ari) };
    });
    return curves[key];
  }

  function drawChart(current) {
    /* Drawn at real pixel size so labels stay legible on a phone. */
    const W = document.getElementById('step-chart').clientWidth || 640, H = 240, L = 2, R = 8, T = 22, B = 28;
    const pts = curve();
    const top = Math.max(...pts.map((p) => p.max));
    const x = (ari) => L + ((ari - 100) / (MAX_ARI - 100)) * (W - L - R);
    const y = (bani) => T + (1 - bani / top) * (H - T - B);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.ari).toFixed(1)} ${y(p.probable).toFixed(1)}`).join(' ');
    const edge = (key) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.ari).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
    /* The first label gives way when a limit sits right beside it. */
    const crowded = LIMITS.some((a) => a !== 100 && a - 100 < MAX_ARI * 0.08);
    const ticks = [...new Set([...(crowded ? [] : [100]), ...LIMITS, ...(focus ? [] : [3000]), MAX_ARI])].sort((a, b) => a - b);
    const onTick = (a) => LIMITS.includes(a);
    const chartText = focus ? `Partea pentru ${esc(cropWord)}, de la 1 la ${MAX_ARI / 100} de hectare. Scade brusc când ferma trece de 10 ha și de 50 ha.` : `Subvenția estimată de la 1 la ${MAX_ARI / 100} de hectare. Scade brusc peste 10 ha și peste 50 ha.`;
    set('step-chart', `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${chartText} Pentru ${esc(ha(state.ari))} ha sunt ${about(current)} lei.">
      <text class="c-lab" x="${L}" y="12">${focus ? `Partea pentru ${esc(cropWord)}` : 'Subvenția'}, ${about(top)} lei în vârf</text>
      <line class="c-base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
      <path class="c-alt" d="${edge('max')}"/><path class="c-alt" d="${edge('min')}"/><path class="c-line" d="${line}"/>
      <circle class="c-dot" r="6" cx="${x(state.ari).toFixed(1)}" cy="${y(current).toFixed(1)}"/>
      ${ticks.map((a) => `<text class="c-lab${onTick(a) ? ' on' : ''}" x="${x(a).toFixed(1)}" y="${H - 8}" text-anchor="${a === ticks[0] ? 'start' : a === MAX_ARI ? 'end' : 'middle'}">${ha(a)} ha</text>`).join('')}
    </svg>`);
  }

  const flag = (code) => (rulesUnverified(code) || schemeData(code)?.status === 'DE-VERIFICAT' ? ` ${verify}` : '');
  const nameOf = (code) => esc(schemeData(code)?.name_ro ?? code);

  function renderSim() {
    const same = isToday();
    const w = CropEngine.whatIfSubsidy(plan, stored, data, { parcels: same ? farmParcels : farmFor(state.ari, state.picked).parcels });
    const { lost, gained } = w;
    const shown = !focus ? w.after.probable : same ? CC.crop.share(w.after.probable) : partOf(w.after.probable, state.ari);
    const delta = shown - part(w.before.probable);
    const sign = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
    /* Swapping one crop for another changes nothing, and that needs saying or the chips look broken. */
    const swapped = !focus && !same && state.ari === START_ARI && w.difference === 0;
    set('res', `<p class="big">${about(shown)} lei</p>
      <p class="delta ${sign}">${same ? (focus ? `Asta e partea pentru ${esc(cropWord)} de azi` : 'Asta e ferma ta de azi') : delta === 0 ? 'La fel ca azi' : `${delta > 0 ? '+' : '−'}${about(Math.abs(delta))} lei față de azi`}</p>
      ${focus ? `<p class="note">Toată ferma: ${about(w.after.probable)} lei</p>` : ''}
      ${swapped ? '<p class="note">Aceeași sumă. APIA plătește la fel pe hectar pentru aceste culturi.</p>' : ''}
      ${lost.length || gained.length ? `<ul>${lost.map((s) => `<li>Pierzi: ${nameOf(s)}${flag(s)}</li>`).join('')}${gained.map((s) => `<li>Câștigi: ${nameOf(s)}${flag(s)}</li>`).join('')}</ul>` : ''}`);
    drawChart(shown);
    document.getElementById('ha-range').value = Math.round(state.ari / 100);
    const numInput = document.getElementById('ha-num');
    if (document.activeElement !== numInput) numInput.value = state.ari / 100;
    document.querySelectorAll('#ha-chips .chip').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.ari === state.ari));
    document.querySelectorAll('#crop-chips .chip').forEach((b) => {
      const on = state.picked.has(b.dataset.crop);
      b.setAttribute('aria-pressed', on);
      b.setAttribute('aria-disabled', on && state.picked.size === 1);
    });
  }

  const PRESETS = [...new Set([...LIMITS.flatMap((a) => [a, a + 1]), START_ARI])].sort((a, b) => a - b).map((ari) => [ari, `${ha(ari)} ha${ari === START_ARI ? ', azi' : ''}`]);
  document.getElementById('ha-range').max = MAX_ARI / 100;
  document.getElementById('ha-num').max = MAX_ARI / 100;
  set('ha-chips', PRESETS.map(([ari, label]) => `<button type="button" class="chip" data-ari="${ari}">${label}</button>`).join(''));
  set('crop-chips', CROPS.map((c) => `<button type="button" class="chip" data-crop="${esc(c.id)}">${esc(c.name_ro)}${START_PICK.has(c.id) ? ', azi' : ''}</button>`).join(''));
  if (focus) {
    document.getElementById('ha-label').textContent = `Câte hectare de ${cropWord} ai lucra`;
    set('sim-note', `Celelalte culturi rămân la fel. APIA plătește o singură sumă pentru toată ferma, așa că aici vezi partea pentru ${esc(cropWord)}, după hectare.`);
    document.getElementById('crop-lab').hidden = true;
    document.getElementById('crop-chips').hidden = true;
  }
  document.getElementById('ha-chips').addEventListener('click', (e) => { const b = e.target.closest('[data-ari]'); if (b) { state.ari = +b.dataset.ari; renderSim(); } });
  document.getElementById('crop-chips').addEventListener('click', (e) => { const b = e.target.closest('[data-crop]'); if (!b) return;
    const id = b.dataset.crop;
    if (state.picked.has(id) && state.picked.size === 1) return; /* At least one crop has to stay. */
    if (!state.picked.delete(id)) state.picked.add(id);
    renderSim();
  });
  document.getElementById('ha-range').addEventListener('input', (e) => { state.ari = +e.target.value * 100; renderSim(); });
  document.getElementById('ha-num').addEventListener('input', (e) => {
    const v = Math.round(parseFloat(String(e.target.value).replace(',', '.')) * 100);
    if (v >= 100 && v <= MAX_ARI) { state.ari = v; renderSim(); }
  });
  new ResizeObserver(() => renderSim()).observe(document.getElementById('step-chart'));
  renderSim();

  window.__subventii = { base, compute, farmFor };
})();
