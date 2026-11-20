'use client';
/* /verificari, „De verificat” (docs/admin-verificari-plan.md steps 4–6): everything in docs/data that isn't
   firm yet (DE-VERIFICAT, weak sources, assumptions) and the open questions of docs/11-open-questions.md.
   An admin answers each one with a source; an answered row waits until a developer puts the answer in
   the file, and then it leaves the list by itself. A wrong /admin figure can go straight into /admin's draft.
   Offline: the list, the filters and the last answers seen stay readable; saving an answer needs internet
   and is never queued. The logic is in lib/cc/verify.ts. */
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { VerifyAnswer } from '../../../packages/shared/src/verify/index';
import {
  allRows,
  answerErrorText,
  answersGone,
  applyFilter,
  AREA_LABELS,
  AREAS,
  counts,
  editText,
  factorOf,
  filterFromSearch,
  handOverText,
  LEVEL_LABELS,
  NO_FILTER,
  parseRightValue,
  putInAdminDraft,
  readSavedAnswers,
  relatedRows,
  ROW_LEVELS,
  rowViews,
  saveAnswers,
  searchOfFilter,
  STATE_LABELS,
  valueText,
  VERDICT_LABELS,
  type RowView,
  type VerifyFilter,
  type VerifyRow,
} from '../../lib/cc/verify';
import { date } from '../../lib/cc/format';
import { useOnline, usePredictions, useStore } from '../../lib/cc/react';
import { ErrorLine, NetButton, OfflineNote, useHref } from '../app/bits';
import { FrameContext } from '../app/context';
import { PageLink } from '../app/Frame';
import '../../styles/admin.css';
import '../../styles/verify.css';

const SAVE_NET = 'Ca să salvăm răspunsul ai nevoie de internet.';
/** Rows drawn at once; „Arată mai multe” adds as many again. */
const PAGE = 60;

type Store = NonNullable<ReturnType<typeof useStore>>;

export default function AdminVerify() {
  const predictions = usePredictions();
  const store = useStore()!;
  const online = useOnline();
  const href = useHref();
  if (!predictions.admin)
    return (
      <>
        <header className="page-h">
          <div>
            <h1>De verificat</h1>
          </div>
        </header>
        <section className="card adm-closed">
          <p>Pagina asta e doar pentru administratori.</p>
          {!online && <p className="note">Dacă ești administrator, deschide pagina o dată cu internet, ca telefonul să afle.</p>}
          <PageLink path="/acasa" href={href('/acasa')} className="btn btn-line">
            Înapoi acasă
          </PageLink>
        </section>
      </>
    );
  return <Panel store={store} />;
}

