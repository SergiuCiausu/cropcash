/* "Oportunități": search_opportunities, list_opportunity_changes, follow_opportunity, unfollow_opportunity.
   Signed in, the calls come from the monitor and a copy stays on the phone. Signed out, a dated snapshot.
   How a call fits the farm uses the same rules as match_opportunities, so it works for any farm offline.
   Conditions come only from docs/data/funding-guides.json, or the page says to check the guide. */
(function () {
  const { FARM, TODAY, esc, eurShort, date, daysLeft, zile, group, icon, chevron, VARIANT, callName: shortName, callCode: code, loadFollows } = CC;
  CC.start();

  const el = (id) => document.getElementById(id);
  const KIND = { afir: 'AFIR', mipe: 'Fonduri europene', ec: 'Comisia Europeană' };
  const CHANGE = { new: 'Apel nou', removed: 'A dispărut din listă înainte de termen', status: 'Și-a schimbat starea' };
  const EVENTS = CC.monitor.events();

  function variantLabel(c) {
    const m = c.title.match(/(Adulți|Tineri)\s*$/);
    if (m) return m[1];
    if (/regiunile mai dezvoltate\s*$/.test(c.title)) return 'Regiuni mai dezvoltate';
    return (c.region || 'Toată țara').replace('putin', 'puțin').replace('nationala', 'națională');
  }

  /* ---- How a call fits this farm: the shared rules, with each reason in plain words ---- */
  const CALLS = CC.monitor.calls();
  const fits = CropEngine.pageFits(CALLS, FARM, CC.data(), TODAY);
  const GOOD = { for_farmers: 'Fermierii pot depune direct', small_farms: 'E pentru ferme mici' };
  const DOUBT = {
    needs_company: 'Cere PFA sau firmă', firms_only: 'E pentru firme. Depinde de forma juridică și de activitate',
    institutions_only: 'E pentru instituții și autorități', partnership: 'Cere de obicei parteneri din mai multe țări',
    other_region: 'E pentru altă regiune', other_sector: 'E pentru alt fel de fermă', young_farmers: 'E pentru tinerii fermieri',
    check_who: 'Tema e agricolă, dar sursa nu spune cine poate depune', not_for_farms: 'Nu pare să fie pentru o fermă ca a ta',
    low_confidence: 'Datele despre acest apel sunt incomplete',
  };
  const RULED_OUT = ['age_limit', 'other_region', 'other_sector', 'partnership', 'institutions_only', 'not_for_farms'];
  const says = (r) => (r.code === 'age_limit' ? `Limita de vârstă e ${r.vars.limit} de ani` : r.code === 'closes_soon' ? `Mai sunt ${zile(r.vars.days)}` : GOOD[r.code] ?? DOUBT[r.code] ?? '');
  function fitOf(c) {
    const fit = fits[c.key];
    if (!fit) return { level: 'no', why: 'Apelul s-a închis.', good: [], doubts: [] };
    const first = fit.level === 'no' ? fit.doubts.find((d) => RULED_OUT.includes(d.code)) : fit.doubts[0] ?? fit.good[0];
    return { ...fit, why: first ? `${says(first)}.` : '' };
  }

  /* ---- Near-identical calls become one row. Each one stays visible in the detail. ---- */
  const merged = new Map();
  for (const c of CALLS) {
    const fit = fitOf(c);
    const id = `${c.title.replace(VARIANT, '')}|${c.deadline}|${fit.level}`;
    if (!merged.has(id)) merged.set(id, { key: c.key, name: shortName(c), deadline: c.deadline, status: c.status, kind: c.kind, fit, calls: [] });
    merged.get(id).calls.push(c);
  }
  const rows = [...merged.values()].sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9'));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const level = (l) => rows.filter((r) => r.fit.level === l);
  const near = level('near'), check = level('check'), firm = level('firm');
  const soon = rows.filter((r) => r.deadline && daysLeft(r.deadline) >= 0 && daysLeft(r.deadline) <= 30);

  /* ---- Following ---- */
  let follows = loadFollows();
  const followed = (r) => r.calls.some((c) => follows.has(c.key));
  async function toggleFollow(r) {
    const on = followed(r);
    await CC.setFollow(r.calls.map((c) => c.key).filter((k) => follows.has(k) === on), !on);
    follows = loadFollows();
  }

  /* ---- Small parts ---- */
  function deadline(iso) {
    if (!iso) return '<span class="dl"><small>Fără termen</small></span>';
    const d = daysLeft(iso), [y] = iso.split('-');
    const main = d === 0 ? 'Azi' : d === 1 ? 'Mâine' : d < 60 ? zile(d) : date(iso);
    const sub = d < 60 ? date(iso) : y;
    return `<span class="dl${d <= 14 ? ' soon' : ''}"><b>${main}</b><small>${sub}</small></span>`;
  }
  const MARK = { ok: ['Da', icon('check')], no: ['Nu', '×'], q: ['De verificat', '?'] };
  const checks = (items) => `<ul class="checks">${items.map(([kind, text]) => `<li><span class="mk ${kind}" role="img" aria-label="${MARK[kind][0]}">${MARK[kind][1]}</span>${esc(text)}</li>`).join('')}</ul>`;
  function checksFor(r) {
    const doubt = (d) => [RULED_OUT.includes(d.code) || d.code === 'needs_company' ? 'no' : 'q', says(d)];
    const list = [...r.fit.good.filter((g) => g.code !== 'closes_soon').map((g) => ['ok', says(g)]), ...r.fit.doubts.map(doubt)];
    return list.length ? list : [['q', r.fit.why]];
  }
  const calMark = (r) => (followed(r) ? `<span class="in-cal" role="img" aria-label="În calendar" title="În calendar">${icon('cal')}</span>` : '');
  /* The same facts everywhere: full cards where there's room, one quiet line in the list. A fact with no data just stays out. */
  function factsOf(r) {
    const c = r.calls[0];
    const money = r.calls.every((x) => x.budgetEur != null) ? eurShort(r.calls.reduce((sum, x) => sum + x.budgetEur, 0)) : null;
    return { deadline: c.deadline, days: c.deadline ? daysLeft(c.deadline) : null, money, filed: c.filed, filedEur: c.filedEur };
  }
  function keyFacts(r, showUrgent) {
    const f = factsOf(r);
    const tile = (label, value, sub, cls) => `<div${cls ? ` class="${cls}"` : ''}><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const left = f.days !== null && f.days >= 0;
    return `<div class="key-facts">
        ${tile('Termen', f.deadline ? date(f.deadline, true) : 'Nepublicat', left ? `mai sunt ${zile(f.days)}` : '', showUrgent && left && f.days <= 14 ? 'soon' : '')}
        ${f.money ? tile('Bani alocați', f.money) : ''}
        ${f.filed != null ? tile('Dosare depuse', group(f.filed), f.filedEur != null ? `în valoare de ${eurShort(f.filedEur)}, la ${date(CC.monitor.at())}` : '') : ''}
      </div>`;
  }
  const dosare = (n) => (n === 1 ? '1 dosar depus' : `${group(n)} ${n % 100 >= 20 || n % 100 === 0 ? 'de ' : ''}dosare depuse`);
  function factLine(r) {
    const f = factsOf(r);
    const parts = [f.money ? `${f.money} alocați` : '', f.filed != null ? dosare(f.filed) : ''].filter(Boolean);
    return parts.length ? `<small class="r-facts">${parts.join(' · ')}</small>` : '';
  }
  function row(r, showWhy) {
    return `<button type="button" class="row" data-key="${esc(r.key)}" title="${esc(r.calls[0].title)}">
      <span class="r-main"><b>${esc(r.name)}</b>${showWhy ? `<small>${esc(r.fit.why)}</small>` : ''}${factLine(r)}</span>
      <span class="r-side">${r.status === 'announced' ? '<span class="tag v">Anunțat</span>' : ''}${calMark(r)}</span>
      ${deadline(r.deadline)}
    </button>`;
  }
  let firmOpen = false;
  /* A reason shared by the whole group is said once, in its heading. */
  function section({ title, list, total = list.length, note, why = true, closed = false, id = '' }) {
    if (!list.length) return '';
    const same = why && list.every((r) => r.fit.why === list[0].fit.why);
    const body = `<div class="rows">${list.map((r) => row(r, why && !same)).join('')}</div>`;
    const lead = note || (same ? list[0].fit.why : '');
    const head = `<span class="g-t">${title} <span class="n">${total}</span></span>${lead ? `<span class="g-n">${esc(lead)}</span>` : ''}`;
    if (closed) return `<details class="group acc" id="${id}"${firmOpen ? ' open' : ''}><summary><span>${head}</span><span class="cue"><span class="show">Arată</span><span class="hide">Ascunde</span>${chevron}</span></summary>${body}</details>`;
    return `<section class="group"><h3 class="g-h">${head}</h3>${body}</section>`;
  }
  const empty = (text) => `<p class="empty">${text}</p>`;

  /* ---- Green card: the closest call ---- */
  /* Best fit first, then the earliest deadline (rows are already sorted by it). A closed call can't be the next step. */
  const stillOpen = (r) => !r.deadline || daysLeft(r.deadline) >= 0;
  function closestCall() {
    for (const group of [near, check, firm]) {
      const live = group.filter(stillOpen);
      if (live.length) return live.find((r) => r.deadline) ?? live[0];
    }
    return null;
  }
  const closest = closestCall();
  function whenChips(r) {
    if (!r.deadline) return '<li>Fără termen</li>';
    const d = daysLeft(r.deadline);
    return `<li>${d === 0 ? 'Azi' : d === 1 ? 'Mâine' : `În ${zile(d)}`}</li><li>${date(r.deadline, true)}</li>`;
  }
  /* The green card is the closest call and nothing else. With none open, the list below says so. */
  function renderVerdict() {
    el('verdict').hidden = !closest;
    if (!closest) return;
    el('verdict').innerHTML = `<div class="v-next"><p class="eyebrow">Cel mai aproape</p><h2>${esc(closest.name)}</h2><p>${esc(closest.fit.why)}</p>
      <div class="v-next-foot"><ul class="farm-strip">${whenChips(closest)}${followed(closest) ? '<li>În calendar</li>' : ''}</ul>
      <button type="button" class="see" data-key="${esc(closest.key)}">Vezi detalii ${icon('arrow')}</button></div></div>`;
  }

  /* ---- Views ---- */
  const counts = () => ({ fit: near.length + check.length + firm.length, soon: soon.length, new: EVENTS.length, mine: rows.filter(followed).length, all: rows.length });
  const VIEWS = [['fit', 'Pentru ferma ta'], ['soon', 'Se închid curând'], ['new', 'Ce e nou'], ['mine', 'În calendar'], ['all', 'Toate']];
  let view = 'fit', shown = 30, filtersOpen = false;
  el('vtabs').innerHTML = VIEWS.map(([v, label]) => `<button type="button" class="chip" data-view-tab="${v}">${label}<span class="n"></span></button>`).join('');

  const FILTERS = ['f-kind', 'f-status', 'f-days', 'f-eur'];
  const filterCount = () => FILTERS.filter((id) => el(id).value && el(id).value !== '0').length;
  function matches(r) {
    const text = el('f-text').value.trim().toLowerCase();
    const days = +el('f-days').value;
    const money = r.calls.reduce((sum, c) => sum + (c.budgetEur ?? 0), 0);
    return (!text || `${r.name} ${r.calls.map((c) => `${c.title} ${c.programme}`).join(' ')}`.toLowerCase().includes(text))
      && (!el('f-kind').value || r.kind === el('f-kind').value)
      && (!el('f-status').value || r.status === el('f-status').value)
      && (!days || (r.deadline && daysLeft(r.deadline) <= days))
      && (+el('f-eur').value === 0 || money >= +el('f-eur').value);
  }

  function render() {
    renderVerdict();
    const n = counts();
    document.querySelectorAll('[data-view-tab]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.viewTab === view);
      b.querySelector('.n').textContent = n[b.dataset.viewTab];
    });
    el('find').hidden = view !== 'all';
    el('filters').hidden = view !== 'all' || !filtersOpen;
    el('f-toggle').setAttribute('aria-expanded', filtersOpen);
    el('f-count').textContent = filterCount() || '';
    let html = '';
    if (view === 'fit') {
      /* The closest call is in the green card, so only the other close ones are listed here. */
      const otherNear = near.filter((r) => r !== closest && stillOpen(r));
      html = `${section({ title: 'Tot aproape', list: otherNear })}
        ${section({ title: 'De verificat', list: check })}
        ${section({ title: 'Doar dacă ai o firmă', list: firm, closed: true, id: 'firm-group' })}
        ${otherNear.length + check.length + firm.length ? '' : empty(closest ? 'Alte apeluri potrivite nu sunt acum.' : 'Nimic potrivit acum. Îți spunem când apare ceva.')}`;
    } else if (view === 'soon') {
      html = `${section({ title: 'În următoarele 7 zile', list: soon.filter((r) => daysLeft(r.deadline) <= 7) })}
        ${section({ title: 'În următoarele 30 de zile', list: soon.filter((r) => daysLeft(r.deadline) > 7) })}
        ${soon.length ? '' : empty('Nu se închide nimic în următoarele 30 de zile.')}`;
    } else if (view === 'new') {
      const items = EVENTS.map((e) => `<div class="reason"><b>${esc(shortName(e))}</b><small>${esc(CHANGE[e.field] ?? 'S-a schimbat')} · ${KIND[e.kind] || ''} · ${date(e.date, true)}</small></div>`).join('');
      html = `<section class="card">${items || empty('Nimic nou de la ultima verificare.')}</section>`;
    } else if (view === 'mine') {
      const list = rows.filter(followed);
      html = list.length ? `${section({ title: 'Urmărești', list, note: CC.onServer ? '' : 'Salvate doar în acest browser.', why: false })}<p class="note gap"><a href="calendar.html">Vezi calendarul</a></p>` : empty('N-ai pus niciun apel în calendar.');
    } else {
      const list = rows.filter(matches);
      html = `${list.length ? section({ title: 'Apeluri', list: list.slice(0, shown), total: list.length, why: false }) : empty('Nimic nu se potrivește cu ce ai ales.')}
        ${list.length > shown ? '<button type="button" class="btn btn-line more" id="more">Arată mai multe</button>' : ''}`;
    }
    el('list').innerHTML = html;
  }

  /* ---- Detail ---- */
  function openDetail(key) {
    const r = byKey.get(key); if (!r) return;
    const c = r.calls[0], guide = CC.data().fundingGuides.guides.find((g) => g.code === code(c));
    const fact = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
    const box = el('detail');
    box.innerHTML = `<div class="top"><div><h2 id="d-title" tabindex="-1" autofocus>${esc(r.name)}</h2>
        ${r.calls.length === 1 && c.title !== r.name ? `<p class="official">${esc(c.title)}</p>` : ''}</div>
        <button type="button" class="x" data-close aria-label="Închide">×</button></div>
      ${keyFacts(r, true)}
      <h3>Pentru ferma ta</h3>${checks(checksFor(r))}
      ${r.calls.length > 1 ? `<h3>Variante</h3><div class="variants">${r.calls.map((x) => `<a href="${esc(x.url)}" rel="noopener" target="_blank"><span>${esc(variantLabel(x))}</span><b>${eurShort(x.budgetEur) || ''}</b></a>`).join('')}</div>` : ''}
      ${guide ? `<details class="fold" open><summary>Din ghid${chevron}</summary><ul>${guide.facts.map((f) => `<li>${esc(f.text)} (pagina ${f.page})</li>`).join('')}</ul><p class="note"><a href="${esc(guide.url)}" rel="noopener" target="_blank">${esc(guide.title)}</a></p></details>` : ''}
      <details class="fold" open><summary>Alte detalii${chevron}</summary><dl class="facts">
        ${fact('Program', esc(c.programme))}
        ${fact('Instituția', KIND[c.kind])}
        ${fact('Stare', c.status === 'announced' ? 'Anunțat' : 'Deschis')}
        ${fact('Se deschide', c.openDate ? date(c.openDate, true) : '')}
        ${fact('Zona', r.calls.length === 1 ? esc(variantLabel(c)) : '')}
        ${fact('Cine poate depune', c.applicants ? esc(c.applicants) : 'Sursa nu spune. Verifică în ghid.')}
        ${c.confidence === 'low' ? fact('Atenție', 'Datele despre acest apel sunt incomplete.') : ''}
      </dl></details>
      <div class="acts"><button type="button" class="btn btn-dark" data-follow="${esc(r.key)}"${CC.onServer ? ' data-needs-net="Pornește internetul ca să schimbi calendarul."' : ''}>${followed(r) ? 'Scoate din calendar' : 'Pune în calendar'}</button>
        <a class="btn btn-line" href="${esc(c.url)}" rel="noopener" target="_blank">Vezi la sursă</a>
        <p class="ob-err" id="d-err" role="alert" hidden></p></div>`;
    box.showModal();
  }

  /* ---- Events ---- */
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-view-tab]');
    if (tab) { view = tab.dataset.viewTab; shown = 30; render(); tab.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return; }
    if (e.target.closest('#f-toggle')) { filtersOpen = !filtersOpen; render(); return; }
    if (e.target.closest('#more')) { shown += 30; render(); return; }
    const call = e.target.closest('[data-key]');
    if (call) { openDetail(call.dataset.key); return; }
    const follow = e.target.closest('[data-follow]');
    if (follow) {
      follow.disabled = true;
      toggleFollow(byKey.get(follow.dataset.follow)).then(() => { el('detail').close(); render(); }, (err) => {
        follow.disabled = false;
        el('d-err').textContent = navigator.onLine ? CC.failText(err) : 'Pornește internetul ca să schimbi calendarul.';
        el('d-err').hidden = false;
      });
      return;
    }
    if (e.target.closest('[data-close]') || e.target === el('detail')) el('detail').close();
  });
  document.addEventListener('toggle', (e) => { if (e.target.id === 'firm-group') firmOpen = e.target.open; }, true);
  const onFilter = () => { shown = 30; render(); };
  el('find').addEventListener('input', onFilter);
  el('filters').addEventListener('input', onFilter);

  el('foot').textContent = `Date din ${date(CC.monitor.at(), true)}${CC.monitor.fromServer ? '' : ', salvate în aplicație'}. E un prim filtru: verifică la instituție înainte să te bazezi pe el.`;
  render();

  window.__oportunitati = { rows, near, check, firm, soon };
})();
