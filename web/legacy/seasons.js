/* Ported from farm-app by web/scripts/port-legacy.mjs. Edit farm-app, or edit here and stop re-running the port. */
/* eslint-disable */
// @ts-nocheck
export default function install() {
/* The two season forms, used by onboarding and Recolte. Every crop grows for its own length of time:
   what was gathered started when it was sown, often the year before, and what's in the ground now
   is noted separately. Everything is calculated here and saved in this browser, so it works offline. */
window.Seasons = (function () {
  const { TODAY, esc, baseData } = CC;
  const E = window.CropEngine;
  const NOW = TODAY.slice(0, 7);
  const SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
  const monthLabel = (key) => `${SHORT[+key.slice(5) - 1]} ${key.slice(0, 4)}`;
  const luni = (n) => (n === 1 ? '1 lună' : `${n} luni`);
  const crops = () => baseData().crops.crops;
  const cropOf = (id) => crops().find((c) => c.id === id);
  const text = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  const parse = (v) => { const s = v.trim().replace(',', '.'); return s === '' ? null : Number(s); };
  const addMonth = (key, n) => { const t = +key.slice(0, 4) * 12 + +key.slice(5) - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

  /* ---- What was gathered ---- */
  function gatheredRow(crop, g) {
    const s = E.gatheredSeason(crop, NOW);
    const area = g.areaHa ?? 0;
    const usual = area > 0 ? `media: ${text(Math.round(area * crop.yield_t_per_ha.mean * 10) / 10)}` : '';
    return `<fieldset class="ob-season" data-gathered="${crop.id}"><legend>${esc(crop.name_ro)}</legend>
      <p class="hint">Semănat în ${monthLabel(s.sown)}, strâns în ${monthLabel(s.harvest)}: ${luni(E.growingMonths(crop))}.</p>
      <div class="ob-grid">
        <label>Hectare<input data-f="areaHa" inputmode="decimal" autocomplete="off" value="${text(g.areaHa)}"></label>
        <label>Câte tone ai strâns?<input data-f="tonnes" inputmode="decimal" autocomplete="off" placeholder="${usual}" value="${text(g.tonnes)}"></label>
        <label>Cu cât ai vândut, în lei/kg?<input data-f="priceLeiPerKg" inputmode="decimal" autocomplete="off" placeholder="media: ${text(crop.price_lei_per_kg.mean)}" value="${text(g.priceLeiPerKg)}"></label>
        <label>Câte tone mai ai în hambar?<input data-f="storedTonnes" inputmode="decimal" autocomplete="off" placeholder="0" value="${text(g.storedTonnes)}"></label>
      </div></fieldset>`;
  }

  /* Empty boxes stay empty: the app then keeps the average for that crop. */
  function readGathered(root) {
    const rows = [];
    for (const box of root.querySelectorAll('[data-gathered]')) {
      const crop = cropOf(box.dataset.gathered);
      const v = Object.fromEntries([...box.querySelectorAll('[data-f]')].map((i) => [i.dataset.f, parse(i.value)]));
      const numbers = Object.values(v).filter((x) => x !== null);
      if (numbers.some((x) => !Number.isFinite(x) || x < 0)) return { error: `${crop.name_ro}: scrie doar numere, de exemplu ${text(crop.price_lei_per_kg.mean)}.` };
      const filled = v.tonnes !== null || v.priceLeiPerKg !== null || v.storedTonnes !== null;
      if (filled && !(v.areaHa > 0)) return { error: `${crop.name_ro}: scrie câte hectare ai avut.` };
      if (v.tonnes !== null && v.storedTonnes !== null && v.storedTonnes > v.tonnes) return { error: `${crop.name_ro}: în hambar nu pot fi mai multe tone decât ai strâns.` };
      const s = E.gatheredSeason(crop, NOW);
      rows.push({ id: crop.id, cropId: crop.id, sown: s.sown, harvested: s.harvest, ...v, filled });
    }
    return { rows };
  }
  const onlyFilled = (rows) => rows.filter((r) => r.filled).map(({ filled, ...r }) => r);

  /* ---- What's in the ground ---- */
  /* From what could still be growing to a year ahead. Sown earlier, it would already be harvested. */
  function sowingChoices(crop) {
    const months = [];
    for (let m = addMonth(NOW, 1 - E.growingMonths(crop)); m <= addMonth(NOW, 12); m = addMonth(m, 1)) months.push(m);
    return months;
  }
  const usualPlanting = (crop) => E.growingSeason(crop, NOW)?.sown ?? E.nextSowing(crop, NOW);
  function plantedHint(crop, sown) {
    const month = sown || usualPlanting(crop);
    const harvest = `îl strângi în ${monthLabel(E.cropSeason(crop, month).harvest)}, după ${luni(E.growingMonths(crop))}.`;
    if (month > NOW) return `Îl semeni în ${monthLabel(month)} și ${harvest}`;
    return `Semănat în ${monthLabel(month)}, ${harvest}`;
  }
  const isSown = (crop, sown) => (sown || usualPlanting(crop)) <= NOW;
  function plantedRow(crop, sown) {
    const picked = sown || usualPlanting(crop);
    const usual = (m) => +m.slice(5) === crop.sowing_month;
    const options = sowingChoices(crop).map((m) => `<option value="${m}"${m === picked ? ' selected' : ''}>${monthLabel(m)}${usual(m) ? ', de obicei' : ''}</option>`).join('');
    return `<fieldset class="ob-season" data-planted="${crop.id}"><legend>${esc(crop.name_ro)}</legend>
      <label>Când l-ai semănat sau când îl semeni?<select data-sown>${options}</select></label>
      <p class="hint" aria-live="polite">${plantedHint(crop, picked)}</p></fieldset>`;
  }
  const readPlanted = (root) => Object.fromEntries([...root.querySelectorAll('[data-planted]')].map((b) => [b.dataset.planted, b.querySelector('select').value]));
  function bindPlanted(root) {
    root.addEventListener('change', (e) => {
      const box = e.target.closest('[data-planted]');
      if (box) box.querySelector('.hint').textContent = plantedHint(cropOf(box.dataset.planted), e.target.value);
    });
  }

  return { monthLabel, luni, cropOf, gatheredRow, readGathered, onlyFilled, plantedRow, readPlanted, bindPlanted, plantedHint, isSown, usualPlanting };
})();

}
