/* "Ce s-a schimbat": list_recent_changes, list_sources, search_documents, plus the farmer's own sources.
   Signed in, all of it comes from the monitor and a copy stays on the phone. Signed out, a dated snapshot
   of the sources stands in, and there are no changes or search. Offline, everything saved stays readable;
   searching, adding and deleting need internet. */
(function () {
  const { esc, date } = CC;
  const SOURCES = CC.monitor.sources(), SOURCE_PROBLEMS = CC.monitor.problems(), CHANGES = CC.monitor.changes();
  CC.start();

  const el = (id) => document.getElementById(id);
  const limits = CC.data().params.sources;
  const PER_PAGE = limits.page_size.value;
  const API = window.CROPCASH_CONFIG?.apiUrl;
  const canAdd = () => Boolean(API) && navigator.onLine;
  const byId = new Map(SOURCES.map((s) => [s.id, s]));
  const STATE = { active: ['Urmărită', 'ok'], needs_manual: ['Se verifică de mână', 'v'], error: ['Eroare la citire', 'n'], blocked: ['Blocată de site', 'n'], gone: ['Nu mai există', 'n'], new: ['Nouă', 'n'], suspicious: ['De verificat', 'v'] };
  const stateTag = (s) => { const [text, tone] = STATE[s] || [s, 'n']; return `<span class="tag ${tone}">${esc(text)}</span>`; };
  const PROBLEM = { needs_manual: 'Pagina trebuie citită de mână', error: 'Pagina n-a putut fi citită', blocked: 'Site-ul nu ne lasă să citim pagina', gone: 'Pagina nu mai există' };
  const active = SOURCES.filter((s) => s.state === 'active').length;

  const seen = CHANGES.length === 0
    ? 'Încă n-am văzut nicio schimbare de conținut.'
    : `În ultimele ${CC.data().params.opportunities_changes_days.value} de zile ${CHANGES.length === 1 ? 's-a schimbat o pagină' : `s-au schimbat ${CHANGES.length} pagini`}.`;
  el('summary').innerHTML = `<div><p class="eyebrow">Date din ${date(CC.monitor.at(), true)}</p>
    <h2>Urmărim ${SOURCES.length} de surse oficiale.</h2>
    <p>${active} merg bine. ${seen}</p></div>`;

  const VIEWS = [['changes', 'Schimbări'], ['search', 'Caută în documente'], ['problems', `Probleme (${SOURCE_PROBLEMS.length})`], ['sources', 'Surse urmărite']];
  let view = 'changes', inst = '', query = '';
  const pageOf = { changes: 1, problems: 1, sources: 1 };
  el('vtabs').innerHTML = VIEWS.map(([v, label]) => `<button type="button" class="chip" data-view-tab="${v}">${label}</button>`).join('');

  /* ---- The farmer's own sources: the browser holds the private key that owns them ---- */
  const KEY_NAME = 'cropcash-source-key', LIST_NAME = 'cropcash-my-sources';
  const KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;
  const load = (name) => { try { return localStorage.getItem(name); } catch { return null; } };
  const save = (name, value) => { try { localStorage.setItem(name, value); return true; } catch { return false; } };
  function savedKey() { const key = load(KEY_NAME); return key && KEY_SHAPE.test(key) ? key : null; }
  function newKey() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return save(KEY_NAME, key) ? key : null;
  }
  function savedList() { try { return JSON.parse(load(LIST_NAME)) ?? []; } catch { return []; } }
  let mine = savedList();
  function keep(list) { mine = list; save(LIST_NAME, JSON.stringify(list)); }

  async function call(path, options = {}) {
    const key = savedKey() ?? newKey();
    if (!key) return { ok: false, error: 'storage' };
    const headers = { 'x-source-key': key, ...(options.body ? { 'content-type': 'application/json' } : {}) };
    const res = await fetch(`${API}/api/sources${path}`, { ...options, headers });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    return { ok: res.ok, body, error: body?.error };
  }
  async function refreshMine() {
    if (!canAdd() || !savedKey()) return;
    try {
      const r = await call('');
      if (!r.ok) return;
      keep(r.body.sources);
      if (view === 'sources' && document.activeElement?.id !== 's-text') render();
    } catch { /* The last saved list stays on screen. */ }
  }

  const MY_STATE = { ok: ['Urmărită', 'ok'], thin: ['Fără text de citit', 'v'], blocked: ['Blocată de site', 'n'], gone: ['Nu mai există', 'n'], error: ['Eroare la citire', 'n'] };
  const myTag = (state) => { const [text, tone] = MY_STATE[state] || [state, 'n']; return `<span class="tag ${tone}">${esc(text)}</span>`; };
  const myName = (s) => s.name || s.title || s.url;
  const MY_RESULT = {
    ok: 'Am citit-o. O verificăm în fiecare zi și îți arătăm ce se schimbă.',
    thin: 'Am deschis-o, dar n-are text de citit. Poate fi o poză sau un PDF scanat. O verificăm în fiecare zi.',
    blocked: 'Site-ul nu ne lasă să citim pagina. Mai încercăm în fiecare zi.',
    gone: 'Pagina nu există la acest link. Verifică-l sau șterge sursa.',
    error: 'N-am putut citi pagina acum. Mai încercăm mâine.',
  };
  const ADD_ERROR = {
    bad_link: 'Linkul nu pare bun. Verifică-l și încearcă din nou.',
    private: 'Linkul ăsta nu se poate deschide de pe internet.',
    unsupported: 'Citim doar pagini de internet și PDF-uri.',
    too_large: `Fișierul e prea mare. Citim până la ${limits.max_mb.value} MB.`,
    too_many: `Ai ajuns la ${limits.farmer_max.value} de surse. Șterge una ca să adaugi alta.`,
    too_many_today: 'Ai adăugat destule surse azi. Încearcă mâine.',
    storage: 'Telefonul nu ne lasă să salvăm lista. Verifică setările browserului.',
    network: 'N-am putut ajunge la server. Încearcă din nou.',
    busy: 'Nu putem citi sursa acum. Încearcă puțin mai târziu.',
  };
  /* The diff has one line per change, starting with + or -. */
  const diffLines = (text) => text.split('\n').map((l) => (l.startsWith('+') ? `<p class="in">Acum: ${esc(l.slice(1))}</p>` : l.startsWith('-') ? `<p class="out">Înainte: ${esc(l.slice(1))}</p>` : '')).join('');
  const daySaved = (stamp) => date(stamp.slice(0, 10), true);

  function myRow(s) {
    const more = s.shortDiff || s.preview;
    return `<div class="src-row"><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(myName(s))}</a><span class="src-tags"><span class="tag d">Adăugată de tine</span>${myTag(s.state)}</span>
      <small>Verificată pe ${daySaved(s.checkedAt)}${s.changedAt ? `, s-a schimbat pe ${daySaved(s.changedAt)}` : ''}</small>
      ${more ? `<details class="src-more"><summary>Ce am citit</summary><div class="diff">${s.shortDiff ? diffLines(s.shortDiff) : `<p>${esc(s.preview)}</p>`}</div></details>` : ''}
      <button type="button" class="src-remove" data-remove="${s.id}"${canAdd() ? '' : ' disabled'}>Șterge</button></div>`;
  }
  const officialRow = (s) => `<div class="src-row"><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title)}</a><span>${stateTag(s.state)}</span><small>${esc(s.inst)}${s.checked ? `, verificată pe ${date(s.checked, true)}` : ''}</small></div>`;

  function pager(p) {
    if (p.pages === 1) return '';
    return `<nav class="pager" aria-label="Pagini"><button type="button" class="btn btn-line" data-page="${p.page - 1}"${p.page === 1 ? ' disabled' : ''}>Înapoi</button>
      <span aria-live="polite">${p.from}–${p.to} din ${p.total}</span>
      <button type="button" class="btn btn-line" data-page="${p.page + 1}"${p.page === p.pages ? ' disabled' : ''}>Înainte</button></nav>`;
  }
  const pageIn = (list) => { const p = window.CropEngine.paginate(list, pageOf[view], PER_PAGE); pageOf[view] = p.page; return p; };

  function changesPanel() {
    if (!CHANGES.length) {
      const why = CC.onServer ? 'Când se schimbă ceva pe o pagină urmărită, apare aici.' : 'Intră în cont ca să vezi schimbările de pe paginile urmărite.';
      return `<section class="card"><h2>Schimbări recente</h2><p class="empty">${why}</p></section>`;
    }
    const p = pageIn(CHANGES);
    return `<section class="card"><div class="card-h"><h2>Schimbări recente</h2></div>
      ${p.rows.map((c) => `<details class="change"><summary><b>${esc(c.title)}</b><small>${esc(c.institution)}, ${date(c.date, true)}</small></summary>
          ${c.shortDiff ? `<div class="diff">${diffLines(c.shortDiff)}</div>` : '<p class="note">Pagina s-a schimbat, dar n-avem un rezumat al schimbării.</p>'}
          <p class="note gap"><a href="${esc(c.url)}" rel="noopener" target="_blank">Vezi sursa</a></p></details>`).join('')}${pager(p)}</section>`;
  }

  /* ---- Search in the text already saved from official documents: needs internet and an account ---- */
  let found = null, searching = false, searchError = '';
  function snippet(body, text) {
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const low = body.toLowerCase();
    const at = Math.max(0, Math.min(...words.map((w) => low.indexOf(w)).filter((i) => i >= 0), low.length) - 80);
    const part = body.slice(at, at + 280).replace(/\s+/g, ' ').trim();
    return `${at > 0 ? '…' : ''}${part}${at + 280 < body.length ? '…' : ''}`;
  }
  function searchPanel() {
    const why = !CC.onServer ? 'Intră în cont ca să cauți în documente.' : navigator.onLine ? '' : 'Pornește internetul ca să cauți în documente.';
    const results = found === null ? '' : found.rows.length
      ? found.rows.map((d) => `<div class="src-row"><a href="${esc(d.url)}" rel="noopener" target="_blank">${esc(d.title)}</a><small>${esc(d.institution)}</small><p class="note">${esc(snippet(d.body, found.text))}</p></div>`).join('')
      : '<p class="empty">N-am găsit nimic. Încearcă alte cuvinte.</p>';
    return `<form class="find" id="doc-search"><input type="search" id="doc-text" minlength="2" maxlength="200" value="${esc(found?.text ?? '')}" placeholder="De exemplu: tineri fermieri" aria-label="Ce cauți în documente"${why ? ' disabled' : ''}>
        <button type="submit" class="btn btn-dark" data-needs-net="Pornește internetul ca să cauți în documente."${why || searching ? ' disabled' : ''}>${searching ? 'Caut…' : 'Caută'}</button></form>
      ${why ? `<p class="note">${why}</p>` : ''}${searchError ? `<p class="ob-err" role="alert">${esc(searchError)}</p>` : ''}
      <section class="card">${results || '<p class="note">Căutăm în textul ghidurilor și al paginilor oficiale pe care le urmărim.</p>'}</section>`;
  }
  async function searchDocuments(text) {
    if (searching || text.trim().length < 2) return;
    searching = true; searchError = ''; render();
    try {
      const Live = await CC.live();
      const res = await Live.read('search_documents', { text: text.trim() });
      found = { text: text.trim(), rows: res.data ?? [] };
    } catch (e) {
      searchError = navigator.onLine ? 'Nu am putut căuta acum. Încearcă din nou.' : 'Pornește internetul ca să cauți în documente.';
    }
    searching = false;
    render();
  }

  function problemsPanel() {
    const page = pageIn(SOURCE_PROBLEMS);
    return `<section class="card"><div class="card-h"><h2>Surse pe care nu le putem citi acum</h2><span>Date reale</span></div>
      ${page.rows.map((p) => {
        const s = byId.get(p.sourceId);
        return `<div class="src-row">${s ? `<a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title)}</a>` : '<span>Sursă necunoscută</span>'}<span>${stateTag(p.kind)}</span><small>${esc(s?.inst || '')}. ${esc(PROBLEM[p.kind] || '')}, ${date(p.date, true)}</small></div>`;
      }).join('')}${pager(page)}</section>`;
  }

  function sourcesPanel() {
    const institutions = [...new Set(SOURCES.map((s) => s.inst))].sort((a, b) => a.localeCompare(b, 'ro'));
    const q = query.toLowerCase();
    const official = SOURCES.filter((s) => (!inst || s.inst === inst) && (!q || s.title.toLowerCase().includes(q))).map((s) => ({ s, row: officialRow }));
    const own = inst ? [] : mine.filter((s) => !q || `${myName(s)} ${s.url}`.toLowerCase().includes(q)).map((s) => ({ s, row: myRow }));
    const p = pageIn([...own, ...official]);
    return `<div class="src-add"><div><h2>Sursele tale</h2><p class="note">${!API ? 'Adăugarea nu merge acum.' : navigator.onLine ? 'Pune un link către o pagină sau un PDF. Îl citim zilnic.' : 'Ai nevoie de internet ca să adaugi o sursă.'}</p></div>
        <button type="button" class="btn btn-dark" id="add-open"${canAdd() ? '' : ' disabled'}>Adaugă o sursă</button></div>
      <div class="filters" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
        <label>Caută<input type="search" id="s-text" value="${esc(query)}" placeholder="Cuvânt din titlu"></label>
        <label>Instituția<select id="s-inst"><option value="">Toate</option>${institutions.map((i) => `<option${i === inst ? ' selected' : ''}>${esc(i)}</option>`).join('')}</select></label>
      </div>
      <section class="card"><p class="note">${p.total} surse</p>
      ${p.total ? p.rows.map(({ s, row }) => row(s)).join('') : '<p class="empty">Nimic nu se potrivește cu ce ai ales.</p>'}${pager(p)}</section>`;
  }

  function render() {
    document.querySelectorAll('[data-view-tab]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.viewTab === view));
    el('panel').innerHTML = view === 'changes' ? changesPanel() : view === 'search' ? searchPanel() : view === 'problems' ? problemsPanel() : sourcesPanel();
  }

  /* ---- Adding and deleting ---- */
  const box = el('add');
  function openAdd() {
    el('add-form').reset();
    el('add-err').hidden = true;
    el('add-fields').hidden = false;
    el('add-result').hidden = true;
    box.showModal();
    el('add-url').focus();
  }
  function showResult({ source, already }) {
    el('add-fields').hidden = true;
    el('add-result').hidden = false;
    el('add-result').innerHTML = `<div class="src-done"><b>${esc(myName(source))}</b>${myTag(source.state)}</div>
      <p class="note gap">${already ? 'O ai deja în listă.' : esc(MY_RESULT[source.state] ?? '')}</p>
      ${source.preview ? `<div class="diff"><p>${esc(source.preview)}</p></div>` : ''}
      <div class="ob-actions"><button type="button" class="btn btn-dark" data-close>Gata</button></div>`;
    el('add-result').querySelector('[data-close]').focus();
  }
  el('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const save = el('add-save');
    if (save.disabled) return;
    const url = el('add-url').value.trim();
    const fail = (error) => { el('add-err').textContent = ADD_ERROR[error] ?? ADD_ERROR.busy; el('add-err').hidden = false; };
    el('add-err').hidden = true;
    if (!url) return fail('bad_link');
    if (!navigator.onLine) return fail('network');
    save.disabled = true;
    save.textContent = 'Citim pagina…';
    try {
      const r = await call('', { method: 'POST', body: JSON.stringify({ url, name: el('add-name').value.trim() || undefined }) });
      if (!r.ok) return fail(r.error);
      keep([r.body.source, ...mine.filter((s) => s.id !== r.body.source.id)]);
      render();
      showResult(r.body);
    } catch {
      fail('network');
    } finally {
      save.disabled = false;
      save.textContent = 'Citește pagina';
    }
  });
  box.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) box.close(); });

  async function removeMine(id, button) {
    const s = mine.find((x) => x.id === id);
    if (!s || !window.confirm(`Ștergi „${myName(s)}” din lista ta?`)) return;
    button.disabled = true;
    try {
      const r = await call(`/${id}`, { method: 'DELETE' });
      if (r.ok || r.error === 'not_found') keep(mine.filter((x) => x.id !== id));
      else alert(ADD_ERROR.busy);
    } catch {
      alert(ADD_ERROR.network);
    }
    render();
  }

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-view-tab]');
    if (tab) { view = tab.dataset.viewTab; render(); return; }
    const turn = e.target.closest('[data-page]');
    if (turn) { pageOf[view] = +turn.dataset.page; render(); el('panel').scrollIntoView({ block: 'start' }); return; }
    if (e.target.closest('#add-open')) { openAdd(); return; }
    const remove = e.target.closest('[data-remove]');
    if (remove) removeMine(+remove.dataset.remove, remove);
  });
  el('panel').addEventListener('submit', (e) => { if (e.target.id !== 'doc-search') return; e.preventDefault(); searchDocuments(el('doc-text').value); });
  window.addEventListener('online', () => { render(); refreshMine(); });
  window.addEventListener('offline', render);
  el('panel').addEventListener('input', (e) => {
    if (e.target.id === 's-inst') { inst = e.target.value; pageOf.sources = 1; render(); }
    if (e.target.id === 's-text') { query = e.target.value; pageOf.sources = 1; render(); const i = el('s-text'); i.focus(); i.setSelectionRange(query.length, query.length); }
  });
  render();
  refreshMine();
})();
