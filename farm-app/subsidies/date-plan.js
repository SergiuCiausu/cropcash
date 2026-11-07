/* "Datele planului": the figures behind the salary, with the salary recalculated on the phone as they change.
   The APIA date stays fixed (P13, P29). A signed-in farmer's pension is a Stripe subscription, so it only
   shows here until W7 can change it. */
(function () {
  const { exact, group, esc } = CC;
  CC.start();

  const el = (id) => document.getElementById(id);
  const H = CC.harvests;
  const FARM = CC.FARM;
  const params = CC.data().params;
  const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const monthName = (key) => `${MONTHS[+key.split('-')[1] - 1]} ${key.slice(0, 4)}`;
  const lei = (bani) => `${exact(bani)} lei`;
  const decimal = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
  const MAX_OPENING_LEI = 100000000;
  const PENSION = { min: params.pension.slider_min_lei.value, max: params.pension.slider_max_lei.value };

  /* What a figure falls back to without the farmer's own: Recolte, or the average. */
  const noted = CC.dataWithout();
  const cropOf = (d, id) => d.crops.crops.find((c) => c.id === id);
  const average = (id) => cropOf(CC.baseData(), id);
  /* A crop of the farmer's own already holds their figures, so it's changed where it was described. */
  const ownIds = [...new Set(FARM.parcels.map((p) => p.cropId))].filter((id) => CropEngine.isOwnCrop(id));
  const crops = [...new Set(FARM.parcels.map((p) => p.cropId))].filter((id) => !CropEngine.isOwnCrop(id)).map((id) => {
    const area = FARM.parcels.filter((p) => p.cropId === id).reduce((sum, p) => sum + p.areaHa, 0);
    const own = H.state.expected.find((e) => e.cropId === id);
    const back = cropOf(noted, id);
    return {
      id,
      area,
      name: H.cropName(id),
      backYield: decimal(back.yield_t_per_ha.mean),
      backPrice: decimal(back.price_lei_per_kg.mean),
      startYield: decimal(own?.yieldTPerHa ?? back.yield_t_per_ha.mean),
      startPrice: decimal(own?.priceLeiPerKg ?? back.price_lei_per_kg.mean),
      backWord: CC.figureSource(id, false) === 'gathered' ? 'din Recolte' : 'media noastră',
    };
  });

  el('m-year').textContent = CC.BASE_YEAR;
  el('opening').value = group(Math.round(FARM.startBalanceBani / 100));
  if (CC.onServer) {
    /* The note in the page is about saving to the server, which a browser-only farm never does. */
    el('pension-field').hidden = true;
    el('pension-note').innerHTML = CC.pensionBani()
      ? `Pui deoparte ${lei(CC.pensionBani())} pe lună. <a href="pensie.html">Suma se schimbă din pagina Bătrânețe</a>.`
      : 'Nu ai pornit încă o pensie. <a href="pensie.html">Vezi cât strângi</a>.';
  } else {
    document.querySelector('[data-offline]')?.remove();
    el('pension').value = group(Math.round(CC.pensionBani() / 100));
    el('pension-note').dataset.keepLei = '';
    el('pension-err').dataset.keepLei = '';
    el('pension-note').textContent = `Între ${PENSION.min} și ${PENSION.max} lei pe lună, sau 0 dacă nu pui nimic deoparte.${CC.ownPension() ? '' : ' Acum e un exemplu.'}`;
  }

  el('crops').innerHTML = crops.map((c) => `<fieldset class="crop-fig" data-crop="${esc(c.id)}">
    <legend>${esc(c.name)}, ${decimal(c.area)} ha <span class="tag n" data-source></span></legend>
    <label class="ob-field">Tone la hectar<input data-yield inputmode="decimal" autocomplete="off" value="${c.startYield}"></label>
    <label class="ob-field">Preț, lei/kg<input data-price inputmode="decimal" autocomplete="off" value="${c.startPrice}"></label>
    <p class="note" data-total></p>
    <p class="ob-err" data-err role="alert" hidden></p>
    <button type="button" class="btn btn-line crop-reset" data-reset hidden>Înapoi la ${c.backWord}</button>
  </fieldset>`).join('');
  if (ownIds.length) {
    el('crops').insertAdjacentHTML('afterend', `<p class="note gap">${esc(ownIds.map((id) => H.cropName(id)).join(', '))}: cifrele se schimbă din <a href="recolte.html#cultura">Recolte</a>.</p>`);
  }
  const cropBox = (c) => document.querySelector(`[data-crop="${c.id}"]`);

  /* ---- Reading what's typed. Null means the text isn't a usable number. ---- */
  const wholeLei = (text) => (/^[\d.\s]+$/.test(text.trim()) ? Number(text.replace(/\D/g, '')) : null);
  const decimalNumber = (text) => {
    const t = text.trim().replace(',', '.');
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  };
  function show(node, message) {
    node.textContent = message;
    node.hidden = !message;
  }

  function readCrop(c) {
    const box = cropBox(c);
    const yieldText = box.querySelector('[data-yield]').value.trim();
    const priceText = box.querySelector('[data-price]').value.trim();
    const y = decimalNumber(yieldText), p = decimalNumber(priceText);
    const bad = !(y > 0) || !(p > 0);
    return {
      bad,
      y,
      p,
      /* A figure left at its fallback isn't the farmer's own, so it keeps following Recolte. */
      row: { cropId: c.id, yieldTPerHa: yieldText === c.backYield ? null : y, priceLeiPerKg: priceText === c.backPrice ? null : p },
    };
  }

  function read() {
    const openingLei = wholeLei(el('opening').value);
    const openingOk = openingLei !== null && openingLei <= MAX_OPENING_LEI;
    show(el('opening-err'), openingOk ? '' : `Scrie suma ca număr, de exemplu ${group(CC.ION.startBalanceBani / 100)}.`);

    const pensionLei = CC.onServer ? null : wholeLei(el('pension').value);
    const pensionOk = CC.onServer || (pensionLei !== null && (pensionLei === 0 || (pensionLei >= PENSION.min && pensionLei <= PENSION.max)));
    show(el('pension-err'), pensionOk ? '' : `Scrie 0 sau o sumă între ${PENSION.min} și ${PENSION.max} lei.`);

    const rows = crops.map((c) => {
      const r = readCrop(c);
      const box = cropBox(c);
      const own = r.row.yieldTPerHa !== null || r.row.priceLeiPerKg !== null;
      const range = average(c.id);
      const yieldRange = range.yield_t_per_ha, priceRange = range.price_lei_per_kg;
      const unusual = !r.bad && r.row.yieldTPerHa !== null && (r.y < yieldRange.min || r.y > yieldRange.max)
        ? ` De obicei, ${decimal(yieldRange.min)}–${decimal(yieldRange.max)} t/ha.`
        : !r.bad && r.row.priceLeiPerKg !== null && (r.p < priceRange.min || r.p > priceRange.max)
          ? ` De obicei, ${decimal(priceRange.min)}–${decimal(priceRange.max)} lei/kg.`
          : '';
      box.querySelector('[data-source]').textContent = own ? 'cifrele tale' : c.backWord;
      box.querySelector('[data-total]').textContent = r.bad ? '' : `${decimal(r.y)} t/ha × ${decimal(c.area)} ha = ${decimal(r.y * c.area)} t, adică ${lei(Math.round(r.y * c.area * 1000 * r.p * 100))}.${unusual}`;
      show(box.querySelector('[data-err]'), r.bad ? 'Scrie un număr mai mare ca 0, de exemplu 5,5.' : '');
      box.querySelector('[data-reset]').hidden = !own;
      return r;
    });

    const expected = [
      ...H.state.expected.filter((e) => !crops.some((c) => c.id === e.cropId)),
      ...rows.map((r) => r.row).filter((row) => row.yieldTPerHa !== null || row.priceLeiPerKg !== null),
    ];
    return {
      ok: openingOk && pensionOk && !rows.some((r) => r.bad),
      openingBani: openingOk ? openingLei * 100 : null,
      pension: CC.onServer ? null : pensionOk ? pensionLei * 100 : null,
      expected,
      cropsChanged: crops.filter((c) => {
        const box = cropBox(c);
        return box.querySelector('[data-yield]').value.trim() !== c.startYield || box.querySelector('[data-price]').value.trim() !== c.startPrice;
      }),
    };
  }

  /* ---- The preview: why the salary moved, or why it didn't ---- */
  const before = CC.farmPlan();
  const firstSale = (plan, cropId) => plan.timelines.medium.months.find((m) => m.entries.some((e) => e.kind === 'crop_sale' && e.cropId === cropId && e.value > 0))?.key;
  function stillReason(after, input) {
    const limit = after.salary.bindingMonth;
    const openingSame = input.openingBani === FARM.startBalanceBani;
    const pensionSame = CC.onServer || input.pension === CC.pensionBani();
    const late = input.cropsChanged.filter((c) => firstSale(after, c.id) > limit);
    if (openingSame && pensionSame && input.cropsChanged.length && late.length === input.cropsChanged.length) {
      const sale = late.length > 1 ? 'vânzarea recoltei vine' : `vânzarea de ${late[0].name.toLowerCase()} vine`;
      return `Salariul depinde de banii de până în ${monthName(limit)}, iar ${sale} abia în ${monthName(firstSale(after, late[0].id))}. Se schimbă ce arată Prognoza.`;
    }
    if (after.monthlySalary === 0) return `Banii nu ajung până în ${monthName(limit)}.`;
    return `Diferența e prea mică: salariul se rotunjește în jos la ${params.salary_round_lei.value} lei.`;
  }

  /* On a phone the preview scrolls away, so the result is repeated beside the button. */
  function render() {
    const input = renderPreview();
    el('p-again').textContent = `${el('p-amount').textContent}. ${el('p-why').textContent}`;
    return input;
  }

  function renderPreview() {
    const input = read();
    el('save').disabled = !input.ok;
    if (!input.ok) {
      el('p-why').textContent = 'Verifică cifrele de mai jos.';
      return input;
    }
    const after = CC.previewPlan(input);
    const was = before.monthlySalary, now = after.monthlySalary;
    const touched = input.openingBani !== FARM.startBalanceBani || (!CC.onServer && input.pension !== CC.pensionBani()) || input.cropsChanged.length > 0;
    el('p-amount').textContent = was === now ? `${lei(now)} pe lună` : `${lei(was)} → ${lei(now)} pe lună`;
    if (!touched) el('p-why').textContent = 'Schimbă o cifră și vezi aici efectul.';
    else if (was === now) el('p-why').textContent = stillReason(after, input);
    else el('p-why').textContent = CC.onServer ? `Dacă salvezi, ${lei(now)} devine suma pe care ți-o plătim lunar.` : 'Cifrele nu sunt salvate încă.';
    return input;
  }

  async function save(input) {
    const button = el('save');
    button.disabled = true;
    button.textContent = 'Se salvează…';
    show(el('save-err'), '');
    try {
      await CC.savePlanFigures(input);
      location.href = 'salariu.html';
    } catch (e) {
      show(el('save-err'), H.failText(e));
      button.disabled = false;
      button.textContent = 'Salvează';
    }
  }

  el('plan-form').addEventListener('input', render);
  el('plan-form').addEventListener('click', (e) => {
    const button = e.target.closest('[data-reset]');
    if (!button) return;
    const box = button.closest('[data-crop]');
    const c = crops.find((x) => x.id === box.dataset.crop);
    box.querySelector('[data-yield]').value = c.backYield;
    box.querySelector('[data-price]').value = c.backPrice;
    render();
  });
  el('plan-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = render();
    if (input.ok) save(input);
  });
  render();
})();
