/* eslint-disable */
// @ts-nocheck
export default function install() {
/* "Întreabă": the assistant sheet (docs/functions.md §14, plan steps 9c–9d). One button on every
   page opens it. Answers come from POST /api/assistant, which reads the farm through the registry.
   A save the assistant prepares arrives as a card with the exact values; only the farmer's tap sends
   it, through the same Live.write the app's own buttons use. The conversation stays in this tab
   (sessionStorage) and only its text goes to the server. Needs internet and a signed-in farm. */
(function () {
  if (!window.CC || document.querySelector('.ask-fab')) return;
  const { esc, exact, failText } = CC;
  const KEY = 'cropcash-assistant';
  const MAX_TURNS = 20;
  const NO_NET = 'Pornește internetul ca să întrebi.';
  const CATEGORIES = { seeds: 'Sămânță', fertilizer: 'Îngrășăminte', treatments: 'Tratamente', diesel: 'Motorină', field_work: 'Lucrări', repairs: 'Reparații', rent: 'Arendă', other: 'Altele' };
  const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const EXAMPLES = ['Cât pot să-mi iau salariu pe lună?', 'Pot să-mi iau o drujbă de 2.000 de lei în martie?', 'Am cheltuit azi 300 de lei pe motorină.', 'Ce termene am luna asta?'];

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('/assistant.css', location.href).href;
  document.head.append(css);

  /* ---- The conversation, kept for this tab only ---- */
  let turns = [];
  try { turns = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { turns = []; }
  const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-MAX_TURNS))); } catch (e) { /* private window */ } };

  /* ---- Plain text with **bold** and "- " lists, escaped first ---- */
  function rich(text) {
    const lines = esc(text).split('\n');
    let html = '', list = false;
    for (const raw of lines) {
      const line = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      const item = /^\s*[-•]\s+(.*)$/.exec(line);
      if (item) { if (!list) { html += '<ul>'; list = true; } html += `<li>${item[1]}</li>`; continue; }
      if (list) { html += '</ul>'; list = false; }
      if (line.trim()) html += `<p>${line}</p>`;
    }
    return html + (list ? '</ul>' : '');
  }

  /* ---- What a card says: the exact values that will be saved ---- */
  const lei = (n) => `${exact(Math.round(n * 100))} lei`;
  const day = (iso) => { const [y, m, d] = iso.split('-'); return `${+d} ${MONTHS[+m - 1]} ${y}`; };
  const month = (key) => { const [y, m] = key.split('-'); return `${MONTHS[+m - 1]} ${y}`; };
  const crop = (id) => (CC.harvests?.cropName ? CC.harvests.cropName(id) : id);
  function card(action) {
    const i = action.input || {};
    switch (action.function) {
      case 'add_expense':
        return { title: 'Notez o cheltuială', rows: [['Pe ce', CATEGORIES[i.category] || i.category], ['Suma', lei(i.amountLei)], ['Data', day(i.date)], ...(i.cropId ? [['Cultura', crop(i.cropId)]] : []), ...(i.note ? [['Notă', i.note]] : [])] };
      case 'record_sale':
        return { title: 'Notez o vânzare', rows: [['Cultura', crop(i.cropId)], ...(i.totalLei !== undefined ? [['Suma', lei(i.totalLei)]] : [['Cantitatea', `${String(i.tonnes).replace('.', ',')} tone`], ['Prețul', `${String(i.pricePerKgLei).replace('.', ',')} lei/kg`]]), ['Data', day(i.date)], ...(i.note ? [['Notă', i.note]] : [])] };
      case 'add_credit':
        return { title: 'Notez un credit', rows: [['Suma', lei(i.amountLei)], ['Îl iei în', month(i.takeMonth)], ['Îl dai înapoi în', month(i.repayMonth)]] };
      case 'complete_task':
        return { title: 'Bifez un termen ca făcut', rows: [['Termenul', i.id]], task: i.id };
      case 'reopen_task':
        return { title: 'Scot bifa de la un termen', rows: [['Termenul', i.id]], task: i.id };
      case 'follow_opportunity':
        return { title: 'Pun un apel de finanțare în calendar', rows: Object.entries(i).map(([k, v]) => [k, String(v)]) };
      default:
        return { title: 'Salvez', rows: Object.entries(i).map(([k, v]) => [k, String(v)]) };
    }
  }

  /* ---- The sheet ---- */
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'ask-fab';
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg><span>Întreabă</span>';

  const sheet = document.createElement('dialog');
  sheet.className = 'ask-sheet';
  sheet.setAttribute('aria-label', 'Întreabă');
  sheet.innerHTML = `<header class="ask-head"><h2>Întreabă</h2><button type="button" class="ask-close" data-ask-close aria-label="Închide">✕</button></header>
    <div class="ask-log" role="log" aria-live="polite"></div>
    <form class="ask-form"><label class="ask-sr" for="ask-input">Întrebarea ta</label>
      <textarea id="ask-input" rows="2" maxlength="2000" placeholder="Scrie întrebarea ta…" enterkeyhint="send"></textarea>
      <button type="submit" class="btn btn-dark" data-needs-net="${NO_NET}">Trimite</button></form>
    <p class="ask-foot">Cifrele vin din planul fermei tale. Asistentul nu salvează nimic singur: tu apeși pe card. <button type="button" class="ask-link" data-ask-clear>Începe din nou</button></p>`;
  document.body.append(fab, sheet);

  const log = sheet.querySelector('.ask-log');
  const form = sheet.querySelector('.ask-form');
  const input = sheet.querySelector('#ask-input');
  const foot = sheet.querySelector('.ask-foot');
  const send = form.querySelector('button[type="submit"]');
  let busy = false, saved = false;

  /* The phone's bottom bar is fixed, so the button sits above it. */
  function placeFab() {
    const rail = document.querySelector('.rail');
    const fixed = rail && getComputedStyle(rail).position === 'fixed';
    document.documentElement.style.setProperty('--ask-bottom', fixed ? `${rail.offsetHeight + 12}px` : '20px');
  }
  placeFab();
  addEventListener('resize', placeFab);

  const scrollEnd = () => { log.scrollTop = log.scrollHeight; };
  function bubble(role, html) {
    log.insertAdjacentHTML('beforeend', `<div class="ask-msg ${role}">${html}</div>`);
    scrollEnd();
    return log.lastElementChild;
  }
  function empty() {
    if (!CC.isSignedIn()) {
      log.innerHTML = '<div class="ask-empty"><p>Asistentul răspunde din cifrele fermei tale, așa că lucrează doar cu un cont.</p><a class="btn btn-dark" href="/login">Intră în cont</a></div>';
      form.hidden = true;
      foot.hidden = true;
      return;
    }
    form.hidden = false;
    foot.hidden = false;
    log.innerHTML = `<div class="ask-empty"><p>Întreabă despre banii fermei, subvenții, termene sau ce s-ar schimba dacă…</p>
      <div class="ask-chips">${EXAMPLES.map((q) => `<button type="button" class="ask-chip" data-ask-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
  }
  function render() {
    if (!turns.length || !CC.isSignedIn()) return empty();
    log.innerHTML = '';
    turns.forEach((t) => bubble(t.role === 'user' ? 'me' : 'ai', t.role === 'user' ? `<p>${esc(t.text)}</p>` : rich(t.text)));
  }

  async function taskTitle(id, el) {
    try {
      const res = await Live.read('list_tasks', { status: 'all' });
      const task = (res.data || []).find((t) => t.id === id);
      if (task) el.textContent = task.titleRo;
    } catch (e) { /* the id stays */ }
  }

  function showCard(action) {
    /* The card's own id: a second tap after an error can't save the sale or expense twice. */
    if ((action.function === 'record_sale' || action.function === 'add_expense') && crypto.randomUUID) action = { ...action, input: { ...action.input, clientId: crypto.randomUUID() } };
    const c = card(action);
    const el = bubble('card', `<p class="eyebrow">${esc(c.title)}</p><dl>${c.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="ask-acts"><button type="button" class="btn btn-dark" data-ask-yes data-needs-net="Pornește internetul ca să salvezi.">Da, salvează</button><button type="button" class="btn btn-line" data-ask-no>Nu</button></div>`);
    if (c.task) taskTitle(c.task, el.querySelector('dd'));
    el.querySelector('[data-ask-yes]').addEventListener('click', async (e) => {
      const yes = e.currentTarget, acts = yes.parentElement;
      yes.disabled = true;
      acts.querySelector('[data-ask-no]').disabled = true;
      try {
        await Live.write(action.function, action.input);
        acts.outerHTML = '<p class="ask-done">Salvat. Cifrele se actualizează când închizi.</p>';
        saved = true;
      } catch (err) {
        yes.disabled = false;
        acts.querySelector('[data-ask-no]').disabled = false;
        acts.insertAdjacentHTML('afterend', `<p class="ob-err" role="alert">${esc(failText(err))}</p>`);
      }
    }, { once: false });
    el.querySelector('[data-ask-no]').addEventListener('click', (e) => {
      e.currentTarget.parentElement.outerHTML = '<p class="ask-done muted">N-am salvat nimic.</p>';
    });
  }

  const ERRORS = {
    assistant_unavailable: 'Asistentul nu e pornit pe server.',
    daily_limit: 'Ai pus multe întrebări azi. Mai încearcă mâine.',
    no_farm: 'Completează întâi ferma, apoi poți întreba.',
  };

  async function ask(text) {
    if (busy || !text.trim()) return;
    if (!CC.isOnline()) { bubble('err', `<p>${NO_NET}</p>`); return; }
    if (!turns.length) log.innerHTML = '';
    busy = true;
    send.disabled = true;
    turns.push({ role: 'user', text: text.trim() });
    bubble('me', `<p>${esc(text.trim())}</p>`);
    const wait = bubble('ai wait', '<p>Mă uit în cifrele fermei…</p>');
    try {
      const res = await Live.api('/api/assistant', { method: 'POST', body: JSON.stringify({ messages: turns.slice(-MAX_TURNS) }) });
      wait.remove();
      turns.push({ role: 'assistant', text: res.reply });
      keep();
      const el = bubble('ai', rich(res.reply));
      if (res.unverified?.length) el.insertAdjacentHTML('beforeend', '<p class="ask-note">Unele cifre nu sunt confirmate încă.</p>');
      if (res.sources?.length) el.insertAdjacentHTML('beforeend', `<p class="ask-note">Surse: ${res.sources.slice(0, 4).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(', ')}</p>`);
      (res.actions || []).forEach(showCard);
    } catch (err) {
      wait.remove();
      turns.pop();
      keep();
      bubble('err', `<p>${esc(ERRORS[err?.code] || failText(err))}</p>`);
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  }

  fab.addEventListener('click', () => { render(); sheet.showModal(); if (CC.isSignedIn()) input.focus(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value; input.value = ''; ask(q); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  sheet.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-ask-q]');
    if (chip) ask(chip.dataset.askQ);
    else if (e.target.closest('[data-ask-close]') || e.target === sheet) sheet.close();
    else if (e.target.closest('[data-ask-clear]')) { turns = []; keep(); render(); }
  });
  /* A saved card changes the plan, so the page reloads its figures. */
  sheet.addEventListener('close', () => { if (saved) location.reload(); });
})();

}
