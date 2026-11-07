/* Ported from farm-app by web/scripts/port-legacy.mjs. Edit farm-app, or edit here and stop re-running the port. */
/* eslint-disable */
// @ts-nocheck
export default function install() {
/* "Bătrânețe": the pension page. Everything on screen is worked out on the phone from the saved farm,
   so it opens offline. Starting, changing and stopping move money: they need internet, ask first and
   are never queued. Signed out, the slider works on the example farm and the button asks to sign in. */
(function () {
  const { esc, exact, about, date, verify } = CC;
  CC.start();

  const E = CropEngine;
  const el = (id) => document.getElementById(id);
  const data = CC.data();
  const P = E.pensionParams(data);
  const me = CC.me;
  const farm = CC.storedFarm();
  const plan = CC.farmPlan(farm);
  const lei = (bani) => `${exact(bani)} lei`;
  /* Signed out this is the example pension, which the other pages count too. */
  const current = E.activePensionMonthly(farm.pension_plans);
  const running = !!me && current > 0;
  const hasAccount = !!me?.stripe_account_id;
  const payments = (me?.transactions ?? []).filter((t) => t.kind === 'pension').sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const savedSoFar = -payments.reduce((sum, t) => sum + t.amount_bani, 0);
  const funds = [...data.pensionFunds.funds].sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  let fundId = me?.pension_fund_id ?? null;

  const toStep = (leiValue) => Math.min(P.sliderMaxLei, Math.max(P.sliderMinLei, Math.round(leiValue / P.sliderStepLei) * P.sliderStepLei));
  const effect = (bani) => E.whatIfPension(plan, farm, data, bani, fundId);
  /* The usual share of the salary, but never under what the chosen fund asks for. */
  const suggestion = () => {
    const share = E.suggestSliderPension(plan.monthlySalary, P);
    return Math.max(share, effect(share).minimum);
  };
  let monthlyLei = toStep((current || suggestion()) / 100);
  /* Which growth the chart draws as the solid line. The amount at the top always uses the usual one. */
  let growth = 'probable';
  const GROWTH = ['low', 'probable', 'high'];
  const growthName = Object.fromEntries(GROWTH.map((k) => [k, `${P.returnsPct[k]}% pe an`]));
  const chart = PensionChart();
  const monthly = () => monthlyLei * 100;
  const options = E.pensionOptions(data, CC.FARM.age);
  /* "Compară cu": another way to save, drawn as what it costs. Remembered in this browser only. */
  const COMPARE_KEY = 'cropcash-pension-compare';
  let against = (() => {
    try { const v = localStorage.getItem(COMPARE_KEY); return E.PENSION_COMPARISONS.includes(v) ? v : 'pilon3'; } catch (e) { return 'pilon3'; }
  })();

  /* ---- The amount at 65 ---- */
  function hero() {
    const sim = E.simulatePensionScenarios(CC.FARM.age, monthly(), P);
    if (!sim) {
      el('h-label').textContent = 'Pensia ta';
      el('h-amount').textContent = lei(monthly());
      el('h-why').textContent = `Pui deoparte în fiecare lună. Simularea e pentru cine are sub ${P.targetAge} de ani, așa că nu arătăm o sumă la final.`;
      el('g-pick').hidden = true;
      el('g-chart').hidden = true;
      el('g-compare').closest('label').hidden = true;
      el('g-cmp-note').hidden = true;
      el('range').innerHTML = '<p class="note">Fără simulare, nu avem ce arăta aici.</p>';
      return;
    }
    const before = savedSoFar > 0 ? ` Pe lângă ei, ai strâns deja ${lei(savedSoFar)}.` : '';
    el('h-label').textContent = `La ${P.targetAge} de ani ai`;
    el('h-amount').textContent = `${about(sim.atTarget.probable)} lei`;
    el('h-why').textContent = `Adică încă ${lei(sim.perMonthAfter)} pe lună, timp de ${P.payoutYears} ani, dacă pui ${lei(monthly())} pe lună de acum. Din banii ăștia, ${about(sim.paidIn)} lei îi pui tu.${before}`;
    growthCard(sim);
  }

  /* ---- The chart: one line per growth, the chosen one solid (like the main chart) ---- */
  function growthCard(sim) {
    el('g-pick').innerHTML = GROWTH.map((k) => `<button type="button" class="chip" data-growth="${k}" aria-pressed="${k === growth}">${growthName[k]}</button>`).join('');
    chart.draw(el('g-chart'), E.pensionPath(CC.FARM.age, monthly(), P), growth, growthName, comparison());
    compareNote();
    const row = (k) => `<li><span>${k === growth ? '<b>' : ''}Dacă banii cresc cu ${growthName[k]}${k === growth ? '</b>' : ''}</span><b>${about(sim.atTarget[k])} lei</b></li>`;
    el('range').innerHTML = `<ul class="sums">${GROWTH.map(row).join('')}</ul>
      <p class="note">Sus am socotit cu ${growthName.probable}. Nimeni nu știe dinainte cât cresc banii, așa că asta nu e o promisiune. Linia subțire arată cât pui tu.</p>`;
  }

  /* ---- "Compară cu": the Casa de Pensii costs on the same chart (docs/05 §3) ----
     Only what the farmer would have to pay is drawn. The Casa de Pensii gives pension points, not a
     sum that grows, and the CEI has no known yearly amount yet, so neither gets a growth line. */
  const COMPARE_NAME = { contract: 'Casa de Pensii: contract', declaration: 'Casa de Pensii: Declarația Unică' };
  function comparison() {
    const path = E.comparisonPaidPath(against, CC.FARM.age, P.targetAge, options);
    return path ? { name: COMPARE_NAME[against], short: 'Ai de plătit', path } : null;
  }
  function compareNote() {
    el('g-compare').value = against;
    const note = el('g-cmp-note');
    const st = options.state;
    const years = `Pensia minimă de stat e ${lei(st.minimumPension)} pe lună și cere cel puțin ${st.minimumYears} ani de plăți.${options.enoughYearsForMinimum ? '' : ` Până la ${P.targetAge} de ani mai ai ${options.yearsLeft}.`}`;
    const points = 'Nu desenăm cât cresc acești bani: Casa de Pensii nu strânge o sumă pe numele tău, îți dă puncte de pensie.';
    const text = {
      pilon3: '',
      contract: `Linia aurie arată cât ai de plătit cu un contract la Casa de Pensii: cel puțin ${lei(st.contractMonthly)} pe lună, din ${date(st.contractFrom, true)}. ${points} ${years}`,
      declaration: `Linia aurie arată cât ai de plătit prin Declarația Unică: ${lei(st.declarationYearly)} pe an.${st.declarationVerified ? '' : ` ${verify}`} ${points} ${years}`,
      cei: `Contul de economii pornește din ${date(options.cei.availableFrom, true)}. ${options.cei.ceilingYearly ? `Poți pune până la ${lei(options.cei.ceilingYearly)} pe an.` : `Nu știm încă cât poți pune pe an, așa că nu desenăm nimic. ${verify}`}`,
    }[against];
    note.innerHTML = text;
    note.hidden = !text;
  }

  /* ---- The slider, what it does to the salary, and the buttons ---- */
  function salaryLine(bani) {
    const w = effect(bani);
    return w.salaryAfter === w.paidBefore
      ? `Salariul tău rămâne ${lei(w.paidBefore)} pe lună.`
      : `Salariul tău trece de la ${lei(w.paidBefore)} la ${lei(w.salaryAfter)} pe lună.`;
  }
  function hint() {
    const w = effect(monthly());
    if (w.underMinimum) return `Fondul ales cere cel puțin ${lei(w.minimum)} pe lună.${w.minimumVerified ? '' : ` ${verify}`}`;
    if (plan.monthlySalary <= 0) return 'Fără salariu nu îți sugerăm o sumă.';
    const s = suggestion();
    return s === monthly()
      ? `Atât îți sugerăm: ${P.suggestMaxPctOfSalary}% din salariu, rotunjit.`
      : `Îți sugerăm ${lei(s)} pe lună, adică ${P.suggestMaxPctOfSalary}% din salariu, rotunjit.`;
  }
  function actions() {
    if (!CC.isSignedIn()) {
      return `<a class="btn btn-dark gap" href="/login">Intră în cont ca să pornești</a>${CC.isIon ? '<p class="note gap">Acum vezi exemplul lui Ion.</p>' : ''}`;
    }
    if (!me) return '<a class="btn btn-dark gap" href="/onboarding">Spune-ne întâi despre fermă</a>';
    if (!hasAccount) return '<p class="note gap">Ca să pornești pensia, activează întâi contul CropCash.</p><a class="btn btn-line gap" href="/bani">Mergi la Contul tău</a>';
    const off = navigator.onLine ? '' : ' disabled';
    const under = effect(monthly()).underMinimum ? ' disabled' : '';
    const offNote = navigator.onLine ? '' : '<p class="note gap">Ca să pornești, să schimbi sau să oprești pensia ai nevoie de internet.</p>';
    if (!running) return `<button type="button" class="btn btn-dark gap" data-act="start"${off}${under}>Pornesc</button>${offNote}`;
    const same = monthly() === current;
    return `<div class="ob-actions gap">${same ? '' : `<button type="button" class="btn btn-dark" data-act="change"${off}${under}>Schimbă suma la ${lei(monthly())}</button>`}
      <button type="button" class="btn btn-line" data-act="stop"${off}>Opresc pensia</button>
      <button type="button" class="btn btn-line" disabled>Sar o lună</button></div>
      <p class="note">Sărirea unei luni vine mai târziu.</p>${offNote}`;
  }
  function amountCard() {
    el('m-title').textContent = running ? `Pui ${lei(current)} pe lună` : 'Cât pui pe lună?';
    el('m-body').innerHTML = `${running ? '<p class="note">Poți schimba suma de la următoarea plată sau poți opri pensia.</p>' : ''}
      <label class="ob-field pn-slider">${running ? 'Altă sumă' : 'Pui'}: <b id="p-value">${lei(monthly())}</b>
        <input type="range" id="p-range" min="${P.sliderMinLei}" max="${P.sliderMaxLei}" step="${P.sliderStepLei}" value="${monthlyLei}"></label>
      <p class="note" id="p-hint">${hint()}</p>
      <p class="paper-effect" id="p-effect" aria-live="polite">${esc(salaryLine(monthly()))}</p>
      <div id="p-act">${actions()}</div>`;
  }
  function onSlide() {
    el('p-value').textContent = lei(monthly());
    el('p-hint').innerHTML = hint();
    el('p-effect').textContent = salaryLine(monthly());
    el('p-act').innerHTML = actions();
    hero();
  }

  /* ---- Payments so far and the fund ---- */
  function fundBlock() {
    const chosen = funds.find((f) => f.id === fundId);
    const off = me && !navigator.onLine ? ' disabled' : '';
    return `<h3 class="${running ? 'gap' : ''}">Unde se strâng banii</h3>
      <p class="note">Fondurile sunt în ordinea alfabetului. Nu îți spunem pe care să-l alegi.</p>
      <label class="ob-field">Fondul de pensii<select id="p-fund"${off}><option value="">Nu am ales încă</option>${funds.map((f) => `<option value="${esc(f.id)}"${f.id === fundId ? ' selected' : ''}>${esc(f.name)}${f.min_monthly_lei === null ? "" : `, de la ${f.min_monthly_lei} lei`}</option>`).join('')}</select></label>
      ${chosen ? `<p class="note gap">${esc(chosen.administrator)}. ${chosen.min_monthly_lei === null ? 'Nu știm încă suma minimă cerută.' : `Cere cel puțin ${chosen.min_monthly_lei} lei pe lună.`}${chosen.status === 'DE-VERIFICAT' ? ` ${verify}` : ''}</p>` : ''}
      ${me ? '' : '<p class="note gap">Fără cont, alegerea rămâne doar pe pagina asta.</p>'}
      <p class="ob-err" id="f-err" role="alert" hidden></p>`;
  }
  function sideCard() {
    const list = payments.slice(0, 6).map((t) => `<li><span><b>${esc(date(t.occurred_at.slice(0, 10), true))}</b></span><span class="ac-amt">${lei(-t.amount_bani)}</span></li>`).join('');
    const more = payments.length > 6 ? `<p class="note">Și încă ${payments.length - 6} plăți mai vechi.</p>` : '';
    const paid = running ? `<h2>Până acum</h2><p class="n20 gap">${lei(savedSoFar)}</p>
      ${payments.length ? `<ol class="ac-list gap">${list}</ol>${more}` : '<p class="note">Prima plată apare aici după ce trece.</p>'}` : '';
    el('side').innerHTML = paid + fundBlock();
  }

  /* ---- The other ways, and why the page uses Pilonul III (docs/05 §3) ---- */
  function whyNot() {
    const o = E.pensionOptions(data, CC.FARM.age);
    const row = (name, sub, amount) => `<li><span>${name}${sub ? `<small>${sub}</small>` : ""}</span><b>${amount}</b></li>`;
    const late = !o.enoughYearsForMinimum && o.yearsLeft > 0
      ? ` Dacă n-ai plătit până acum, până la ${P.targetAge} de ani mai ai ${o.yearsLeft} ani, mai puțin decât ${o.state.minimumYears}.`
      : '';
    el('why-not').innerHTML = `<ul class="sums">
        ${row('Casa de Pensii', `Contract opțional, din ${date(o.state.contractFrom, true)}`, `de la ${lei(o.state.contractMonthly)} pe lună`)}
        ${row('Casa de Pensii', 'Prin Declarația Unică', `${lei(o.state.declarationYearly)} pe an${o.state.declarationVerified ? '' : ` ${verify}`}`)}
        ${row('Pilonul III', 'Merge de azi, cu sume mici', o.pilon3.lowestMonthly ? `de la ${lei(o.pilon3.lowestMonthly)} pe lună` : 'sume mici')}
        <li class="pn-funds"><ul class="sums">${o.pilon3.funds.map((f) => row(esc(f.name), esc(f.administrator ?? ''),
          f.minMonthly === null ? `suma nu se știe ${verify}` : `de la ${lei(f.minMonthly)} pe lună${f.verified ? '' : ` ${verify}`}`)).join('')}</ul></li>
        ${row('Cont de economii (CEI)', `Din ${date(o.cei.availableFrom, true)}`, o.cei.ceilingYearly ? `până la ${lei(o.cei.ceilingYearly)} pe an` : `sumele nu se știu încă ${verify}`)}
      </ul>
      <p class="note">Pensia minimă de stat e ${lei(o.state.minimumPension)} pe lună, dar cere cel puțin ${o.state.minimumYears} ani de plăți.${late}</p>
      <p class="note">De aceea socotim cu Pilonul III: există de azi și merge cu sume mici. Fondurile sunt în ordine alfabetică. Nu îți spunem ce să alegi.</p>`;
  }

  function render() { hero(); amountCard(); sideCard(); whyNot(); }
  render();

  /* ---- Asking before money moves ---- */
  function ask(title, text, action) {
    const yes = el('a-yes'), err = el('a-err');
    el('a-title').textContent = title;
    el('a-text').textContent = text;
    err.hidden = true;
    yes.disabled = false;
    yes.textContent = 'Bine așa';
    yes.onclick = async () => {
      yes.disabled = true;
      yes.textContent = 'Așteaptă puțin…';
      try {
        await CC.send(action);
        location.reload();
      } catch (e) {
        yes.disabled = false;
        yes.textContent = 'Bine așa';
        err.textContent = CC.failText(e);
        err.hidden = false;
      }
    };
    el('a-no').onclick = () => el('ask').close();
    el('ask').showModal();
  }

  document.addEventListener('input', (e) => {
    if (e.target.id !== 'p-range') return;
    monthlyLei = +e.target.value;
    onSlide();
  });
  document.addEventListener('change', async (e) => {
    if (e.target.id === 'g-compare') {
      against = E.PENSION_COMPARISONS.includes(e.target.value) ? e.target.value : 'pilon3';
      try { localStorage.setItem(COMPARE_KEY, against); } catch (err) { /* stays for this visit */ }
      hero();
      return;
    }
    if (e.target.id !== 'p-fund') return;
    const before = fundId;
    fundId = e.target.value || null;
    if (!me) { sideCard(); onSlide(); return; }
    try {
      await CC.send((Live) => Live.write('set_pension_fund', { fundId }));
      location.reload();
    } catch (err) {
      fundId = before;
      sideCard();
      el('f-err').textContent = CC.failText(err);
      el('f-err').hidden = false;
    }
  });
  document.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-growth]');
    if (pick) { growth = pick.dataset.growth; hero(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'start') {
      return ask('Pornești pensia?', `Pui ${lei(monthly())} pe lună, începând de azi. ${salaryLine(monthly())} În demo, plata se face cu un card de test.`,
        (Live) => Live.write('start_pension', { monthlyLei }));
    }
    if (act === 'change') {
      return ask('Schimbi suma?', `De la următoarea plată pui ${lei(monthly())} pe lună în loc de ${lei(current)}. ${salaryLine(monthly())}`,
        (Live) => Live.write('change_pension', { monthlyLei }));
    }
    if (act === 'stop') {
      const kept = savedSoFar > 0 ? ` Cei ${lei(savedSoFar)} puși până acum rămân deoparte.` : '';
      return ask('Oprești pensia?', `De acum nu se mai ia nimic.${kept} ${salaryLine(0)}`, (Live) => Live.write('stop_pension', {}));
    }
    return undefined;
  });
  const sync = () => { el('p-act').innerHTML = actions(); sideCard(); };
  addEventListener('online', sync);
  addEventListener('offline', sync);
})();

}
