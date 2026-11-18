'use client';
/* "Ce s-a schimbat": list_recent_changes, list_sources, search_documents, plus the farmer's own sources
   (was web/legacy/surse.js). Signed in, all of it comes from the monitor and a copy stays on the phone.
   Signed out, a dated snapshot of the sources stands in, and there are no changes or search. Offline,
   everything saved stays readable; searching, adding and deleting need internet. */
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { paginate, type ListPage as Page } from '../../../packages/shared/src/lists/paginate';
import { date } from '../../lib/cc/format';
import { useFarm, useMonitor, useMonitorRefresh, useOnline, useStore, useView } from '../../lib/cc/react';
import { publicConfig, timedFetch } from '../../lib/live/index';
import { pageKeys } from '../../lib/cc/storage';
import { ErrorLine, NetButton, OfflineNote, Sheet, useHref } from '../app/bits';
import { SubNav } from '../app/Frame';

const STATE: Record<string, [string, string]> = {
  active: ['Urmărită', 'ok'],
  needs_manual: ['Se verifică de mână', 'v'],
  error: ['Eroare la citire', 'n'],
  blocked: ['Blocată de site', 'n'],
  gone: ['Nu mai există', 'n'],
  new: ['Nouă', 'n'],
  suspicious: ['De verificat', 'v'],
};
const MY_STATE: Record<string, [string, string]> = { ok: ['Urmărită', 'ok'], thin: ['Fără text de citit', 'v'], blocked: ['Blocată de site', 'n'], gone: ['Nu mai există', 'n'], error: ['Eroare la citire', 'n'] };
const PROBLEM: Record<string, string> = { needs_manual: 'Pagina trebuie citită de mână', error: 'Pagina n-a putut fi citită', blocked: 'Site-ul nu ne lasă să citim pagina', gone: 'Pagina nu mai există' };
const MY_RESULT: Record<string, string> = {
  ok: 'Am citit-o. O verificăm în fiecare zi și îți arătăm ce se schimbă.',
  thin: 'Am deschis-o, dar n-are text de citit. Poate fi o poză sau un PDF scanat. O verificăm în fiecare zi.',
  blocked: 'Site-ul nu ne lasă să citim pagina. Mai încercăm în fiecare zi.',
  gone: 'Pagina nu există la acest link. Verifică-l sau șterge sursa.',
  error: 'N-am putut citi pagina acum. Mai încercăm mâine.',
};
const KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const SEARCH_NET = 'Pornește internetul ca să cauți în documente.';
type Tab = 'changes' | 'search' | 'problems' | 'sources';

interface MySource {
  id: number;
  url: string;
  name?: string | null;
  title?: string | null;
  state: string;
  checkedAt: string;
  changedAt?: string | null;
  shortDiff?: string | null;
  preview?: string | null;
}
interface Change {
  title: string;
  institution: string;
  date: string;
  url: string;
  shortDiff?: string | null;
}
interface FoundDoc {
  url: string;
  title: string;
  institution: string;
  body: string;
}

const load = (name: string) => {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
};
const save = (name: string, value: string) => {
  try {
    localStorage.setItem(name, value);
    return true;
  } catch {
    return false;
  }
};
const myName = (s: MySource) => s.name || s.title || s.url;
const daySaved = (stamp: string) => date(stamp.slice(0, 10), true);

function Tag({ map, state }: { map: Record<string, [string, string]>; state: string }) {
  const [text, tone] = map[state] || [state, 'n'];
  return <span className={`tag ${tone}`}>{text}</span>;
}
/** The diff has one line per change, starting with + or -. */
function DiffLines({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((l, i) =>
        l.startsWith('+') ? (
          <p className="in" key={i}>
            Acum: {l.slice(1)}
          </p>
        ) : l.startsWith('-') ? (
          <p className="out" key={i}>
            Înainte: {l.slice(1)}
          </p>
        ) : null,
      )}
    </>
  );
}
function snippet(body: string, text: string) {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const low = body.toLowerCase();
  const at = Math.max(0, Math.min(...words.map((w) => low.indexOf(w)).filter((i) => i >= 0), low.length) - 80);
  const part = body.slice(at, at + 280).replace(/\s+/g, ' ').trim();
  return `${at > 0 ? '…' : ''}${part}${at + 280 < body.length ? '…' : ''}`;
}
function Pager<T>({ p, onPage }: { p: Page<T>; onPage: (n: number) => void }) {
  if (p.pages === 1) return null;
  return (
    <nav className="pager" aria-label="Pagini">
      <button type="button" className="btn btn-line" disabled={p.page === 1} onClick={() => onPage(p.page - 1)}>
        Înapoi
      </button>
      <span aria-live="polite">
        {p.from}–{p.to} din {p.total}
      </span>
      <button type="button" className="btn btn-line" disabled={p.page === p.pages} onClick={() => onPage(p.page + 1)}>
        Înainte
      </button>
    </nav>
  );
}

