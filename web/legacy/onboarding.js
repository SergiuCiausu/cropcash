/* Ported from farm-app by web/scripts/port-legacy.mjs. Edit farm-app, or edit here and stop re-running the port. */
/* eslint-disable */
// @ts-nocheck
export default function install() {
/* Onboarding, screens O1 to O7 from docs/06-features-mvp.md, plus what was gathered and what's sown.
   O6, the APIA paper, comes before the crops, so it saves the typing it exists to save.
   Everything is calculated in the browser. Signed out, the farm is saved there and it works without
   internet. Signed in, the farm goes to the server, so the last step needs internet. */
(function () {
  const { ION, esc, about, exact, group, data } = CC;
  const S = window.Seasons;
  CC.applyPalette();

  const form = document.getElementById('step');
  const app = data();
  const crops = app.crops.crops.filter((c) => !CropEngine.isOwnCrop(c.id));
  const counties = app.counties.counties;
  const state = { i: 0, county: null, search: '', ha: Object.fromEntries(crops.map((c) => [c.id, 0])), name: '', age: '', money: '', error: '', gathered: {}, planted: {}, paperNote: '', decisionBani: null };
  const STEPS = 9;
  const CROPS = 3, GATHERED = 4, PLANTED = 5, MONEY = 7;

  const parcels = () => crops.filter((c) => state.ha[c.id] > 0).map((c) => ({ cropId: c.id, areaHa: state.ha[c.id] }));
  const totalHa = () => parcels().reduce((sum, p) => sum + Math.round(p.areaHa * 100), 0) / 100;
  /* Age isn't known on the crops screen, so the live figure leaves out the young farmer scheme. */
  const estimate = (age) => CropEngine.computeSubsidies({ age, parcels: parcels() }, app);
  const num = (v) => parseFloat(String(v).replace(',', '.'));
  const roundHa = (v) => Math.round(Math.max(0, v) * 100) / 100;

  const top = () => `<div class="ob-top"><span class="logo"><span class="mark">${CC.icon('sprout')}</span><span>CropCash</span></span><span>${state.i ? `Pasul ${state.i} din ${STEPS - 1}` : ''}</span></div>`;
  const err = () => (state.error ? `<p class="ob-err" role="alert">${esc(state.error)}</p>` : '');
  const back = () => '<button type="button" class="btn btn-line" data-back>Înapoi</button>';

  function countyList() {
    const q = state.search.trim().toLowerCase();
    const list = counties.filter((c) => c.name_ro.toLowerCase().includes(q));
    return list.length ? list.map((c) => `<button type="button" data-county="${c.code}" aria-pressed="${state.county === c.code}">${esc(c.name_ro)}</button>`).join('') : '<p class="empty">Nu găsim județul.</p>';
  }
  const liveAmount = () => (parcels().length ? `<b>${about(estimate(100).totals.lei.probable)} lei</b>de la APIA, pentru ${String(totalHa()).replace('.', ',')} ha. Fără ajutorul pentru fermieri tineri.` : 'Alege o cultură și vezi suma aici.');
  const cropRows = () => crops.map((c) => `<div class="ob-crop"><b>${esc(c.name_ro)}</b><span class="ob-step">
      <button type="button" data-minus="${c.id}" aria-label="Mai puțin ${esc(c.name_ro)}">−</button>
      <input type="text" inputmode="decimal" data-ha="${c.id}" value="${String(state.ha[c.id]).replace('.', ',')}" aria-label="Hectare ${esc(c.name_ro)}">
      <button type="button" data-plus="${c.id}" aria-label="Mai mult ${esc(c.name_ro)}">+</button></span></div>`).join('');

  /* Starts with what's grown now. A crop rotated out can still be added. */
  const gatheredIds = () => crops.filter((c) => state.ha[c.id] > 0 || state.gathered[c.id]).map((c) => c.id);
  const gatheredRows = () => gatheredIds().map((id) => S.gatheredRow(S.cropOf(id), state.gathered[id] ?? { areaHa: state.ha[id] })).join('');
  const addCrops = () => crops.filter((c) => !gatheredIds().includes(c.id)).map((c) => `<button type="button" class="chip" data-add="${c.id}">Am strâns și ${esc(c.name_ro.toLowerCase())}</button>`).join('');
  const plantedRows = () => parcels().map((p) => {
    const crop = S.cropOf(p.cropId);
    return S.plantedRow(crop, state.planted[p.cropId] ?? S.usualPlanting(crop));
  }).join('');
  /* Keeps what's typed, also when going back. */
  function capture() {
    if (state.i === PLANTED) Object.assign(state.planted, S.readPlanted(form));
    if (state.i !== GATHERED) return null;
    const { rows, error } = S.readGathered(form);
    if (!error) state.gathered = Object.fromEntries(rows.map((r) => [r.cropId, r]));
    return error ?? null;
  }

  const VIEWS = [
    () => `<h1 tabindex="-1">Hai să-ți vedem banii</h1><p class="lead">Îți arătăm cât primești, când vin banii și cât poți cheltui pe lună. Durează două minute.</p>
      <div class="ob-actions"><button type="submit" class="btn btn-dark">Începe</button>${CC.isSignedIn() ? '' : '<button type="button" class="btn btn-line" data-ion>Folosește exemplul lui Ion</button>'}</div>`,
    () => `<h1 tabindex="-1">În ce județ e ferma?</h1><label class="ob-field">Caută județul<input id="search" value="${esc(state.search)}" autocomplete="off"></label>
      <div class="ob-list" id="counties">${countyList()}</div>${err()}
      <div class="ob-actions">${back()}<button type="submit" class="btn btn-dark">Mai departe</button></div>`,
    () => `<h1 tabindex="-1">Ai o hârtie de la APIA?</h1><p class="lead">Cererea sau decizia de plată. Fă-i o poză sau încarcă PDF-ul și completăm noi hectarele.</p>
      <div class="ob-paper">${Papers.button('Încarcă hârtia de la APIA')}</div>
      <div class="ob-actions">${back()}<button type="submit" class="btn btn-dark">Sar peste</button></div>`,
    () => `<h1 tabindex="-1">Ce cultivi anul ăsta?</h1><p class="lead">${esc(state.paperNote || 'Scrie câte hectare ai din fiecare.')}</p>${cropRows()}
      <div class="ob-live" id="live" aria-live="polite">${liveAmount()}</div>${err()}
      <div class="ob-actions">${back()}<button type="submit" class="btn btn-dark">Gata</button></div>`,
    () => `<h1 tabindex="-1">Ce ai strâns anul ăsta?</h1><p class="lead">Fiecare cultură are timpul ei. Dacă nu știi o cifră, las-o goală și folosim media.</p>${gatheredRows()}
      <div class="chips">${addCrops()}</div>${err()}
      <div class="ob-actions">${back()}<button type="submit" class="btn btn-dark">Gata</button><button type="button" class="btn btn-line" data-no-figures>Nu știu, folosesc media</button></div>`,
    () => `<h1 tabindex="-1">Ce ai acum în pământ?</h1><p class="lead">Ce ai semănat de curând se strânge separat de recolta de mai sus.</p>${plantedRows()}
      <div class="ob-actions">${back()}<button type="submit" class="btn btn-dark">Gata</button></div>`,
    () => `<h1 tabindex="-1">Cum te cheamă?</h1><label class="ob-field">Numele<input id="name" value="${esc(state.name)}" autocomplete="given-name"></label>
      <label class="ob-field">Câți ani ai?<input id="age" value="${esc(state.age)}" inputmode="numeric"></label>${err()}
      <div class="ob-actions">${back()}<button type="submit" class="btn btn-dark">Gata</button></div>`,
    () => `<h1 tabindex="-1">Câți bani ai acum?</h1><p class="lead">Ne trebuie ca să-ți spunem dacă îți ajung.${CC.isSignedIn() ? '' : ' Rămân doar pe acest dispozitiv.'}</p>
      <label class="ob-field">Suma, în lei<input id="money" value="${esc(state.money)}" inputmode="numeric"></label>${err()}
      <div class="ob-actions">${back()}<button type="submit" class="btn btn-dark">Arată-mi banii</button><button type="button" class="btn btn-line" data-skip>Nu știu, sar peste</button></div>`,
    () => {
      const r = estimate(+state.age);
      return `<h1 tabindex="-1">De la APIA primești</h1><p class="ob-amount">${state.decisionBani ? exact(state.decisionBani) : about(r.totals.lei.probable)} lei</p>
        <p class="lead">${state.decisionBani ? 'din decizia ta de plată' : `între ${about(r.totals.lei.min)} lei și ${about(r.totals.lei.max)} lei`}. Am creat Recolta ${CC.BASE_YEAR} cu aceste culturi.</p>
        <div class="ob-actions"><a class="btn btn-dark" href="/prognoza#ani">Vezi cât îți aduce ferma</a><a class="btn btn-line" href="/subventii">Vezi cum am calculat</a>${back()}</div>`;
    },
  ];

  function render() {
    form.innerHTML = `${top()}${VIEWS[state.i]()}`;
    (form.querySelector('input') ?? form.querySelector('h1')).focus();
  }
  function go(i) { state.i = i; state.error = ''; render(); }
  function fail(text) { state.error = text; render(); }

  /* A farm that already exists is edited: a repeat tap, or "Schimbă ferma". */
  const sendFarm = (input, gathered) => CC.send(async (Live) => {
    const update = () => Live.write('update_farm', input);
    if (CC.me) await update();
    else await Live.api('/api/farmers', { method: 'POST', body: JSON.stringify(input) }).catch((e) => { if (e.status === 409) return update(); throw e; });
    await Live.write('save_harvests', CropEngine.onboardingHarvests({ year: CC.BASE_YEAR, openingBani: input.startBalanceLei * 100, parcels: input.parcels, gathered, before: CC.me?.harvests }));
    if (state.decisionBani) await Live.write('save_apia_decision', { campaignYear: app.subsidies.meta.campaign_year, totalBani: state.decisionBani });
  });

  /* Returns what went wrong, or nothing. */
  async function save() {
    const money = state.money === '' ? 0 : Math.round(num(state.money));
    const county = counties.find((c) => c.code === state.county);
    const sownParcels = parcels().map((p) => (state.planted[p.cropId] ? { ...p, plantedMonth: state.planted[p.cropId] } : p));
    const parsed = CropEngine.OnboardingInputSchema.safeParse({ name: state.name, county: state.county, age: +state.age, startBalanceLei: money, parcels: sownParcels });
    if (!parsed.success) return 'Verifică datele de la pașii de dinainte.';
    if (CC.isSignedIn()) {
      try {
        await sendFarm(parsed.data, S.onlyFilled(Object.values(state.gathered)));
        return null;
      } catch (e) {
        return CC.failText(e);
      }
    }
    const names = parcels().map((p) => crops.find((c) => c.id === p.cropId).name_ro.toLowerCase());
    const haText = String(totalHa()).replace('.', ',');
    CC.saveFarm({ name: state.name.trim(), age: +state.age, county: county.name_ro, startBalanceBani: money * 100, parcels: sownParcels, gathered: S.onlyFilled(Object.values(state.gathered)), summary: `${haText} ha, ${names.join(' și ')}` });
    return null;
  }

  const CHECK = [
    () => null,
    () => (state.county ? null : 'Alege județul din listă.'),
    () => null,
    () => (parcels().length ? null : 'Scrie hectarele pentru cel puțin o cultură.'),
    capture,
    capture,
    () => {
      if (!state.name.trim()) return 'Scrie-ți numele.';
      const age = +state.age;
      return Number.isInteger(age) && age >= 16 && age <= 100 ? null : 'Scrie vârsta ca număr, de la 16 la 100.';
    },
    () => {
      if (state.money === '') return null;
      const v = num(state.money);
      return Number.isFinite(v) && v >= 0 && v <= 100000000 ? null : `Scrie suma ca număr, de exemplu ${group(ION.startBalanceBani / 100)}.`;
    },
  ];
  /* The crops screen is where the farmer checks and fixes what the paper said. */
  function usePaper(r) {
    const names = (ids) => ids.join(', ');
    r.parcels.forEach((p) => { state.ha[p.cropId] = p.areaAri / 100; });
    const none = r.kind === 'apia_decizie' ? 'Decizia nu are hectarele. Scrie-le tu.' : 'Nu am găsit hectare pe hârtie. Scrie-le tu.';
    const found = r.parcels.length ? 'Am completat de pe hârtie. Verifică hectarele.' : none;
    state.paperNote = r.unknownCrops.length ? `${found} Nu am recunoscut: ${names(r.unknownCrops)}.` : found;
  }
  async function readPaper() {
    const reading = await Papers.pick({ accepts: ['apia_cerere', 'apia_decizie'], pages: true });
    if (!reading) return;
    usePaper(reading);
    if (reading.kind === 'apia_decizie') state.decisionBani = (await Papers.confirmDecision(reading)) ?? null;
    go(CROPS);
  }

  let saving = false;
  async function next() {
    if (saving) return;
    const problem = CHECK[state.i]();
    if (problem) { fail(problem); return; }
    if (state.i === MONEY) {
      saving = true;
      const failed = await save();
      saving = false;
      if (failed) { fail(failed); return; }
    }
    go(state.i + 1);
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); next(); });
  form.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.paper !== undefined) { readPaper(); return; }
    if (t.dataset.ion !== undefined) { CC.saveFarm(null); location.href = '/subventii'; return; }
    if (t.dataset.back !== undefined) { capture(); go(state.i - 1); return; }
    if (t.dataset.noFigures !== undefined) { state.gathered = {}; go(state.i + 1); return; }
    if (t.dataset.add) { capture(); state.gathered[t.dataset.add] = { areaHa: null }; render(); return; }
    if (t.dataset.skip !== undefined) { state.money = ''; next(); return; }
    if (t.dataset.county) { state.county = t.dataset.county; state.search = ''; state.error = ''; go(state.i + 1); return; }
    const id = t.dataset.plus ?? t.dataset.minus;
    if (id) { state.ha[id] = roundHa(state.ha[id] + (t.dataset.plus ? 1 : -1)); render(); form.querySelector(`[data-${t.dataset.plus ? 'plus' : 'minus'}="${id}"]`).focus(); }
  });
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'search') { state.search = t.value; document.getElementById('counties').innerHTML = countyList(); }
    if (t.id === 'name') state.name = t.value;
    if (t.id === 'age') state.age = t.value.trim();
    if (t.id === 'money') state.money = t.value.trim().replace(/\./g, '');
    if (t.dataset.ha) {
      const v = num(t.value);
      state.ha[t.dataset.ha] = Number.isFinite(v) ? roundHa(v) : 0;
      document.getElementById('live').innerHTML = liveAmount();
    }
  });
  S.bindPlanted(form);
  render();
})();

}
