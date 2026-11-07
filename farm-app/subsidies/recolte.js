/* "Recolte": what was gathered, what's in the ground and what was noted, for the chosen project.
   The harvest button at the top switches project. A closed project shows its result instead.
   Signed out, everything is saved in this browser and works without internet. On a real farm
   each change goes to the server, so it needs internet until W9 adds the outbox.
   Nothing noted here moves money, it only records what already happened. */
(function () {
  const { TODAY, esc, exact, date, group } = CC;
  const H = CC.harvests;
  CC.start();

  const el = (id) => document.getElementById(id);
  const state = H.state, h = H.selected;
  const crops = CC.data().crops.crops;
  const cropName = H.cropName;
  const cropId = CC.crop?.id ?? null;
  const ownParcels = cropId ? h.parcels.filter((p) => p.cropId === cropId) : h.parcels;
  const shownRecords = cropId ? h.records.filter((r) => r.cropId === cropId) : h.records;
  const project = H.projectName(h, cropId);
  const CATEGORIES = [['seeds', 'Sămânță'], ['fertilizer', 'Îngrășăminte'], ['treatments', 'Tratamente'], ['diesel', 'Motorină'], ['field_work', 'Lucrări'], ['repairs', 'Reparații'], ['rent', 'Arendă'], ['other', 'Altele']];
  const APIA = [['apia_advance', 'Avansul APIA'], ['apia_balance', 'Restul de la APIA']];
  const KINDS = [['sale', 'Vânzare'], ['expense', 'Cheltuială']];
  const num = (v) => parseFloat(String(v).trim().replace(/\./g, '').replace(',', '.'));
  const totalHa = (parcels) => parcels.reduce((s, p) => s + Math.round(p.areaHa * 100), 0) / 100;
  const haText = (v) => String(v).replace('.', ',');
  const list = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} și ${names[names.length - 1]}`);
  /* A crop described in this visit isn't in the page's data until it reloads, so its name comes from the form. */
  const ownOf = (id) => state.ownCrops.find((c) => c.id === id);
  const nameOf = (id) => cropName(id) || ownOf(id)?.name || '';
  const summary = (parcels) => `${haText(totalHa(parcels))} ha, ${list(parcels.map((p) => nameOf(p.cropId).toLowerCase()))}`;
  /* APIA money comes only from what really arrived, so it's never typed in here (decision 3). */
  let sending = false;
  const save = async (show = fail) => {
    if (sending) return;
    sending = true;
    try {
      await H.save();
      location.reload();
    } catch (e) {
      sending = false;
      show(H.failText(e));
    }
  };
  const inBox = (id) => (text) => { el(id).textContent = text; el(id).hidden = false; };

  /* ---- The selected harvest ---- */
  const isOpen = !H.closed(h, cropId);
  const firstDay = `${H.month(h.year)}-01`;
  const started = firstDay <= TODAY;
  el('title').textContent = project;
  if (isOpen) {
    /* Closing comes last on the page, as the last thing done with a project. */
    el('close-row').hidden = false;
    el('close-q').textContent = `Ai terminat cu ${project}?`;
    el('a-close').textContent = cropId ? 'Încheie cultura' : 'Încheie recolta';
    el('a-edit').hidden = !!cropId; // Crops and hectares belong to the whole year.
  } else {
    /* Nothing can be noted here, so the result is the page. */
    el('lead').textContent = 'E încheiată. Aici vezi planul și ce s-a întâmplat.';
    el('result').hidden = false;
    el('compare').innerHTML = H.compare(h, 'Real', cropId);
    if (h.year >= CC.BASE_YEAR) el('reopen').innerHTML = '<button type="button" class="btn btn-line" id="a-reopen">Redeschide</button>';
  }

  /* ---- What was gathered, and what's in the ground. Both feed the forecast. ---- */
  const S = window.Seasons;
  const seasons = isOpen && h.year === CC.BASE_YEAR;
  el('s-crops').hidden = !isOpen;
  el('g-open').hidden = !seasons;
  const cropRow = (name, detail, tag, tone) => `<div class="h-crop"><b>${esc(name)}</b><small>${detail}</small><span class="tag ${tone}">${tag}</span></div>`;
  if (isOpen && !seasons) {
    /* A later harvest isn't sown yet, so there are no dates to change. */
    el('crops-title').textContent = 'Ce vei semăna';
    el('p-open').hidden = true;
    el('crop-list').innerHTML = ownParcels.map((p) => cropRow(`${cropName(p.cropId)}, ${haText(p.areaHa)} ha`, H.seasonWord(p.cropId), 'De semănat', 'n')).join('');
  }
  if (seasons) {
    const ownCrops = (cropId ? [cropId] : [...new Set([...h.parcels.map((p) => p.cropId), ...state.gathered.map((g) => g.cropId)])]).map(S.cropOf);
    const ownGathered = cropId ? state.gathered.filter((g) => g.cropId === cropId) : state.gathered;
    const orAverage = (v, unit) => (v === null || v === undefined ? 'media' : `${String(v).replace('.', ',')} ${unit}`);
    const gatheredRows = ownGathered.length
      ? ownGathered.map((g) => cropRow(cropName(g.cropId), `Semănat în ${S.monthLabel(g.sown)}, strâns în ${S.monthLabel(g.harvested)}. ${orAverage(g.tonnes, 't')} la ${orAverage(g.priceLeiPerKg, 'lei/kg')}${g.storedTonnes ? `, ${String(g.storedTonnes).replace('.', ',')} t în hambar` : ''}.`, 'Strâns', 'd')).join('')
      : '<p class="h-none">Nimic strâns încă. Folosim mediile.</p>';
    const plantedRows = ownParcels.map((p) => {
      const crop = S.cropOf(p.cropId);
      const sown = S.isSown(crop, p.plantedMonth);
      return cropRow(`${cropName(p.cropId)}, ${String(p.areaHa).replace('.', ',')} ha`, S.plantedHint(crop, p.plantedMonth), sown ? 'În pământ' : 'De semănat', sown ? 'ok' : 'n');
    }).join('');
    el('crop-list').innerHTML = plantedRows + gatheredRows;
    const openGathered = () => {
      el('g-rows').innerHTML = ownCrops.map((c) => S.gatheredRow(c, state.gathered.find((g) => g.cropId === c.id) ?? { areaHa: h.parcels.find((p) => p.cropId === c.id)?.areaHa ?? null })).join('');
      el('g-err').hidden = true;
      el('g-edit').showModal();
    };
    el('g-open').addEventListener('click', openGathered);
    el('p-open').addEventListener('click', () => {
      el('p-rows').innerHTML = ownParcels.map((p) => S.plantedRow(S.cropOf(p.cropId), p.plantedMonth)).join('');
      el('p-edit').showModal();
    });
    S.bindPlanted(el('p-form'));
    el('g-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const { rows, error } = S.readGathered(el('g-form'));
      if (error) { el('g-err').textContent = error; el('g-err').hidden = false; return; }
      state.gathered = [...state.gathered.filter((g) => !rows.some((r) => r.cropId === g.cropId)), ...S.onlyFilled(rows)];
      save(inBox('g-err'));
    });
    el('p-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const sown = S.readPlanted(el('p-form'));
      h.parcels = h.parcels.map((x) => {
        if (!(x.cropId in sown)) return x;
        const { plantedMonth, ...p } = x;
        return sown[p.cropId] ? { ...p, plantedMonth: sown[p.cropId] } : p;
      });
      save(inBox('p-err'));
    });
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
    if (location.hash === '#strans') { history.replaceState(null, '', location.pathname); openGathered(); }
  }

  /* ---- Noting a sale, an expense or an APIA payment ---- */
  let kind = 'sale';
  const options = (rows) => rows.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
  function renderForm() {
    document.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.kind === kind));
    el('what-label').textContent = { sale: 'Cultura', expense: 'Pe ce' }[kind];
    el('what').innerHTML = options(kind === 'sale' ? ownParcels.map((p) => [p.cropId, cropName(p.cropId)]) : CATEGORIES);
    el('what-box').hidden = kind === 'sale' && !!cropId; // A crop's own sale can't be for anything else.
    el('for-box').hidden = kind !== 'expense';
  }
  /* With the form on show the notes sit right under it, so only a page without it needs the heading. */
  el('log-title').hidden = isOpen && started;
  if (!isOpen) {
    el('add').hidden = true;
  } else if (!started) {
    el('add').hidden = true;
    el('no-add').hidden = false;
    el('no-add').textContent = `Poți nota pentru ${project} din ${date(firstDay, true)}. Până atunci e doar un plan.`;
  } else {
    el('for').innerHTML = options([['', 'Toată ferma'], ...h.parcels.map((p) => [p.cropId, cropName(p.cropId)])]);
    el('for').value = cropId ?? '';
    el('kinds').innerHTML = KINDS.map(([k, label]) => `<button type="button" class="chip" data-kind="${k}">${label}</button>`).join('');
    el('date').value = TODAY; el('date').min = firstDay; el('date').max = TODAY;
    el('paper').innerHTML = Papers.button('Fă o poză la factură', 'login.html?next=recolte.html');
    renderForm();
  }
  el('kinds').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (b) { kind = b.dataset.kind; renderForm(); } });

  /* ---- A photo of a paper fills the form. "Salvează" stays the farmer's confirmation. ---- */
  function fillFromPaper(r) {
    kind = r.kind === 'sale_paper' ? 'sale' : 'expense';
    renderForm();
    el('err').hidden = true;
    const unread = [];
    el('amount').value = r.amountBani ? group(Math.round(r.amountBani / 100)) : '';
    if (!r.amountBani) unread.push('suma');
    if (r.date && r.date >= firstDay && r.date <= TODAY) el('date').value = r.date;
    else unread.push('data');
    const pick = kind === 'sale' ? r.cropId : r.category;
    if (pick && [...el('what').options].some((o) => o.value === pick)) el('what').value = pick;
    else unread.push(kind === 'sale' ? 'cultura' : 'pe ce s-a cheltuit');
    el('paper-note').textContent = unread.length ? `Am completat ce am putut. Verifică ${unread.join(', ')}, apoi apasă Salvează.` : 'Am completat de pe hârtie. Verifică și apasă Salvează.';
    el('paper-note').hidden = false;
  }
  el('paper').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-paper]')) return;
    const reading = await Papers.pick({ accepts: ['invoice', 'sale_paper'] });
    if (reading) fillFromPaper(reading);
  });

  function fail(text) { el('err').textContent = text; el('err').hidden = false; }
  /* The server already has the whole document, so only this one change needs sending. */
  async function sendRecord(action) {
    if (sending) return;
    sending = true;
    try {
      await CC.send(action);
      location.reload();
    } catch (e) {
      sending = false;
      fail(H.failText(e));
    }
  }
  el('record').addEventListener('submit', (e) => {
    e.preventDefault();
    const lei = num(el('amount').value), day = el('date').value, what = el('what').value;
    if (!Number.isInteger(lei) || lei <= 0) return fail(`Scrie suma în lei întregi, de exemplu ${group(12500)}.`);
    if (!day || day < firstDay || day > TODAY) return fail(`Alege o zi între ${date(firstDay, true)} și azi.`);
    const forCrop = el('for').value ? { cropId: el('for').value } : {};
    if (CC.onServer) {
      const [name, input] = kind === 'sale'
        ? ['record_sale', { cropId: what, date: day, totalLei: lei, harvestYear: h.year }]
        : ['add_expense', { category: what, amountLei: lei, date: day, harvestYear: h.year, ...forCrop }];
      return sendRecord((Live) => Live.write(name, input));
    }
    const base = { id: `n${Date.now()}`, date: day };
    if (kind === 'sale') h.records.push({ ...base, kind: 'sale', cropId: what, amountBani: lei * 100 });
    if (kind === 'expense') h.records.push({ ...base, kind: 'expense', category: what, amountBani: -lei * 100, ...forCrop });
    save();
  });

  /* ---- What was noted ---- */
  const label = (r) => (r.kind === 'sale' ? `Vânzare: ${cropName(r.cropId)}` : r.kind === 'expense' ? CATEGORIES.find(([k]) => k === r.category)?.[1] ?? 'Cheltuială' : APIA.find(([k]) => k === r.kind)?.[1]);
  const recordSub = (r) => `${date(r.date, true)}${r.kind === 'expense' && r.cropId && !cropId ? `, ${cropName(r.cropId)}` : ''}`;
  const sorted = [...shownRecords].sort((a, b) => b.date.localeCompare(a.date));
  const LATEST = 5;
  let allRecords = false;
  const recordRow = (r) => `<div class="h-rec"><span>${esc(label(r))}<small>${recordSub(r)}</small></span><b>${r.amountBani < 0 ? '−' : '+'}${exact(Math.abs(r.amountBani))} lei</b>${isOpen && !r.fixed ? `<button type="button" data-undo-record="${esc(r.id)}" aria-label="Șterge ${esc(label(r))}">Șterge</button>` : '<i></i>'}</div>`;
  function renderRecords() {
    const shown = allRecords ? sorted : sorted.slice(0, LATEST);
    const more = sorted.length > shown.length ? `<button type="button" class="h-quiet" data-all-records>Arată toate (${sorted.length})</button>` : '';
    el('records').innerHTML = sorted.length ? shown.map(recordRow).join('') + more : '<p class="h-none">Nimic notat încă.</p>';
  }
  renderRecords();
  el('records').addEventListener('click', (e) => {
    if (e.target.closest('[data-all-records]')) { allRecords = true; renderRecords(); return; }
    const b = e.target.closest('[data-undo-record]');
    if (!b) return;
    if (CC.onServer) return sendRecord((Live) => Live.write('undo_transaction', { id: b.dataset.undoRecord }));
    h.records = h.records.filter((r) => r.id !== b.dataset.undoRecord);
    save();
  });

  /* ---- Starting a harvest, or changing its crops ---- */
  const latest = [...state.items].sort((a, b) => b.year - a.year)[0];
  let editing = null; // null means a new harvest
  function cropRows(parcels) {
    const own = state.ownCrops.filter((o) => !crops.some((c) => c.id === o.id)).map((o) => ({ id: o.id, name_ro: o.name }));
    return [...crops, ...own].map((c) => {
      const p = parcels.find((x) => x.cropId === c.id);
      const name = ownOf(c.id)?.name ?? c.name_ro;
      const row = `<label class="ob-crop"><b>${esc(name)}</b><span class="ob-step"><input inputmode="decimal" data-crop="${c.id}" value="${haText(p?.areaHa ?? 0)}" aria-label="Hectare ${esc(name)}"></span></label>`;
      return CropEngine.isOwnCrop(c.id) ? `<div class="own-row">${row}<button type="button" class="h-quiet" data-own-edit="${esc(c.id)}">Schimbă cifrele</button></div>` : row;
    }).join('') + '<button type="button" class="btn btn-line own-add" data-own-new>Altă cultură</button>';
  }
  /* The hectares as typed so far, so adding a crop doesn't lose them. */
  const typedParcels = () => [...el('e-crops').querySelectorAll('[data-crop]')]
    .map((i) => ({ cropId: i.dataset.crop, areaHa: Math.round(num(i.value) * 100) / 100 || 0 }));
  function openEdit(target) {
    editing = target;
    const from = target ?? latest;
    el('e-title').textContent = target ? `Culturile din ${H.name(target)}` : `Începe Recolta ${latest.year + 1}`;
    el('e-crops').innerHTML = cropRows(from.parcels);
    el('e-open').value = group(Math.round((target ? target.openingBani : H.end(latest)) / 100));
    el('e-err').hidden = true;
    el('edit').showModal();
  }
  el('e-cancel').addEventListener('click', () => el('edit').close());
  el('edit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const parcels = [...el('e-crops').querySelectorAll('[data-crop]')]
      .map((i) => {
        const before = editing?.parcels.find((p) => p.cropId === i.dataset.crop);
        return { ...before, cropId: i.dataset.crop, areaHa: Math.round(parseFloat(i.value.replace(',', '.')) * 100) / 100 };
      })
      .filter((p) => p.areaHa > 0);
    const opening = num(el('e-open').value);
    const stop = (text) => { el('e-err').textContent = text; el('e-err').hidden = false; };
    if (!parcels.length) return stop('Scrie hectarele pentru cel puțin o cultură.');
    if (!Number.isInteger(opening) || opening < 0) return stop('Scrie banii în lei întregi.');
    const lost = editing?.parcels.find((p) => !parcels.some((q) => q.cropId === p.cropId) && editing.records.some((r) => r.cropId === p.cropId));
    if (lost) return stop(`${cropName(lost.cropId)} are lucruri notate. Șterge-le mai întâi.`);
    if (editing) {
      Object.assign(editing, { parcels, openingBani: opening * 100, summary: summary(parcels) });
    } else {
      const year = latest.year + 1, id = `r${year}`;
      state.items.push({ id, year, status: 'open', parcels, openingBani: opening * 100, summary: summary(parcels), records: [] });
      state.selected = id;
      state.crop = null;
    }
    save(inBox('e-err'));
    if (!CC.onServer) el('edit').close();
  });

  /* ---- A crop of the farmer's own (P30) ---- */
  const MONTH_WORDS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const monthOptions = '<option value="">Alege luna</option>' + MONTH_WORDS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  el('o-sow').innerHTML = monthOptions;
  el('o-harvest').innerHTML = monthOptions;
  const plain = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const decimalOrNull = (text) => {
    const t = text.trim().replace(',', '.');
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  };
  const leiOrNull = (text) => (text.trim() === '' ? 0 : /^[\d.\s]+$/.test(text.trim()) ? Number(text.replace(/\D/g, '')) : null);
  const typedDecimal = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  let ownEditing = null; // null means a new crop
  function openOwn(id) {
    const c = id ? ownOf(id) : null;
    ownEditing = c;
    el('o-title').textContent = c ? c.name : 'Altă cultură';
    el('o-ha-field').hidden = !!c;
    el('o-name').value = c?.name ?? '';
    el('o-ha').value = '';
    el('o-sow').value = c ? String(c.sowingMonth) : '';
    el('o-harvest').value = c ? String(c.harvestMonth) : '';
    el('o-yield').value = typedDecimal(c?.yieldTPerHa);
    el('o-bad').value = typedDecimal(c?.badYieldTPerHa);
    el('o-price').value = typedDecimal(c?.priceLeiPerKg);
    el('o-c-sow').value = c ? group(c.costs.sowingLeiPerHa) : '';
    el('o-c-care').value = c ? group(c.costs.careLeiPerHa) : '';
    el('o-c-harvest').value = c ? group(c.costs.harvestLeiPerHa) : '';
    el('o-err').hidden = true;
    el('own').showModal();
  }
  function newOwnId(name) {
    const slug = plain(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'cultura';
    return `own-${slug}-${Date.now().toString(36)}`;
  }
  el('e-crops').addEventListener('click', (e) => {
    if (e.target.closest('[data-own-new]')) openOwn(null);
    const b = e.target.closest('[data-own-edit]');
    if (b) openOwn(b.dataset.ownEdit);
  });
  el('o-cancel').addEventListener('click', () => el('own').close());
  el('own-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const stop = (text) => { el('o-err').textContent = text; el('o-err').hidden = false; };
    const name = el('o-name').value.trim().replace(/\s+/g, ' ');
    const ha = Math.round(num(el('o-ha').value) * 100) / 100;
    const sow = +el('o-sow').value, harvest = +el('o-harvest').value;
    const yieldT = decimalOrNull(el('o-yield').value);
    const badText = el('o-bad').value.trim();
    const bad = badText === '' ? null : decimalOrNull(badText);
    const price = decimalOrNull(el('o-price').value);
    const costs = { sowingLeiPerHa: leiOrNull(el('o-c-sow').value), careLeiPerHa: leiOrNull(el('o-c-care').value), harvestLeiPerHa: leiOrNull(el('o-c-harvest').value) };
    const taken = [...crops.map((c) => c.name_ro), ...state.ownCrops.filter((c) => c.id !== ownEditing?.id).map((c) => c.name)].some((n) => plain(n) === plain(name));
    if (!name) return stop('Scrie numele culturii.');
    if (taken) return stop(`${name} e deja în listă.`);
    if (!ownEditing && !(ha > 0)) return stop('Scrie câte hectare are.');
    if (!sow || !harvest) return stop('Alege luna semănatului și luna recoltei.');
    if (sow === harvest) return stop('Recolta trebuie să fie în altă lună decât semănatul.');
    if (!(yieldT > 0)) return stop('Scrie câte tone scoți la hectar într-un an normal, de exemplu 4,5.');
    if (badText !== '' && !(bad > 0 && bad <= yieldT)) return stop('Anul slab dă cel mult cât anul normal. Lasă gol dacă nu știi.');
    if (!(price > 0)) return stop('Scrie prețul pe kilogram, de exemplu 0,9.');
    if (Object.values(costs).some((v) => v === null)) return stop('Scrie cheltuielile în lei întregi, sau 0.');
    if (!ownEditing && state.ownCrops.length >= 20) return stop('Poți adăuga cel mult 20 de culturi.');
    const crop = { id: ownEditing?.id ?? newOwnId(name), name, yieldTPerHa: yieldT, badYieldTPerHa: bad, priceLeiPerKg: price, costs, sowingMonth: sow, harvestMonth: harvest };
    if (!CropEngine.OwnCropSchema.safeParse(crop).success) return stop('Verifică cifrele.');
    const parcels = typedParcels();
    state.ownCrops = [...state.ownCrops.filter((c) => c.id !== crop.id), crop];
    el('e-crops').innerHTML = cropRows(ownEditing ? parcels : [...parcels, { cropId: crop.id, areaHa: ha }]);
    el('own').close();
  });

  /* ---- Closing and reopening ---- */
  function ask(title, text, yes, run) {
    el('q-title').textContent = title; el('q-text').textContent = text; el('q-yes').textContent = yes;
    el('q-yes').onclick = run;
    el('confirm').showModal();
  }
  el('q-no').addEventListener('click', () => el('confirm').close());
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#a-edit, #a-close, #a-reopen');
    if (!b) return;
    if (b.id === 'a-edit') openEdit(h);
    if (b.id === 'a-close') {
      ask(`Încheie ${project}?`, 'Păstrăm planul și ce ai notat. Poți redeschide oricând.', 'Încheie', () => { H.close(h, cropId); save(inBox('q-text')); });
    }
    if (b.id === 'a-reopen') ask(`Redeschide ${project}?`, 'Vei putea nota din nou.', 'Redeschide', () => { H.reopen(h, cropId); save(inBox('q-text')); });
  });

  /* The switcher links here, and on this page a link only changes the hash. */
  function route() {
    if (location.hash !== '#nou' && location.hash !== '#cultura') return;
    const target = location.hash === '#nou' ? null : h;
    history.replaceState(null, '', location.pathname);
    document.querySelector('dialog.h-sheet[open]')?.close();
    openEdit(target);
  }
  addEventListener('hashchange', route);
  route();
})();
