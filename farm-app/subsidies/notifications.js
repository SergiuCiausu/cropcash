/* In-app notifications: CC.notify() shows a toast, and the bell opens a demo panel with one button per message.
   Messages are built from the farm's own plan, so this works offline. Web Push and the server jobs are step 9f.
   Toasts aren't saved yet: the "Mesaje" card can take the same { kind, tone, title, body, action } object.
   Loads its own CSS and resolves links from this script's folder, because Acasă lives in another folder. */
(function () {
  const { TODAY, esc, exact, date, daysLeft, zile, icon } = CC;
  const BASE = new URL('.', document.currentScript.src);
  const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const monthWord = (key) => MONTHS[+key.split('-')[1] - 1];
  const page = (href) => new URL(href, BASE).href;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = page('notifications.css');
  document.head.append(css);

  /* ---- Toaster ---- */
  const VISIBLE = 3, LIFE = 8000, LEAVE = 200;
  const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.500 7 2.500 7h-17S6 15 6 9Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>'.replace('.500', '.5').replace('.500', '.5');
  const TONE_ICON = { info: 'cal', good: 'down', warn: 'shield', urgent: 'shield' };

  const box = document.createElement('section');
  box.className = 'ntf-box';
  box.setAttribute('aria-label', 'Notificări');
  const polite = document.createElement('div');
  const loud = document.createElement('div');
  polite.className = loud.className = 'ntf-sr';
  polite.setAttribute('role', 'status');
  loud.setAttribute('role', 'alert');
  document.body.append(box, polite, loud);

  const waiting = [];
  const showing = () => box.querySelectorAll('.ntf:not(.leaving)').length;

  function close(item) {
    if (item.classList.contains('leaving')) return;
    clearTimeout(item.timer);
    item.classList.add('leaving');
    item.classList.remove('in');
    setTimeout(() => { item.remove(); drain(); }, LEAVE);
  }

  /* The timer pauses while the farmer reads or tabs through the toast. */
  function timed(item) {
    let left = LIFE, began = 0;
    const run = () => { began = Date.now(); item.timer = setTimeout(() => close(item), left); };
    const hold = () => { clearTimeout(item.timer); left = Math.max(1500, left - (Date.now() - began)); };
    item.addEventListener('pointerenter', hold);
    item.addEventListener('pointerleave', run);
    item.addEventListener('focusin', hold);
    item.addEventListener('focusout', run);
    run();
  }

  function show(n) {
    const item = document.createElement('article');
    item.className = `ntf ${n.tone}`;
    item.dataset.kind = n.kind;
    item.innerHTML = `<span class="ntf-ic">${icon(TONE_ICON[n.tone])}</span>
      <div class="ntf-text"><b>${esc(n.title)}</b>${n.body ? `<p>${esc(n.body)}</p>` : ''}${n.action ? `<a href="${esc(n.action.href)}">${esc(n.action.label)}</a>` : ''}</div>
      <button type="button" class="ntf-x" aria-label="Închide">${X}</button>`;
    item.querySelector('.ntf-x').addEventListener('click', () => close(item));
    box.prepend(item);
    (n.tone === 'urgent' ? loud : polite).textContent = `${n.title}. ${n.body ?? ''}`;
    requestAnimationFrame(() => requestAnimationFrame(() => item.classList.add('in')));
    if (n.tone !== 'urgent') timed(item);
  }

  function drain() {
    while (waiting.length && showing() < VISIBLE) show(waiting.shift());
  }
  function notify(n) { waiting.push({ tone: 'info', ...n }); drain(); }

  /* ---- Messages, from the plan ----
     A finished harvest has no plan to read, so messages that need one say so in the panel. */
  function readPlan() {
    try { return CC.farmPlan(); } catch (e) { return null; }
  }
  const plan = readPlan();

  /* Same id as calendar.js, so a task ticked there isn't reminded here. */
  const doneTasks = () => CC.doneTasks();

  function deadlines() {
    const done = doneTasks();
    const titles = new Map(CC.data().calendar.events.map((e) => [e.id, e.title_ro]));
    const fromPlan = plan.timelines.medium.months.flatMap((m) => m.entries)
      .filter((e) => e.kind === 'deadline' && !done.has(`${e.eventId}:${(e.window?.end ?? e.date).slice(0, 4)}`))
      .map((e) => ({ title: titles.get(e.eventId), date: e.date }));
    const fromCalls = CC.followedCalls().filter((c) => c.deadline).map((c) => ({ title: CC.callName(c), date: c.deadline }));
    return [...fromPlan, ...fromCalls].filter((d) => d.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date));
  }

  function weekly() {
    const week = (e) => e.date >= TODAY && daysLeft(e.date) <= 7;
    const entries = plan.timelines.medium.months.flatMap((m) => m.entries).filter((e) => e.kind.startsWith('apia') && e.value && week(e));
    const dates = deadlines();
    const due = dates.filter((d) => daysLeft(d.date) <= 7).length;
    const coming = entries.reduce((sum, e) => sum + e.value, 0);
    const action = { label: 'Vezi calendarul', href: page('calendar.html') };
    if (!due && !coming) {
      const next = dates[0];
      return { tone: 'info', title: 'Săptămâna asta n-ai nimic de făcut', body: next ? `Urmează pe ${date(next.date)}: ${next.title}.` : '', action };
    }
    const parts = [due ? `${due === 1 ? 'un termen' : `${due} termene`}` : '', coming ? `intră ${exact(coming)} lei` : ''].filter(Boolean);
    return { tone: 'info', title: `Săptămâna asta: ${parts.join(', ')}`, body: dates[0] && daysLeft(dates[0].date) <= 7 ? `${dates[0].title}, pe ${date(dates[0].date)}.` : '', action };
  }

  function spring() {
    const { spring: s, timelines } = plan;
    const low = timelines.medium.lowest;
    const action = { label: 'Vezi prognoza', href: page('prognoza.html') };
    if (!s.firstMonth) return { tone: 'info', title: 'Nu vezi luni grele în plan', body: 'Banii îți ajung tot anul.', action };
    const stretch = s.firstMonth === s.lastMonth ? `În ${monthWord(s.firstMonth)}` : `Din ${monthWord(s.firstMonth)} până în ${monthWord(s.lastMonth)}`;
    const end = low.balance < 0 ? `Îți lipsesc ${exact(-low.balance)} lei în ${monthWord(low.key)}.` : `Cel mai jos ajungi la ${exact(low.balance)} lei, în ${monthWord(low.key)}.`;
    return { tone: 'warn', title: 'Primăvara vine greu', body: `${stretch} ies ${exact(s.need)} lei. ${end}`, action };
  }

  function deadline() {
    const next = deadlines()[0];
    if (!next) return null;
    const d = daysLeft(next.date);
    return { tone: 'warn', title: d === 0 ? 'Termen azi' : `Mai ai ${zile(d)}`, body: `${next.title}, până pe ${date(next.date, true)}.`, action: { label: 'Vezi calendarul', href: page('calendar.html') } };
  }

  /* The salary a bad year allows, which is what the plan falls back to when a payment comes in low. */
  function salaryDown() {
    const lower = window.CropEngine.maxSafeSalary(plan.timelines.bad, plan.smoothing, CC.data()).salary;
    const before = plan.salary.salary;
    if (lower >= before) return null;
    const until = monthWord(plan.timelines.bad.lowest.key);
    const action = { label: 'Vezi salariul', href: page('salariu.html') };
    if (lower === 0) return { tone: 'urgent', title: 'Am oprit salariul deocamdată', body: `Cu mai puțini bani de la APIA, nu-ți ajung până în ${until}. Înainte era ${exact(before)} lei.`, action };
    return { tone: 'urgent', title: `Am scăzut salariul la ${exact(lower)} lei`, body: `Ca să-ți ajungă până în ${until}. Înainte era ${exact(before)} lei.`, action };
  }

  /* The newest real change on an official page. With none seen yet, there's no message. */
  function funding() {
    const c = CC.monitor.changes()[0];
    if (!c) return null;
    return { tone: 'info', title: 'Noutate de la o sursă urmărită', body: `${c.institution}: ${c.title}, pe ${date(c.date, true)}.`, action: { label: 'Vezi ce s-a schimbat', href: page('surse.html') } };
  }

  function money() {
    const e = plan.timelines.medium.months.flatMap((m) => m.entries).find((x) => x.kind === 'apia_advance' || x.kind === 'apia_balance');
    if (!e) return null;
    return { tone: 'good', title: `Au intrat ${exact(e.value)} lei de la APIA`, body: 'Îți propunem cum să-i împarți.', action: { label: 'Vezi salariul', href: page('salariu.html') } };
  }

  function payoutFailed() {
    return { tone: 'urgent', title: 'Plata salariului n-a mers', body: 'Verifică datele contului.', action: { label: 'Vezi salariul', href: page('salariu.html') } };
  }

  const MESSAGES = [
    ['weekly', 'Rezumatul de duminică', weekly, true],
    ['spring', 'Avertizarea de primăvară', spring, true],
    ['deadline', 'Termen aproape', deadline, true],
    ['salary', 'Salariu mai mic', salaryDown, true],
    ['funding', 'Noutate oficială', funding, false],
    ['money', 'Au intrat bani', money, true],
    ['payout', 'Plată eșuată', payoutFailed, false],
  ];
  const TONE_WORD = { info: 'Informare', good: 'Veste bună', warn: 'Atenție', urgent: 'Rămâne până o închizi' };

  function send(kind) {
    const [, , build] = MESSAGES.find(([k]) => k === kind);
    const n = build();
    if (n) notify({ kind, ...n });
  }

  /* ---- Demo panel ---- */
  const usable = MESSAGES.map(([kind, name, build, needsPlan]) => {
    if (needsPlan && !plan) return { kind, name, sub: 'Alege o recoltă deschisă.', ok: false };
    let n = null;
    try { n = build(); } catch (e) { console.error(e); }
    return n ? { kind, name, sub: TONE_WORD[n.tone], ok: true } : { kind, name, sub: 'Nimic de trimis acum.', ok: false };
  });

  /* One bell in the phone header and one in the rail: only one is ever visible, and neither covers the page. */
  const makeBell = () => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ntf-bell';
    b.setAttribute('aria-label', 'Probează notificările');
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', 'ntf-panel');
    b.innerHTML = `${BELL}<span>Notificări</span>`;
    b.addEventListener('click', () => toggle(panel.hidden));
    return b;
  };
  const bells = [];
  const top = document.querySelector('.m-top');
  if (top) { const b = makeBell(); top.lastElementChild.before(b); bells.push(b); }
  const rail = document.querySelector('.rail');
  if (rail) { const b = makeBell(); (rail.querySelector('.h-chip') ?? rail.querySelector('.farm')).before(b); bells.push(b); }
  const backToBell = () => bells.find((b) => b.offsetParent)?.focus();

  const panel = document.createElement('section');
  panel.className = 'ntf-panel';
  panel.id = 'ntf-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Probează notificările');
  panel.innerHTML = `<div class="ntf-head"><h2>Probează notificările</h2><button type="button" class="ntf-x" data-ntf-close aria-label="Închide">${X}</button></div>
    <ul>${usable.map((m) => `<li><span><b>${esc(m.name)}</b><small>${esc(m.sub)}</small></span><button type="button" class="ntf-send" data-ntf="${m.kind}"${m.ok ? '' : ' disabled'}>Trimite</button></li>`).join('')}</ul>
    <button type="button" class="ntf-all" data-ntf-all${usable.some((m) => m.ok) ? '' : ' disabled'}>Trimite toate</button>`;
  document.body.append(panel);

  function toggle(open) {
    panel.hidden = !open;
    bells.forEach((b) => b.setAttribute('aria-expanded', String(open)));
  }

  /* On a phone the toasts would cover the panel, so it steps aside. */
  function afterSend() {
    if (matchMedia('(max-width: 760px), (max-height: 500px)').matches) { toggle(false); backToBell(); }
  }

  panel.addEventListener('click', (e) => {
    const one = e.target.closest('[data-ntf]');
    if (one) { send(one.dataset.ntf); afterSend(); return; }
    if (e.target.closest('[data-ntf-all]')) { usable.filter((m) => m.ok).forEach((m) => send(m.kind)); afterSend(); return; }
    if (e.target.closest('[data-ntf-close]')) { toggle(false); backToBell(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden && !document.querySelector('dialog[open]')) { toggle(false); backToBell(); }
  });

  CC.notify = notify;
})();
