/* Ported from farm-app by web/scripts/port-legacy.mjs. Edit farm-app, or edit here and stop re-running the port. */
/* eslint-disable */
// @ts-nocheck
export default function install() {
/* "Calendar": month grid, list_upcoming, get_event, list_tasks, complete_task, reopen_task, plus followed calls.
   Money, work and official dates come from buildFarmPlan, so this page shows what the plan shows.
   Finished tasks go to the server on a real farm, and stay in this browser when signed out. */
(function () {
  const { FARM, TODAY, esc, about, exact, date, daysLeft, zile, icon, verify, chevron } = CC;
  CC.start();
  if (CC.closedView()) return;

  const el = (id) => document.getElementById(id);
  const data = CC.data();
  const MONTH_NAMES = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
  const MONTH_SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
  const monthName = (key) => { const [y, m] = key.split('-'); return `${MONTH_NAMES[+m - 1]} ${y}`; };
  const monthShort = (key) => MONTH_SHORT[+key.split('-')[1] - 1];
  const signed = (bani) => `${bani < 0 ? '−' : ''}${exact(Math.abs(bani))} lei`;

  const plan = CC.farmPlan();
  const timeline = plan.timelines.medium;
  const months = CC.crop ? CC.crop.months(timeline) : timeline.months;

  /* ---- Finished tasks ---- */
  const STORE = 'cropcash-done';
  const done = CC.doneTasks();
  /* Local for a signed-out farm. On a real farm it's marked only once the server has it. */
  async function toggleDone(id) {
    const finish = !done.has(id);
    if (CC.onServer) await CC.send((Live) => Live.write(finish ? 'complete_task' : 'reopen_task', { id }));
    finish ? done.add(id) : done.delete(id);
    if (CC.onServer) return;
    try { localStorage.setItem(STORE, JSON.stringify([...done])); } catch (e) { /* stays for this visit */ }
  }

  /* ---- Plan entries become calendar items ---- */
  const events = new Map(data.calendar.events.map((e) => [e.id, e]));
  const crops = new Map(data.crops.crops.map((c) => [c.id, c]));
  /* Followed calls come from the same list as /oportunitati. Variants of one call count once. */
  function followedItems() {
    const seen = new Map();
    for (const c of CC.followedCalls()) {
      const name = CC.callName(c), id = `follow:${name}:${c.deadline}`;
      if (!seen.has(id)) seen.set(id, { id, kind: 'follow', title: name, date: c.deadline, month: c.deadline ? c.deadline.slice(0, 7) : null, window: null, amount: null, value: 0, direction: 'none', estimated: false, unverified: false, event: null, sub: c.deadline ? `Până pe ${date(c.deadline)}, apel urmărit` : 'Fără termen, apel urmărit', icon: 'sprout', tone: 'b', task: false, follow: true, exactDay: !!c.deadline, url: c.url, keys: [] });
      seen.get(id).keys.push(c.key);
      seen.get(id).budgets = [...(seen.get(id).budgets ?? []), c.budgetEur];
    }
    return [...seen.values()].filter((i) => !i.date || i.date >= TODAY);
  }

  function allItems() {
    const list = months.flatMap((m) => m.entries.map((e) => CC.planItem(e, m.key)));
    return [...list, ...(CC.crop ? [] : followedItems())].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  }
  let items = allItems();
  const byId = () => new Map(items.map((i) => [i.id, i]));
  const isDone = (i) => i.task && done.has(i.id);

  /* ---- Rows ---- */
  function right(i) {
    if (i.direction !== 'none') {
      const money = exact(i.value);
      return `<span class="c-amt ${i.direction === 'in' ? 'pos' : ''}">${i.direction === 'in' ? '+' : '−'}${money} lei</span>`;
    }
    if (!i.date) return '';
    const d = daysLeft(i.date);
    return `<span class="c-amt${d <= 14 ? ' soon' : ''}">${d >= 0 && d < 60 ? `${d === 0 ? 'Azi' : `În ${zile(d)}`}` : date(i.date)}</span>`;
  }
  const row = (i) => `<button type="button" class="crow${isDone(i) ? ' is-done' : ''}" data-item="${esc(i.id)}">
      <span class="ti ${i.tone}">${icon(i.icon)}</span>
      <span class="r-main"><b>${esc(i.title)}${i.unverified ? ` ${verify}` : ''}</b><small>${esc(i.sub)}</small></span>
      ${right(i)}
    </button>`;

  /* ---- Month grid: Monday first, only the 12 plan months ----
     Only items with a real day sit on a day. Anything known just by month stays under the grid,
     so the grid never shows a date we don't have. */
  const WEEKDAYS = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  const calKeys = months.map((m) => m.key);
  const hasToday = calKeys.includes(TODAY.slice(0, 7));
  let calMonth = hasToday ? TODAY.slice(0, 7) : calKeys[0];
  let calDay = null;

  const pad = (n) => String(n).padStart(2, '0');
  const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
  const longDate = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTH_NAMES[m - 1].toLowerCase()}`; };
  const weekday = (iso) => { const [y, m, d] = iso.split('-').map(Number); return WEEKDAYS[utc(y, m, d).getUTCDay()]; };
  const shade = (i) => (i.direction === 'in' ? 'in' : i.direction === 'out' ? 'out' : 'task');
  const chipText = (i) => (i.direction === 'none' ? i.title : `${i.direction === 'in' ? '+' : '−'}${exact(i.value)}`);
  const count = (n) => (n === 1 ? 'un lucru' : `${n} lucruri`);

  function monthItems(key) {
    const shown = items; // The filters belong to the list below, so the grid always shows everything.
    const onDay = new Map();
    for (const i of shown) {
      if (!i.exactDay || !i.date || i.date.slice(0, 7) !== key) continue;
      if (!onDay.has(i.date)) onDay.set(i.date, []);
      onDay.get(i.date).push(i);
    }
    const loose = shown.filter((i) => !i.exactDay && i.month === key);
    /* APIA pays on some day of a window. The plan counts the last day; the other months only get a note, with no sum. */
    const open = shown.filter((i) => (i.kind === 'apia_advance' || i.kind === 'apia_balance') && i.date.slice(0, 7) !== key && i.window.start.slice(0, 7) <= key && key <= i.window.end.slice(0, 7));
    return { onDay, loose, open };
  }

  /* Keeps the picked day while it still has something on it. */
  function pickDay(onDay) {
    if (calDay && onDay.has(calDay)) return calDay;
    if (onDay.has(TODAY)) return TODAY;
    const days = [...onDay.keys()].sort();
    return days.find((d) => d >= TODAY) ?? days[0] ?? null;
  }

  function dayCell(iso, list) {
    const day = +iso.slice(8);
    const cls = `cal-cell${iso < TODAY ? ' past' : ''}${iso === TODAY ? ' today' : ''}`;
    const num = `<span class="cal-num">${day}</span>`;
    if (!list) return `<div class="${cls}">${num}</div>`;
    const chips = list.slice(0, 2).map((i) => `<span class="cal-chip ${shade(i)}${isDone(i) ? ' done' : ''}">${esc(chipText(i))}</span>`).join('');
    const more = list.length > 2 ? `<span class="cal-more">+${list.length - 2}</span>` : '';
    const dots = list.slice(0, 3).map((i) => `<i class="${shade(i)}${isDone(i) ? ' done' : ''}"></i>`).join('');
    const label = `${iso === TODAY ? 'Azi, ' : ''}${longDate(iso)}, ${count(list.length)}`;
    return `<button type="button" class="${cls} has" data-day="${iso}" aria-pressed="${iso === calDay}" aria-label="${label}">${num}<span class="cal-chips">${chips}${more}</span><span class="cal-dots">${dots}</span></button>`;
  }

  function renderCalendar() {
    const [y, m] = calMonth.split('-').map(Number);
    const info = months.find((x) => x.key === calMonth);
    const { onDay, loose, open } = monthItems(calMonth);
    calDay = pickDay(onDay);
    const lead = (utc(y, m, 1).getUTCDay() + 6) % 7;
    const total = utc(y, m + 1, 0).getUTCDate();
    const blanks = (n) => '<div class="cal-cell blank"></div>'.repeat(n);
    const cells = Array.from({ length: total }, (_, k) => { const iso = `${calMonth}-${pad(k + 1)}`; return dayCell(iso, onDay.get(iso)); });

    el('cal-title').textContent = monthName(calMonth);
    const at = calKeys.indexOf(calMonth);
    document.querySelector('[data-cal="prev"]').disabled = at === 0;
    document.querySelector('[data-cal="next"]').disabled = at === calKeys.length - 1;
    document.querySelector('[data-cal="today"]').hidden = !hasToday;

    const grid = el('cal-grid');
    grid.classList.toggle('hard', !!info.hard);
    grid.innerHTML = `${blanks(lead)}${cells.join('')}${blanks((7 - ((lead + total) % 7)) % 7)}`;

    el('cal-month').innerHTML = `${loose.length ? `<h3>În cursul lunii</h3><div class="rows">${loose.map(row).join('')}</div>` : ''}
      ${open.map((i) => `<button type="button" class="cal-open" data-item="${esc(i.id)}">Poate veni oricând luna asta: ${esc(i.title)}</button>`).join('')}`;

    const list = calDay ? onDay.get(calDay) : [];
    const warn = info.hard ? '<p class="m-warn">Lună grea: ies mulți bani și aproape nu intră nimic.</p>' : '';
    el('cal-day').innerHTML = warn + (calDay
      ? `<h3>${weekday(calDay)}, ${longDate(calDay)}${calDay === TODAY ? ' <span class="tag ok">Azi</span>' : ''}</h3><div class="rows">${list.map(row).join('')}</div>`
      : loose.length || open.length ? '' : '<p class="cal-none">Nimic planificat în luna asta.</p>');
  }

  function showMonth(key) { calMonth = key; calDay = null; renderCalendar(); }

  /* ---- Green card: the next dated thing in full, then three numbers ---- */
  function renderNext() {
    /* A later harvest starts in its own year, so today's deadlines don't lead its calendar. */
    const from = [TODAY, `${months[0].key}-01`].sort().pop();
    const next = items.find((i) => !isDone(i) && i.exactDay && i.date >= from);
    const soonTasks = items.filter((i) => (i.task || i.follow) && !isDone(i) && i.date && daysLeft(i.date) >= 0 && daysLeft(i.date) <= 30).length;
    const coming = months.reduce((sum, m) => sum + m.in, 0);
    const actions = next ? detailActions(next) : '';
    el('next').innerHTML = `<div class="v-main"><p class="eyebrow">Urmează</p>
        <h2>${next ? esc(next.title) : 'Nimic în următoarele 12 luni.'}</h2>
        ${next ? detailBody(next) : ''}
        ${actions ? `<div class="v-acts">${actions}</div>` : ''}</div>
      <dl class="v-row">
        <div><dd>${soonTasks}</dd><dt>${soonTasks === 1 ? 'termen' : 'termene'} în 30 de zile</dt></div>
        <div><dd>${exact(coming)} lei</dd><dt>de intrat în 12 luni</dt></div>
        ${CC.crop ? `<div><dd>${exact(months.reduce((sum, m) => sum + m.out, 0))} lei</dd><dt>de ieșit în 12 luni</dt></div>` : `<div><dd>${signed(timeline.lowest.balance)}</dd><dt>cel mai jos, în ${monthShort(timeline.lowest.key)}</dt></div>`}
      </dl>`;
  }

  /* ---- Views ---- */
  const VIEWS = [['all', 'Tot'], ['money', 'Bani'], ['todo', 'De făcut'], ['work', 'Lucrări']];
  const FILTER = {
    all: () => true,
    money: (i) => i.direction !== 'none',
    todo: (i) => i.task || i.follow,
    work: (i) => i.kind === 'input_cost',
  };
  let view = 'all';
  el('vtabs').innerHTML = VIEWS.map(([v, label]) => `<button type="button" class="chip" data-view-tab="${v}">${label}<span class="n"></span></button>`).join('');

  function monthBlock(m, list, showEmpty, first) {
    if (!list.length && !showEmpty) return '';
    const head = `<h2>${monthName(m.key)}</h2>`;
    if (!list.length) return `<section class="month none" id="m-${m.key}">${head}<p>Nimic planificat</p></section>`;
    const sums = `<p class="m-sum">${m.in ? `<span>Intră ${exact(m.in)} lei</span>` : ''}${m.out ? `<span>Ies ${exact(m.out)} lei</span>` : ''}${CC.crop ? '' : `<span><b>Rămân ${signed(m.balanceEnd)}</b></span>`}</p>`;
    return `<section class="month${m.hard ? ' hard' : ''}" id="m-${m.key}"><header class="m-h">${head}${sums}</header>
      ${first ? '<p class="m-warn">Luni grele: ies mulți bani și aproape nu intră nimic.</p>' : ''}
      <div class="rows">${list.map(row).join('')}</div></section>`;
  }

  function render() {
    items = allItems();
    const open = items.filter((i) => !isDone(i));
    document.querySelectorAll('[data-view-tab]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.viewTab === view);
      b.querySelector('.n').textContent = open.filter(FILTER[b.dataset.viewTab]).length;
    });
    const shown = open.filter(FILTER[view]);
    let warned = false;
    const html = months.map((m) => {
      const list = shown.filter((i) => i.month === m.key);
      const first = m.hard && !warned && list.length > 0;
      if (first) warned = true;
      return monthBlock(m, list, view === 'all', first);
    }).join('');
    const last = months[months.length - 1].key;
    const later = shown.filter((i) => !i.month || i.month > last);
    el('list').innerHTML = `${html}${later.length ? `<section class="month"><header class="m-h"><h2>Mai târziu</h2></header><div class="rows">${later.map(row).join('')}</div></section>` : ''}
      ${shown.length ? '' : '<p class="empty">Nimic de făcut acum.</p>'}`;
    const finished = items.filter(isDone);
    el('done').innerHTML = finished.length ? `<details class="group acc"><summary><span><span class="g-t">Făcute <span class="n">${finished.length}</span></span></span><span class="cue"><span class="show">Arată</span><span class="hide">Ascunde</span>${chevron}</span></summary><div class="rows">${finished.map(row).join('')}</div></details>` : '';
    renderNext();
    renderCalendar();
  }

  /* ---- Detail ---- */
  function explain(i) {
    if (i.kind === 'apia_balance') return `Vine între ${date(i.window.start)} și ${date(i.window.end, true)}. Nu știm exact luna. Noi am socotit că vine abia pe ${date(i.window.end)}, ca să fii acoperit.`;
    if (i.kind === 'apia_advance') return `Plățile se fac între ${date(i.window.start)} și ${date(i.window.end, true)}. Planul socotește cu ultima zi, ca să fii acoperit dacă banii vin târziu.`;
    if (i.kind === 'input_cost' || i.kind === 'crop_sale') return 'Suma și luna sunt estimate după culturile tale. Le poți schimba când ai cifrele tale.';
    if (i.follow) return 'Termenul vine de la sursa oficială.';
    if (i.estimated) return 'Termenul pentru anul viitor nu e anunțat. Am pus data de anul ăsta.';
    return '';
  }
  /* What an item says, on the green card and in the pop-up alike. */
  function detailBody(i) {
    const tile = (label, value, sub, cls) => `<div${cls ? ` class="${cls}"` : ''}><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const when = i.exactDay ? date(i.date, true) : i.month ? monthName(i.month) : 'Fără termen';
    const money = i.direction === 'none' ? '' : tile('Suma', `${exact(i.value)} lei`, i.amount && i.amount.min !== i.amount.max ? `între ${about(i.amount.min)} și ${about(i.amount.max)} lei` : '');
    /* Everything planned to arrive on that day. Left out when the item's own Suma already says it. */
    const entering = i.exactDay ? items.filter((x) => x.exactDay && x.date === i.date && x.direction === 'in') : [];
    const dayTotal = entering.reduce((sum, x) => sum + x.value, 0);
    const sameAsSuma = i.direction === 'in' && dayTotal === i.value;
    const dayMoney = i.exactDay && !sameAsSuma ? tile('Intră în ziua asta', `${exact(dayTotal)} lei`, dayTotal ? '' : 'nimic planificat') : '';
    /* The whole call's money, the same figure as on Oportunități, and not what this farm would get. */
    const budget = i.budgets?.every((b) => b != null) ? tile('Bani alocați', CC.eurShort(i.budgets.reduce((sum, b) => sum + b, 0)), 'pentru tot apelul') : '';
    const days = i.date && i.exactDay ? daysLeft(i.date) : -1;
    const left = days >= 0 ? `mai sunt ${zile(days)}` : '';
    /* Red means something to do, so money on its way stays black. */
    const urgent = (i.task || i.follow) && days >= 0 && days <= CC.data().params.opportunities_closing_soon_days.value;
    const source = i.event?.source_url;
    const notes = [explain(i), i.event?.note].filter(Boolean);
    return `<div class="key-facts">${tile('Când', when, left, urgent ? 'soon' : '')}${money}${budget}${dayMoney}</div>
      ${i.unverified ? `<p class="note gap">${verify} Verifică la instituție înainte să te bazezi pe această dată.</p>` : ''}
      ${notes.map((n) => `<p class="d-text">${esc(n)}</p>`).join('')}
      ${source ? `<p class="note gap"><a href="${esc(source)}" rel="noopener" target="_blank">Vezi sursa</a></p>` : ''}`;
  }
  function detailActions(i) {
    return `${i.task ? `<button type="button" class="btn btn-dark" data-done="${esc(i.id)}">${done.has(i.id) ? 'Nu am făcut încă' : 'Am făcut'}</button>` : ''}
      ${i.follow ? `<button type="button" class="btn btn-dark" data-unfollow="${esc(i.id)}"${CC.onServer ? ' data-needs-net="Pornește internetul ca să schimbi calendarul."' : ''}>Scoate din calendar</button><a class="btn btn-line" href="/oportunitati">Vezi oportunitățile</a>` : ''}`;
  }
  function openDetail(id) {
    const i = byId().get(id); if (!i) return;
    const box = el('detail');
    box.innerHTML = `<div class="top"><div><h2 id="d-title" tabindex="-1" autofocus>${esc(i.title)}</h2></div><button type="button" class="x" data-close aria-label="Închide">×</button></div>
      ${detailBody(i)}
      <div class="acts">
        ${detailActions(i)}
        ${i.task || i.follow ? '' : '<button type="button" class="btn btn-line" data-close>Închide</button>'}
        ${navigator.onLine || !(i.task || i.follow) ? '' : `<small>${CC.onServer ? 'Ai nevoie de internet ca să salvezi.' : 'Se trimite când ai internet.'}</small>`}
      </div>`;
    box.showModal();
  }

  /* ---- Events ---- */
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-view-tab]');
    if (tab) { view = tab.dataset.viewTab; render(); tab.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return; }
    const nav = e.target.closest('[data-cal]');
    if (nav) {
      if (nav.dataset.cal === 'today') showMonth(TODAY.slice(0, 7));
      else showMonth(calKeys[calKeys.indexOf(calMonth) + (nav.dataset.cal === 'next' ? 1 : -1)]);
      return;
    }
    const pick = e.target.closest('[data-day]');
    if (pick) { calDay = pick.dataset.day; renderCalendar(); el('cal-grid').querySelector(`[data-day="${calDay}"]`)?.focus(); return; }
    const toggle = e.target.closest('[data-done]');
    if (toggle) {
      if (toggle.disabled) return;
      toggle.disabled = true;
      toggleDone(toggle.dataset.done).then(() => { el('detail').close(); render(); }, (err) => {
        toggle.disabled = false;
        toggle.closest('dialog').querySelector('.send-failed')?.remove();
        toggle.insertAdjacentHTML('afterend', `<small class="send-failed" role="alert">${esc(CC.failText(err))}</small>`);
      });
      return;
    }
    const off = e.target.closest('[data-unfollow]');
    if (off) {
      const i = byId().get(off.dataset.unfollow);
      off.disabled = true;
      Promise.resolve(CC.unfollow(i.keys)).then(() => { el('detail').close(); items = allItems(); render(); }, (err) => {
        off.disabled = false;
        off.closest('.acts, div').insertAdjacentHTML('afterend', `<p class="ob-err" role="alert">${esc(navigator.onLine ? CC.failText(err) : 'Pornește internetul ca să schimbi calendarul.')}</p>`);
      });
      return;
    }
    const item = e.target.closest('[data-item]');
    if (item) { openDetail(item.dataset.item); return; }
    if (e.target.closest('[data-close]') || e.target === el('detail')) el('detail').close();
  });

  /* ---- What never changes on this page ---- */
  const rule = events.get('apia-modificari');
  el('remember').innerHTML = `<p class="eyebrow">Ține minte</p><p>${esc(rule.title_ro)}: ai ${rule.relative_days} zile de la schimbare.</p>`;
  el('foot').innerHTML = `Am pornit de la ${exact(FARM.startBalanceBani)} lei în cont${CC.isIon ? ', ca în exemplul lui Ion' : ''}. Sumele de aici nu scad salariul de ${exact(plan.salary.salary)} lei și pensia de ${exact(CC.pensionBani())} lei pe lună. Apelurile urmărite sunt exemple pentru demo ${demo}`;

  if (CC.crop) {
    document.querySelector('.page-h .lead').textContent = `Lucrările și banii pentru ${CC.crop.name.toLowerCase()}, pe un singur an.`;
    el('remember').hidden = true;
    el('foot').textContent = `Partea de la APIA e împărțită după hectare. Termenele APIA, banii din cont și oportunitățile sunt la ${CC.harvests.projectName(CC.harvests.selected)}.`;
  }

  render();

  window.__calendar = { plan, timeline, allItems, monthItems, calKeys };
})();

}