/** Copies text; returns false when the browser won't, so the page can show it to select by hand. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function Panel({ store }: { store: Store }) {
  const online = useOnline();
  const href = useHref();
  const { notify } = useContext(FrameContext);
  const rows = useMemo(() => allRows(), []);

  /* The last answers seen stay on the phone, so the list reads offline. */
  const [saved, setSaved] = useState(() => readSavedAnswers(store.keyStore));
  const answers = useMemo(() => saved?.answers ?? [], [saved]);
  const [loadErr, setLoadErr] = useState('');
  const load = useCallback(async () => {
    try {
      const r = await store.adminCall<{ answers: VerifyAnswer[] }>('/api/admin/verify/answers');
      const now = new Date();
      saveAnswers(store.keyStore, r.answers, now);
      setSaved({ answers: r.answers, at: now.toISOString() });
      setLoadErr('');
    } catch {
      setLoadErr('Răspunsurile nu s-au putut citi acum.');
    }
  }, [store]);
  useEffect(() => {
    if (online) void load();
  }, [online, load]);

  /* The filters live in the address, so a link opens the same view. */
  const [filter, setFilterState] = useState<VerifyFilter>(() => (typeof window === 'undefined' ? NO_FILTER : filterFromSearch(window.location.search)));
  const setFilter = (f: VerifyFilter) => {
    setFilterState(f);
    setShown(PAGE);
    if (typeof window !== 'undefined') window.history.replaceState(window.history.state, '', `${window.location.pathname}${searchOfFilter(f)}${window.location.hash}`);
  };
  const [shown, setShown] = useState(PAGE);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const views = useMemo(() => rowViews(rows, answers), [rows, answers]);
  const listed = useMemo(() => applyFilter(views, filter), [views, filter]);
  const top = useMemo(() => counts(views, new Date()), [views]);
  const gone = useMemo(() => answersGone(views, answers), [views, answers]);
  const waiting = views.filter((v) => v.state === 'waiting');

  const added = (a: VerifyAnswer) => {
    const next = [a, ...answers];
    const now = new Date();
    saveAnswers(store.keyStore, next, now);
    setSaved({ answers: next, at: now.toISOString() });
  };

  const [copied, setCopied] = useState<string | null>(null);
  const copyAll = async () => {
    const text = handOverText(views);
    if (await copy(text)) notify({ tone: 'info', title: 'Am copiat modificările', body: `${waiting.length} ${waiting.length === 1 ? 'modificare' : 'modificări'} de pus în fișiere.` });
    else setCopied(text);
  };

  return (
    <>
      <header className="page-h">
        <div>
          <h1>De verificat</h1>
          <p className="lead">
            Tot ce nu e încă sigur în aplicație: cifrele marcate DE-VERIFICAT, cele din surse slabe, presupunerile noastre și întrebările deschise. Verifică-le în sursa oficială și scrie ce ai găsit.
          </p>
        </div>
      </header>
      <OfflineNote>Nu ai internet. Vezi lista și ultimele răspunsuri citite; un răspuns nou îl salvezi când revii online.</OfflineNote>
      <p className="adm-status">
        <PageLink path="/admin" href={href('/admin')}>
          Cifrele calculelor
        </PageLink>
        {saved && ` · răspunsuri citite pe ${date(saved.at.slice(0, 10), true)}`}
      </p>
      {loadErr && <ErrorLine>{loadErr}</ErrorLine>}

      <section className="vf-counts" aria-label="Pe scurt">
        {ROW_LEVELS.map((l) => (
          <button
            type="button"
            key={l}
            className={`card vf-count${filter.level === l ? ' on' : ''}`}
            aria-pressed={filter.level === l}
            onClick={() => setFilter({ ...filter, level: filter.level === l ? null : l })}
          >
            <b>{top.byLevel[l]}</b>
            <span>{LEVEL_LABELS[l]}</span>
          </button>
        ))}
        <button
          type="button"
          className={`card vf-count${filter.state === 'waiting' ? ' on' : ''}`}
          aria-pressed={filter.state === 'waiting'}
          onClick={() => setFilter({ ...filter, state: filter.state === 'waiting' ? null : 'waiting' })}
        >
          <b>{top.waiting}</b>
          <span>De pus în fișiere</span>
        </button>
        <div className="card vf-count vf-still">
          <b>{top.answeredLately}</b>
          <span>Răspunsuri în ultimele 30 de zile</span>
        </div>
      </section>

      {waiting.length > 0 && (
        <details className="card vf-hand">
          <summary>
            <h2>De pus în fișiere</h2>
            <span className="note">
              {waiting.length} {waiting.length === 1 ? 'răspuns' : 'răspunsuri'} · un programator le scrie în fișiere, iar la următoarea publicare ies din listă
            </span>
          </summary>
          <div className="adm-acts">
            <button type="button" className="btn btn-dark" onClick={() => void copyAll()}>
              Copiază toate modificările
            </button>
          </div>
          {copied && (
            <>
              <p className="note">Telefonul n-a lăsat copierea. Selectează textul de mai jos.</p>
              <pre className="vf-pre">{copied}</pre>
            </>
          )}
          <ul className="vf-edits">
            {waiting.map((v) => (
              <li key={v.row.key}>
                <pre className="vf-pre">{editText(v.row, v.answers[0]!)}</pre>
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="card vf-filters" aria-label="Filtre">
        <label className="ob-field">
          Caută
          <input type="search" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} placeholder="de exemplu PD-05 sau motorină" autoComplete="off" />
        </label>
        <label className="ob-field">
          Zona
          <select value={filter.area ?? ''} onChange={(e) => setFilter({ ...filter, area: (e.target.value || null) as VerifyFilter['area'] })}>
            <option value="">Toate</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {AREA_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="ob-field">
          Cât de sigur
          <select value={filter.level ?? ''} onChange={(e) => setFilter({ ...filter, level: (e.target.value || null) as VerifyFilter['level'] })}>
            <option value="">Toate</option>
            {ROW_LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="ob-field">
          Răspuns
          <select value={filter.state ?? ''} onChange={(e) => setFilter({ ...filter, state: (e.target.value || null) as VerifyFilter['state'] })}>
            <option value="">Oricare</option>
            <option value="open">{STATE_LABELS.open}</option>
            <option value="waiting">{STATE_LABELS.waiting}</option>
          </select>
        </label>
        <label className="adm-check">
          <input type="checkbox" checked={filter.money} onChange={(e) => setFilter({ ...filter, money: e.target.checked })} />
          Doar ce schimbă bani în plan
        </label>
        {filter !== NO_FILTER && searchOfFilter(filter) !== '' && (
          <button type="button" className="link" onClick={() => setFilter(NO_FILTER)}>
            Scoate filtrele
          </button>
        )}
      </section>

      <p className="adm-status" aria-live="polite">
        {listed.length === views.length ? `${listed.length} de elemente` : `${listed.length} din ${views.length} elemente`}
      </p>
      {listed.length === 0 && <p className="note">Nimic nu se potrivește cu filtrele.</p>}
      <ul className="card vf-rows">
        {listed.slice(0, shown).map((v) => (
          <RowItem key={v.row.key} view={v} rows={rows} open={openKey === v.row.key} onToggle={() => setOpenKey(openKey === v.row.key ? null : v.row.key)} onAnswer={added} store={store} />
        ))}
      </ul>
      {listed.length > shown && (
        <button type="button" className="btn btn-line vf-more" onClick={() => setShown(shown + PAGE)}>
          Arată mai multe ({listed.length - shown} rămase)
        </button>
      )}

      {gone.length > 0 && (
        <details className="card vf-hand">
          <summary>
            <h2>Răspunsuri care nu mai au element</h2>
            <span className="note">Fișierul s-a schimbat: fie răspunsul a fost pus, fie elementul și-a schimbat numele.</span>
          </summary>
          <ul className="vf-edits">
            {gone.map((a) => (
              <li key={a.id}>
                <b>{VERDICT_LABELS[a.verdict]}</b> <span className="note">{a.itemKey}</span>
                <p className="note">
                  {a.note} · {a.byEmail ?? 'necunoscut'}, {date(a.at.slice(0, 10), true)}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

const LEVEL_TAG: Record<VerifyRow['level'], string> = { check: 'd', weak: 'v', assumption: 'n', question: 'v' };

function RowItem({ view, rows, open, onToggle, onAnswer, store }: { view: RowView; rows: readonly VerifyRow[]; open: boolean; onToggle: () => void; onAnswer: (a: VerifyAnswer) => void; store: Store }) {
  const { row, state, answers } = view;
  const id = `vf-${row.key.replace(/[^a-zA-Z0-9]/g, '-')}`;
  return (
    <li className={`adm-row${open ? ' open' : ''}`}>
      <button type="button" className="vf-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="vf-name">
          <b>{row.name}</b>
          <span className="note">{row.where}</span>
        </span>
        <span className="vf-tags">
          <span className={`tag ${LEVEL_TAG[row.level]}`}>{row.level === 'question' ? LEVEL_LABELS.question : (row.status ?? LEVEL_LABELS[row.level])}</span>
          {row.money && <span className="tag ok">bani</span>}
          {state === 'waiting' && <span className="tag v">{VERDICT_LABELS[answers[0]!.verdict]} · de pus în fișier</span>}
          {state === 'open' && answers[0] && <span className="tag n">încercat</span>}
        </span>
      </button>
      {row.value && !open && <p className="note vf-val">Acum: {row.value}</p>}
      {open && <Detail id={id} view={view} rows={rows} onAnswer={onAnswer} store={store} />}
    </li>
  );
}

function Detail({ id, view, rows, onAnswer, store }: { id: string; view: RowView; rows: readonly VerifyRow[]; onAnswer: (a: VerifyAnswer) => void; store: Store }) {
  const { row, answers } = view;
  const related = useMemo(() => relatedRows(row, rows), [row, rows]);
  return (
    <div className="vf-detail" id={id}>
      <dl className="vf-facts">
        {row.value && (
          <>
            <dt>Folosit acum</dt>
            <dd>{row.value}</dd>
          </>
        )}
        {row.note && (
          <>
            <dt>{row.question ? 'Ce scrie' : 'Nota'}</dt>
            <dd className="vf-text">{row.note}</dd>
          </>
        )}
        {(row.sourceUrl || row.source) && (
          <>
            <dt>Sursa de acum</dt>
            <dd>
              {row.sourceUrl ? (
                <a href={row.sourceUrl} target="_blank" rel="noreferrer noopener">
                  {row.sourceUrl.replace(/^https?:\/\//, '').slice(0, 80)}
                </a>
              ) : (
                row.source
              )}
            </dd>
          </>
        )}
        {row.factorPath && (
          <>
            <dt>În calcule</dt>
            <dd>{factorOf(row)?.label ?? row.factorPath} (se poate schimba din Cifrele calculelor)</dd>
          </>
        )}
      </dl>
      {row.item && (
        <details className="vf-raw">
          <summary>Tot obiectul din fișier</summary>
          <pre className="vf-pre">{JSON.stringify(row.item.holder, null, 2)}</pre>
        </details>
      )}
      {related.length > 0 && (
        <div className="vf-related">
          <h3>{row.item ? 'Întrebări deschise despre asta' : 'Ce numește în fișiere'}</h3>
          <ul>
            {related.map((r) => (
              <li key={r.key}>
                {r.name} <span className="note">· {r.where}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {answers.length > 0 && (
        <div className="vf-history">
          <h3>Răspunsuri</h3>
          <ul>
            {answers.map((a) => (
              <li key={a.id}>
                <b>{VERDICT_LABELS[a.verdict]}</b>
                {a.verdict === 'wrong' && <> · corect: {valueText(a.newValue)}</>}
                <span className="note">
                  {' '}
                  · {a.byEmail ?? 'necunoscut'}, {date(a.at.slice(0, 10), true)}
                </span>
                <p className="note vf-text">{a.note}</p>
                {a.sourceUrl && (
                  <a href={a.sourceUrl} target="_blank" rel="noreferrer noopener" className="note">
                    {a.sourceUrl.replace(/^https?:\/\//, '').slice(0, 80)}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <AnswerForm row={row} onAnswer={onAnswer} store={store} />
    </div>
  );
}

function AnswerForm({ row, onAnswer, store }: { row: VerifyRow; onAnswer: (a: VerifyAnswer) => void; store: Store }) {
  const predictions = usePredictions();
  const { notify } = useContext(FrameContext);
  const href = useHref();
  const [verdict, setVerdict] = useState<VerifyAnswer['verdict']>('confirmed');
  const [sourceUrl, setSourceUrl] = useState('');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [last, setLast] = useState<VerifyAnswer | null>(null);
  const [inDraft, setInDraft] = useState(false);

  const needsSource = verdict === 'confirmed' || verdict === 'wrong';
  const parsed = verdict === 'wrong' ? parseRightValue(row, value) : null;
  const sourceOk = !needsSource || /^https:\/\/\S+$/.test(sourceUrl.trim());
  const ready = note.trim().length >= 3 && sourceOk && (!parsed || parsed.ok) && !busy;
  const factor = factorOf(row);

  async function save() {
    if (!ready) return;
    setBusy(true);
    setErr('');
    try {
      const body = {
        itemKey: row.key,
        verdict,
        note: note.trim(),
        sourceUrl: sourceUrl.trim() || null,
        ...(parsed?.ok ? { newValue: parsed.value } : {}),
      };
      const r = await store.adminCall<{ answer: VerifyAnswer }>('/api/admin/verify/answers', { method: 'POST', timeout: 'write', body: JSON.stringify(body) });
      onAnswer(r.answer);
      setLast(r.answer);
      setInDraft(false);
      setNote('');
      setValue('');
      notify({ tone: 'info', title: 'Am salvat răspunsul', body: verdict === 'open' ? 'Rămâne în listă, cu ce ai încercat.' : 'Apare la „De pus în fișiere” până intră în fișier.' });
    } catch (e) {
      setErr(answerErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const toDraft = () => {
    if (last && putInAdminDraft(store.keyStore, row, last, predictions.version)) setInDraft(true);
  };

  return (
    <form
      className="adm-edit vf-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h3>Ce ai găsit</h3>
      <fieldset className="vf-verdicts">
        <legend className="note">Răspunsul</legend>
        {(['confirmed', 'wrong', 'open', 'not_needed'] as const).map((v) => (
          <label key={v} className="adm-check">
            <input type="radio" name={`verdict-${row.key}`} value={v} checked={verdict === v} onChange={() => setVerdict(v)} />
            {v === 'confirmed' ? (row.question ? 'Rezolvat, așa e' : 'Confirmat, e corect') : v === 'wrong' ? 'Greșit, valoarea corectă e alta' : VERDICT_LABELS[v]}
          </label>
        ))}
      </fieldset>
      {verdict === 'wrong' && (
        <label className="ob-field">
          Valoarea corectă{factor?.type === 'number' && factor.unit ? ` (${factor.unit})` : ''}
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={row.value || 'gol = fără cifră'} autoComplete="off" />
        </label>
      )}
      {verdict === 'wrong' && !factor && <small className="note">Un număr, da/nu, text, sau JSON pentru o listă. Gol înseamnă „fără cifră”.</small>}
      {parsed && !parsed.ok && value.trim() !== '' && (
        <small className="ob-err" role="alert">
          {parsed.error}
        </small>
      )}
      {needsSource && (
        <label className="ob-field">
          Linkul sursei oficiale
          <input type="url" inputMode="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" autoComplete="off" />
        </label>
      )}
      {needsSource && sourceUrl.trim() !== '' && !sourceOk && (
        <small className="ob-err" role="alert">
          Linkul trebuie să înceapă cu https://.
        </small>
      )}
      <label className="ob-field">
        {verdict === 'open' ? 'Ce ai încercat' : verdict === 'not_needed' ? 'De ce nu mai e nevoie' : 'Ce scrie în sursă'}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
      </label>
      <ErrorLine>{err}</ErrorLine>
      <div className="adm-acts">
        <NetButton reason={SAVE_NET} type="submit" className="btn btn-dark" disabled={!ready}>
          {busy ? 'Se salvează…' : 'Salvează răspunsul'}
        </NetButton>
      </div>
      {last?.verdict === 'wrong' && row.factorPath && (
        <div className="vf-draft">
          {inDraft ? (
            <p className="note">
              E în ciorna de pe{' '}
              <PageLink path="/admin" href={href('/admin')}>
                Cifrele calculelor
              </PageLink>
              . Vezi efectul pe salariu acolo și publică.
            </p>
          ) : (
            <button type="button" className="btn btn-line" onClick={toDraft}>
              Pune valoarea în ciorna de pe Cifrele calculelor
            </button>
          )}
        </div>
      )}
    </form>
  );
}