export default function Surse() {
  useMonitorRefresh();
  const view = useView('farm')!;
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const monitor = useMonitor();
  const href = useHref();
  const onServer = !!farm.me;
  const SOURCES = monitor.sources;
  const PROBLEMS = monitor.problems;
  const CHANGES = monitor.changes as Change[];
  const data = view.data();
  const limits = data.params.sources;
  const PER_PAGE = limits.page_size.value;
  const API = publicConfig().apiUrl;
  const canAdd = Boolean(API) && online;
  const byId = new Map(SOURCES.map((s) => [s.id, s]));
  const active = SOURCES.filter((s) => s.state === 'active').length;
  const days = data.params.opportunities_changes_days.value;
  const seen = CHANGES.length === 0 ? 'Încă n-am văzut nicio schimbare de conținut.' : `În ultimele ${days} de zile ${CHANGES.length === 1 ? 's-a schimbat o pagină' : `s-au schimbat ${CHANGES.length} pagini`}.`;
  const ADD_ERROR: Record<string, string> = {
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

  const [tab, setTab] = useState<Tab>('changes');
  const [pages, setPages] = useState({ changes: 1, problems: 1, sources: 1 });
  const [inst, setInst] = useState('');
  const [query, setQuery] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const turn = (n: number) => {
    setPages((x) => ({ ...x, [tab]: n }));
    panel.current?.scrollIntoView({ block: 'start' });
  };

  /* ---- The farmer's own sources: the browser holds the private key that owns them ---- */
  const KEY_NAME = pageKeys(store.mode).sourceKey;
  const LIST_NAME = pageKeys(store.mode).mySources;
  const savedKey = useCallback(() => {
    const key = load(KEY_NAME);
    return key && KEY_SHAPE.test(key) ? key : null;
  }, [KEY_NAME]);
  const newKey = useCallback(() => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return save(KEY_NAME, key) ? key : null;
  }, [KEY_NAME]);
  const [mine, setMine] = useState<MySource[]>(() => {
    try {
      return JSON.parse(load(LIST_NAME) ?? 'null') ?? [];
    } catch {
      return [];
    }
  });
  const keep = useCallback(
    (list: MySource[]) => {
      setMine(list);
      save(LIST_NAME, JSON.stringify(list));
    },
    [LIST_NAME],
  );
  const call = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const key = savedKey() ?? newKey();
      if (!key) return { ok: false, error: 'storage' as string | undefined, body: null };
      const headers = { 'x-source-key': key, ...(options.body ? { 'content-type': 'application/json' } : {}) };
      const res = await timedFetch(`${API}/api/sources${path}`, { ...options, headers });
      const body = res.status === 204 ? null : await res.json().catch(() => null);
      return { ok: res.ok, body, error: body?.error as string | undefined };
    },
    [API, savedKey, newKey],
  );
  useEffect(() => {
    if (!API || !online || !savedKey()) return;
    let live = true;
    call('')
      .then((r) => {
        if (live && r.ok) keep(r.body.sources);
      })
      .catch(() => undefined); // The last saved list stays on screen.
    return () => {
      live = false;
    };
  }, [API, online, savedKey, call, keep]);

  const [removing, setRemoving] = useState<number | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const removingSource = mine.find((x) => x.id === removing);
  const closeRemove = () => {
    setRemoving(null);
    setRemoveError('');
  };
  async function removeMine(id: number) {
    setRemoveBusy(true);
    setRemoveError('');
    try {
      const r = await call(`/${id}`, { method: 'DELETE' });
      if (r.ok || r.error === 'not_found') {
        keep(mine.filter((x) => x.id !== id));
        closeRemove();
      } else setRemoveError(ADD_ERROR.busy);
    } catch {
      setRemoveError(ADD_ERROR.network);
    }
    setRemoveBusy(false);
  }

  /* ---- Search in the text already saved from official documents: needs internet and an account ---- */
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ text: string; rows: FoundDoc[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  async function search(e: FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (searching || q.length < 2) return;
    setSearching(true);
    setSearchError('');
    try {
      const res = await store.live.read<FoundDoc>('search_documents', { text: q });
      setFound({ text: q, rows: res.data ?? [] });
    } catch {
      setSearchError(navigator.onLine ? 'Nu am putut căuta acum. Încearcă din nou.' : SEARCH_NET);
    }
    setSearching(false);
  }

  const [adding, setAdding] = useState(false);
  const addSheet = adding && <AddSheet errors={ADD_ERROR} call={call} onSaved={(s) => keep([s, ...mine.filter((x) => x.id !== s.id)])} onClose={() => setAdding(false)} />;

  const link = (url: string, title: string) => (
    <a href={url} rel="noopener" target="_blank">
      {title}
    </a>
  );
  function myRow(s: MySource) {
    const more = s.shortDiff || s.preview;
    return (
      <div className="src-row" key={`m${s.id}`}>
        {link(s.url, myName(s))}
        <span className="src-tags">
          <span className="tag d">Adăugată de tine</span>
          <Tag map={MY_STATE} state={s.state} />
        </span>
        <small>
          Verificată pe {daySaved(s.checkedAt)}
          {s.changedAt ? `, s-a schimbat pe ${daySaved(s.changedAt)}` : ''}
        </small>
        {more && (
          <details className="src-more">
            <summary>Ce am citit</summary>
            <div className="diff">{s.shortDiff ? <DiffLines text={s.shortDiff} /> : <p>{s.preview}</p>}</div>
          </details>
        )}
        <button type="button" className="src-remove" disabled={!canAdd} onClick={() => setRemoving(s.id)}>
          Șterge
        </button>
      </div>
    );
  }
  type Official = (typeof SOURCES)[number];
  const officialRow = (s: Official) => (
    <div className="src-row" key={`o${s.id}`}>
      {link(s.url, s.title)}
      <span>
        <Tag map={STATE} state={s.state} />
      </span>
      <small>
        {s.inst}
        {s.checked ? `, verificată pe ${date(s.checked, true)}` : ''}
      </small>
    </div>
  );

  function changesPanel(): ReactNode {
    if (!CHANGES.length)
      return (
        <section className="card">
          <h2>Schimbări recente</h2>
          <p className="empty">{onServer ? 'Când se schimbă ceva pe o pagină urmărită, apare aici.' : 'Intră în cont ca să vezi schimbările de pe paginile urmărite.'}</p>
        </section>
      );
    const p = paginate(CHANGES, pages.changes, PER_PAGE);
    return (
      <section className="card">
        <div className="card-h">
          <h2>Schimbări recente</h2>
        </div>
        {p.rows.map((c, i) => (
          <details className="change" key={`${c.url}${i}`}>
            <summary>
              <b>{c.title}</b>
              <small>
                {c.institution}, {date(c.date, true)}
              </small>
            </summary>
            {c.shortDiff ? (
              <div className="diff">
                <DiffLines text={c.shortDiff} />
              </div>
            ) : (
              <p className="note">Pagina s-a schimbat, dar n-avem un rezumat al schimbării.</p>
            )}
            <p className="note gap">{link(c.url, 'Vezi sursa')}</p>
          </details>
        ))}
        <Pager p={p} onPage={turn} />
      </section>
    );
  }
  function searchPanel(): ReactNode {
    const why = !onServer ? 'Intră în cont ca să cauți în documente.' : online ? '' : SEARCH_NET;
    return (
      <>
        <form className="find" onSubmit={search}>
          <input type="search" minLength={2} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} placeholder="De exemplu: tineri fermieri" aria-label="Ce cauți în documente" disabled={!!why} />
          <button type="submit" className="btn btn-dark" data-needs-net={SEARCH_NET} disabled={!!why || searching}>
            {searching ? 'Caut…' : 'Caută'}
          </button>
        </form>
        {why && <p className="note">{why}</p>}
        <ErrorLine>{searchError}</ErrorLine>
        <section className="card">
          {found === null ? (
            <p className="note">Căutăm în textul ghidurilor și al paginilor oficiale pe care le urmărim.</p>
          ) : found.rows.length ? (
            found.rows.map((d, i) => (
              <div className="src-row" key={`${d.url}${i}`}>
                {link(d.url, d.title)}
                <small>{d.institution}</small>
                <p className="note">{snippet(d.body, found.text)}</p>
              </div>
            ))
          ) : (
            <p className="empty">N-am găsit nimic. Încearcă alte cuvinte.</p>
          )}
        </section>
      </>
    );
  }
  function problemsPanel(): ReactNode {
    const p = paginate(PROBLEMS, pages.problems, PER_PAGE);
    return (
      <section className="card">
        <div className="card-h">
          <h2>Surse pe care nu le putem citi acum</h2>
          <span>Date reale</span>
        </div>
        {p.rows.map((x, i) => {
          const s = byId.get(x.sourceId);
          return (
            <div className="src-row" key={`${x.sourceId}${i}`}>
              {s ? link(s.url, s.title) : <span>Sursă necunoscută</span>}
              <span>
                <Tag map={STATE} state={x.kind} />
              </span>
              <small>
                {s?.inst || ''}. {PROBLEM[x.kind] || ''}{x.date ? `, ${date(x.date, true)}` : ''}
              </small>
            </div>
          );
        })}
        <Pager p={p} onPage={turn} />
      </section>
    );
  }
  function sourcesPanel(): ReactNode {
    const institutions = [...new Set(SOURCES.map((s) => s.inst))].sort((a, b) => a.localeCompare(b, 'ro'));
    const q = query.toLowerCase();
    const official = SOURCES.filter((s) => (!inst || s.inst === inst) && (!q || s.title.toLowerCase().includes(q))).map((s) => () => officialRow(s));
    const own = inst ? [] : mine.filter((s) => !q || `${myName(s)} ${s.url}`.toLowerCase().includes(q)).map((s) => () => myRow(s));
    const p = paginate([...own, ...official], pages.sources, PER_PAGE);
    return (
      <>
        <div className="src-add">
          <div>
            <h2>Sursele tale</h2>
            <p className="note">{!API ? 'Adăugarea nu merge acum.' : online ? 'Pune un link către o pagină sau un PDF. Îl citim zilnic.' : 'Ai nevoie de internet ca să adaugi o sursă.'}</p>
          </div>
          <button type="button" className="btn btn-dark" disabled={!canAdd} onClick={() => setAdding(true)}>
            Adaugă o sursă
          </button>
        </div>
        <div className="filters" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>
          <label>
            Caută
            <input
              type="search"
              value={query}
              placeholder="Cuvânt din titlu"
              onChange={(e) => {
                setQuery(e.target.value);
                setPages((x) => ({ ...x, sources: 1 }));
              }}
            />
          </label>
          <label>
            Instituția
            <select
              value={inst}
              onChange={(e) => {
                setInst(e.target.value);
                setPages((x) => ({ ...x, sources: 1 }));
              }}
            >
              <option value="">Toate</option>
              {institutions.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
        </div>
        <section className="card">
          <p className="note">{p.total} surse</p>
          {p.total ? p.rows.map((row) => row()) : <p className="empty">Nimic nu se potrivește cu ce ai ales.</p>}
          <Pager p={p} onPage={turn} />
        </section>
      </>
    );
  }

  const VIEWS: [Tab, string][] = [
    ['changes', 'Schimbări'],
    ['search', 'Caută în documente'],
    ['problems', `Probleme (${PROBLEMS.length})`],
    ['sources', 'Surse urmărite'],
  ];
  return (
    <>
      <header className="page-h">
        <div>
          <h1>Ce s-a schimbat</h1>
          <p className="lead">Urmărim paginile oficiale, ca să nu fie nevoie s-o faci tu.</p>
        </div>
      </header>
      <SubNav page="/surse" href={href} />
      <OfflineNote>Nu ai internet. Vezi ultima listă salvată, cu data ei sus.</OfflineNote>
      <section className="cta field verdict" id="summary">
        <div>
          {monitor.at && <p className="eyebrow">Date din {date(monitor.at, true)}</p>}
          <h2>Urmărim {SOURCES.length} de surse oficiale.</h2>
          <p>
            {active} merg bine. {seen}
          </p>
        </div>
      </section>
      <div className="vtabs" role="group" aria-label="Ce arăt">
        {VIEWS.map(([v, label]) => (
          <button key={v} type="button" className="chip" aria-pressed={v === tab} onClick={() => setTab(v)}>
            {label}
          </button>
        ))}
      </div>
      <div id="panel" ref={panel}>
        {tab === 'changes' ? changesPanel() : tab === 'search' ? searchPanel() : tab === 'problems' ? problemsPanel() : sourcesPanel()}
      </div>
      {addSheet}
      {removingSource && (
        <Sheet open onClose={closeRemove} className="h-sheet" label="Ștergi sursa?" locked={removeBusy}>
          <h2>Ștergi sursa?</h2>
          <p className="note">„{myName(removingSource)}” iese din lista ta.</p>
          <ErrorLine>{removeError}</ErrorLine>
          <div className="ob-actions">
            <NetButton reason="Pornește internetul ca să ștergi sursa." className="btn btn-dark" disabled={removeBusy} onClick={() => void removeMine(removingSource.id)}>
              Da, șterge
            </NetButton>
            <button type="button" className="btn btn-line" disabled={removeBusy} onClick={closeRemove}>
              Renunță
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function AddSheet({
  errors,
  call,
  onSaved,
  onClose,
}: {
  errors: Record<string, string>;
  call: (path: string, options?: RequestInit) => Promise<{ ok: boolean; body: { source?: MySource; already?: boolean } | null; error?: string }>;
  onSaved: (s: MySource) => void;
  onClose: () => void;
}) {
  const online = useOnline();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ source: MySource; already?: boolean } | null>(null);
  const fail = (code?: string) => setErr((code && errors[code]) || errors.busy);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const link = url.trim();
    setErr(null);
    if (!link) return fail('bad_link');
    if (!online) return fail('network');
    setSaving(true);
    try {
      const r = await call('', { method: 'POST', body: JSON.stringify({ url: link, name: name.trim() || undefined }) });
      if (!r.ok || !r.body?.source) return fail(r.error);
      onSaved(r.body.source);
      setResult({ source: r.body.source, already: r.body.already });
    } catch {
      fail('network');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Sheet open onClose={onClose} className="h-sheet" label="Adaugă o sursă" keepOnBackdrop>
      <form noValidate onSubmit={submit}>
        <h2>Adaugă o sursă</h2>
        {result ? (
          <div aria-live="polite">
            <div className="src-done">
              <b>{myName(result.source)}</b>
              <Tag map={MY_STATE} state={result.source.state} />
            </div>
            <p className="note gap">{result.already ? 'O ai deja în listă.' : (MY_RESULT[result.source.state] ?? '')}</p>
            {result.source.preview && (
              <div className="diff">
                <p>{result.source.preview}</p>
              </div>
            )}
            <div className="ob-actions">
              <button type="button" className="btn btn-dark" autoFocus onClick={onClose}>
                Gata
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label className="ob-field">
              Linkul paginii sau al PDF-ului
              <input inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="afir.ro/pagina" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>{' '}
            <label className="ob-field">
              Cum vrei s-o numești? (nu e obligatoriu)
              <input autoComplete="off" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </label>{' '}
            <p className="note gap">Lista ta ține de acest telefon sau calculator. Pe alt aparat n-o vei vedea. Alți fermieri nu o văd.</p>
            <ErrorLine>{err}</ErrorLine>
            <div className="ob-actions">
              <NetButton reason="Ai nevoie de internet ca să adaugi o sursă." type="submit" className="btn btn-dark" disabled={saving}>
                {saving ? 'Citim pagina…' : 'Citește pagina'}
              </NetButton>
              <button type="button" className="btn btn-line" onClick={onClose}>
                Renunță
              </button>
            </div>
          </div>
        )}
      </form>
    </Sheet>
  );
}
