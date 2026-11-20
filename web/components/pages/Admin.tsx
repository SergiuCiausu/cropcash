'use client';
/* /admin (docs/admin-panel-plan.md step 6): every figure behind the forecasts, what it is in the
   source files and what's in force, a draft of changes with a reason each, the plan before and after
   on the admin's farm or on Ion's, then publish, and the history to go back to an older version.
   Only for accounts in ADMIN_EMAILS (the API checks again on every call). Offline the figures and
   the draft stay readable and editable; publishing and the history need internet and are never queued.
   The logic is in lib/cc/admin.ts. */
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Override, OverrideValue } from '../../../packages/shared/src/data/index';
import type { PlanSummary, SummaryKey } from '../../../packages/shared/src/cashflow/plan-diff';
import {
  checkSet,
  clearDraft,
  comparePlans,
  draftChanges,
  draftSet,
  FACTOR_GROUPS,
  factorRows,
  fieldText,
  keyOptions,
  parseValue,
  publishErrorText,
  readDraft,
  reasonError,
  saveDraft,
  planSideOf,
  showValue,
  type Draft,
  type FactorGroup,
  whereOf,
  type FactorRow,
} from '../../lib/cc/admin';
import { date, MONTHS } from '../../lib/cc/format';
import { useOnline, usePredictions, useStore } from '../../lib/cc/react';
import { ErrorLine, Money, NetButton, OfflineNote, useHref } from '../app/bits';
import CompareChart from '../app/CompareChart';
import { FrameContext } from '../app/context';
import { PageLink } from '../app/Frame';
import '../../styles/admin.css';

const PUBLISH_NET = 'Publicarea cere internet.';
const HISTORY_NET = 'Istoricul se vede doar cu internet.';

interface VersionInfo {
  version: number;
  publishedAt: string;
  note: string;
  revertedFrom: number | null;
}

/** Where a failed check points, in words; empty when the path is not one the panel can read. */
const placeOf = (path: string) => {
  try {
    return whereOf(path);
  } catch {
    return '';
  }
};

const monthText = (key: string) => {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
};

/** The figures the preview compares, in the order a farmer reads them. */
const SUMMARY_ROWS: { key: SummaryKey; label: string; show: (s: PlanSummary) => ReactNode }[] = [
  { key: 'monthlySalary', label: 'Salariul pe lună', show: (s) => <Money bani={s.monthlySalary} /> },
  { key: 'safeSalary', label: 'Cel mai mare salariu sigur', show: (s) => <Money bani={s.safeSalary} /> },
  { key: 'bindingMonth', label: 'Luna care îl limitează', show: (s) => monthText(s.bindingMonth) },
  { key: 'lowest', label: 'Cel mai jos în cont', show: (s) => <><Money bani={s.lowest.balance} as="signed" />, {monthText(s.lowest.key)}</> },
  { key: 'endBalance', label: 'La finalul planului', show: (s) => <Money bani={s.endBalance} as="signed" /> },
  { key: 'subsidy', label: 'Subvenția APIA', show: (s) => <><Money bani={s.subsidy.min} /> – <Money bani={s.subsidy.max} /></> },
  { key: 'credit', label: 'Creditul sugerat', show: (s) => (s.credit ? <Money bani={s.credit} /> : 'niciunul') },
  { key: 'salaryAfterBadHarvest', label: 'Salariul după un an slab', show: (s) => (s.salaryAfterBadHarvest === null ? '—' : <Money bani={s.salaryAfterBadHarvest} />) },
  { key: 'pensionAtTarget', label: 'Pensia strânsă la vârsta țintă', show: (s) => (s.pensionAtTarget === null ? '—' : <Money bani={s.pensionAtTarget} />) },
];

export default function Admin() {
  const predictions = usePredictions();
  const store = useStore()!;
  const online = useOnline();
  const href = useHref();
  if (!predictions.admin)
    return (
      <>
        <header className="page-h">
          <div>
            <h1>Cifrele calculelor</h1>
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

function Panel({ store }: { store: NonNullable<ReturnType<typeof useStore>> }) {
  const predictions = usePredictions();
  const online = useOnline();
  const { notify } = useContext(FrameContext);
  const href = useHref();
  const published = predictions.overrides;
  const rows = useMemo(() => factorRows(published), [published]);

  /* The draft is saved on every change, so it survives a closed tab or no internet. */
  const [draft, setDraftState] = useState<Draft>(() => readDraft(store.keyStore) ?? { base: predictions.version, edits: {} });
  const setDraft = useCallback(
    (next: Draft) => {
      setDraftState(next);
      if (Object.keys(next.edits).length) saveDraft(store.keyStore, next);
      else clearDraft(store.keyStore);
    },
    [store],
  );
  const changes = useMemo(() => draftChanges(rows, draft.edits), [rows, draft.edits]);
  const set = useMemo(() => draftSet(rows, published, draft.edits), [rows, published, draft.edits]);
  const checked = useMemo(() => (changes.length ? checkSet(set) : null), [changes.length, set]);
  const reasonsOk = changes.every((c) => c.backToFile || !reasonError(c.reason));

  const [who, setWho] = useState<'mine' | 'ion'>('mine');
  const preview = useMemo(() => {
    if (!checked?.ok) return null;
    const now = new Date();
    const ion = who === 'ion';
    return comparePlans(planSideOf(store.previewState(store.publishedData(), ion), now), planSideOf(store.previewState(checked.data, ion), now));
  }, [checked, who, store]);

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [history, setHistory] = useState<VersionInfo[] | null>(null);
  const [historyErr, setHistoryErr] = useState('');
  const loadHistory = useCallback(async () => {
    try {
      const r = await store.adminCall<{ versions: VersionInfo[] }>('/api/admin/versions');
      setHistory(r.versions);
      setHistoryErr('');
    } catch {
      setHistoryErr('Istoricul nu s-a putut citi acum.');
    }
  }, [store]);
  useEffect(() => {
    if (online) void loadHistory();
  }, [online, loadHistory]);

  const putInDraft = (path: string, value: OverrideValue, reason: string) => {
    const edits = { ...draft.edits, [path]: { value, reason } };
    const row = rows.find((r) => r.path === path);
    /* Typing the figure in force again is no change at all. */
    if (row && row.value === value) delete edits[path];
    setDraft({ base: Object.keys(draft.edits).length ? draft.base : predictions.version, edits });
    setEditing(null);
  };
  const dropFromDraft = (path: string) => {
    const edits = { ...draft.edits };
    delete edits[path];
    setDraft({ ...draft, edits });
  };

  /** Publishes a whole set as a new version. Never queued: offline the button is off. */
  async function send(path: string, body: object, done: string) {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const { version } = await store.adminCall<{ version: number }>(path, { method: 'POST', timeout: 'write', body: JSON.stringify({ baseVersion: predictions.version, ...body }) });
      setDraft({ base: version, edits: {} });
      setNote('');
      notify({ tone: 'info', title: done, body: `Versiunea ${version} e în vigoare pentru toate fermele cu cont.` });
      await store.refreshPredictions();
      void loadHistory();
    } catch (e) {
      const clash = e as { status?: number; body?: { current?: number; sameAsYours?: boolean } };
      if (clash.status === 409) {
        await store.refreshPredictions();
        if (clash.body?.sameAsYours) {
          setDraft({ base: clash.body.current ?? predictions.version, edits: {} });
          setNote('');
          notify({ tone: 'info', title: done, body: `Versiunea ${clash.body.current} e în vigoare.` });
        } else setErr(`Altcineva a publicat versiunea ${clash.body?.current ?? ''} între timp. Cifrele s-au actualizat; verifică ciorna și publică iar.`);
        void loadHistory();
      } else setErr(publishErrorText(e));
    } finally {
      setBusy(false);
    }
  }
  const publish = () => void send('/api/admin/publish', { note: note.trim(), overrides: set }, 'Am publicat cifrele');
  const backToFiles = () => {
    if (confirm('Toate fermele cu cont trec înapoi pe cifrele din surse. Continui?')) void send('/api/admin/publish', { note: 'Înapoi la cifrele din surse', overrides: [] }, 'Cifrele din surse sunt iar în vigoare');
  };
  const revert = (v: number) => {
    if (confirm(`Toate fermele cu cont trec pe cifrele versiunii ${v}. Continui?`)) void send(`/api/admin/revert/${v}`, {}, `Versiunea ${v} e iar în vigoare`);
  };

  const words = search.trim().toLocaleLowerCase('ro').split(/\s+/).filter(Boolean);
  const shown = words.length ? rows.filter((r) => words.every((w) => `${r.factor.label} ${r.where} ${r.path}`.toLocaleLowerCase('ro').includes(w))) : rows;
  const groups = (Object.keys(FACTOR_GROUPS) as FactorGroup[]).map((g) => ({ g, rows: shown.filter((r) => r.factor.group === g) })).filter((x) => x.rows.length);
  const canPublish = changes.length > 0 && !!checked?.ok && reasonsOk && note.trim().length > 0 && !busy;

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Cifrele calculelor</h1>
          <p className="lead">
            Din aceste cifre se calculează salariul, subvenția și pensia. Ce publici aici se aplică tuturor fermelor cu cont, inclusiv la plata prin Stripe. Ferma lui Ion fără cont rămâne pe cifrele din surse.
          </p>
        </div>
      </header>
      <OfflineNote>Nu ai internet. Poți lucra la ciornă; o publici când revii online.</OfflineNote>
      <p className="adm-status">
        <PageLink path="/verificari" href={href('/verificari')}>
          De verificat
        </PageLink>
        : cifrele încă nesigure, presupunerile și întrebările deschise, cu răspunsurile date.
      </p>
      <p className="adm-status">
        {predictions.version === 0 || published.length === 0 ? (
          <>Acum se folosesc cifrele din surse{predictions.version ? ` (versiunea ${predictions.version})` : ''}.</>
        ) : (
          <>
            În vigoare: versiunea {predictions.version}, cu {published.length === 1 ? 'o cifră schimbată' : `${published.length} cifre schimbate`}.
          </>
        )}
      </p>

      <div className="adm">
        <section className="adm-list" aria-label="Cifrele">
          <label className="ob-field adm-search">
            Caută o cifră
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="de exemplu grâu preț" autoComplete="off" />
          </label>
          {groups.length === 0 && <p className="note">Nicio cifră nu se potrivește.</p>}
          {groups.map(({ g, rows: list }) => (
            <details className="card adm-group" key={g} open={words.length > 0 || undefined}>
              <summary>
                <h2>{FACTOR_GROUPS[g]}</h2>
                <span className="note">
                  {list.length} {list.length === 1 ? 'cifră' : 'cifre'}
                  {list.some((r) => r.reason !== null) && ' · unele schimbate'}
                </span>
              </summary>
              <ul className="adm-rows">
                {list.map((r) => (
                  <FactorItem
                    key={r.path}
                    row={r}
                    inDraft={draft.edits[r.path]}
                    open={editing === r.path}
                    onOpen={() => setEditing(r.path)}
                    onClose={() => setEditing(null)}
                    onSave={(value, reason) => putInDraft(r.path, value, reason)}
                  />
                ))}
              </ul>
            </details>
          ))}
        </section>

        <aside className="adm-side">
          <section className="card adm-draft" aria-live="polite">
            <h2>Ce schimbi</h2>
            {changes.length === 0 ? (
              <p className="note">Nicio cifră în ciornă. Apasă „Schimbă” lângă o cifră.</p>
            ) : (
              <>
                {draft.base !== predictions.version && (
                  <p className="note adm-warn">Ciorna a pornit de la versiunea {draft.base}; acum e în vigoare versiunea {predictions.version}. Verifică cifrele înainte să publici.</p>
                )}
                <ul className="adm-changes">
                  {changes.map((c) => (
                    <li key={c.row.path}>
                      <b>
                        {c.row.factor.label}
                        {c.row.where && <span className="note"> · {c.row.where}</span>}
                      </b>
                      <span>
                        {showValue(c.row.factor, c.before)} → <b>{showValue(c.row.factor, c.after)}</b>
                        {c.backToFile && <span className="tag n">cifra din sursă</span>}
                      </span>
                      {!c.backToFile && <span className="note">De ce: {c.reason}</span>}
                      <button type="button" className="link" onClick={() => dropFromDraft(c.row.path)}>
                        Scoate din ciornă
                      </button>
                    </li>
                  ))}
                </ul>
                {checked && !checked.ok && (
                  <ErrorLine>
                    {checked.error}
                    {placeOf(checked.path) && ` (${placeOf(checked.path)})`}
                  </ErrorLine>
                )}
              </>
            )}
          </section>

          {preview && (
            <section className="card adm-preview">
              <div className="adm-who" role="group" aria-label="Pe ce fermă">
                <button type="button" className={who === 'mine' ? 'btn btn-dark' : 'btn btn-line'} aria-pressed={who === 'mine'} onClick={() => setWho('mine')}>
                  Ferma mea
                </button>
                <button type="button" className={who === 'ion' ? 'btn btn-dark' : 'btn btn-line'} aria-pressed={who === 'ion'} onClick={() => setWho('ion')}>
                  Ferma lui Ion
                </button>
              </div>
              <h2>{who === 'ion' ? 'Cum arată salariul lui Ion' : 'Cum arată salariul tău'}</h2>
              <p className="note">Calculat pe telefon, fără să se salveze nimic. Așa îl va calcula și serverul.</p>
              <CompareChart months={preview.months} moved={preview.monthsMoved} />
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col">Acum</th>
                    <th scope="col">Cu ciorna</th>
                  </tr>
                </thead>
                <tbody>
                  {SUMMARY_ROWS.map(({ key, label, show }) => (
                    <tr key={key} className={preview.changed.includes(key) ? 'moved' : undefined}>
                      <th scope="row">{label}</th>
                      <td>{show(preview.before)}</td>
                      <td>{show(preview.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.changed.length === 0 && <p className="note">Pe ferma asta, ciorna nu schimbă nimic din cifrele de mai sus.</p>}
            </section>
          )}

          {changes.length > 0 && (
            <section className="card adm-publish">
              <label className="ob-field">
                Ce s-a schimbat, pe scurt
                <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="de exemplu Prețuri noi la grâu, nov. 2026" autoComplete="off" />
              </label>
              {!reasonsOk && <ErrorLine>Fiecare cifră schimbată are nevoie de motiv.</ErrorLine>}
              <ErrorLine>{err}</ErrorLine>
              <div className="adm-acts">
                <NetButton reason={PUBLISH_NET} className="btn btn-dark" disabled={!canPublish} onClick={publish}>
                  {busy ? 'Se publică…' : 'Publică'}
                </NetButton>
                <button type="button" className="btn btn-line" disabled={busy} onClick={() => (setDraft({ base: predictions.version, edits: {} }), setErr(''))}>
                  Aruncă ciorna
                </button>
              </div>
            </section>
          )}

          <section className="card adm-history">
            <h2>Versiunile publicate</h2>
            {!online ? (
              <p className="note">{HISTORY_NET}</p>
            ) : historyErr ? (
              <ErrorLine>{historyErr}</ErrorLine>
            ) : !history ? (
              <p className="note">Se încarcă…</p>
            ) : history.length === 0 ? (
              <p className="note">Nimic publicat încă. Se folosesc cifrele din surse.</p>
            ) : (
              <ol className="adm-versions">
                {history.map((v) => (
                  <VersionItem key={v.version} v={v} current={v.version === predictions.version} busy={busy} onRevert={() => revert(v.version)} store={store} />
                ))}
              </ol>
            )}
            {changes.length === 0 && <ErrorLine>{err}</ErrorLine>}
            {published.length > 0 && (
              <NetButton reason={PUBLISH_NET} className="btn btn-line" disabled={busy} onClick={backToFiles}>
                Înapoi la cifrele din surse
              </NetButton>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

/** One figure: what it is, the value in force, the source's, why it changed, and its editor. */
function FactorItem({ row, inDraft, open, onOpen, onClose, onSave }: { row: FactorRow; inDraft?: { value: OverrideValue; reason: string }; open: boolean; onOpen: () => void; onClose: () => void; onSave: (v: OverrideValue, reason: string) => void }) {
  const { factor } = row;
  const changed = row.value !== row.fileValue;
  return (
    <li className={open ? 'adm-row open' : 'adm-row'}>
      <div className="adm-row-h">
        <div>
          <b>{factor.label}</b>
          {row.where && <span className="note"> · {row.where}</span>}
          <p className="adm-vals">
            <span>{showValue(factor, row.value)}</span>
            {changed && <span className="tag v">schimbată</span>}
            {inDraft && <span className="tag d">în ciornă: {showValue(factor, inDraft.value)}</span>}
            {changed && <span className="note">În sursă: {showValue(factor, row.fileValue)}</span>}
          </p>
          {row.reason && <p className="note">De ce: {row.reason}</p>}
        </div>
        {!open && (
          <button type="button" className="btn btn-line" onClick={onOpen} aria-label={`Schimbă: ${factor.label}${row.where ? `, ${row.where}` : ''}`}>
            Schimbă
          </button>
        )}
      </div>
      {open && <Editor row={row} start={inDraft} onClose={onClose} onSave={onSave} />}
    </li>
  );
}

function Editor({ row, start, onClose, onSave }: { row: FactorRow; start?: { value: OverrideValue; reason: string }; onClose: () => void; onSave: (v: OverrideValue, reason: string) => void }) {
  const { factor } = row;
  const first = start?.value ?? row.value;
  const [text, setText] = useState(fieldText(first));
  const [flag, setFlag] = useState(first === true);
  const [reason, setReason] = useState(start?.reason ?? '');
  const [tried, setTried] = useState(false);
  const parsed = parseValue(factor, factor.type === 'boolean' ? flag : text);
  const backToFile = parsed.ok && parsed.value === row.fileValue;
  const whyErr = backToFile ? null : reasonError(reason);
  const label = `${factor.label}${factor.type === 'number' && factor.unit ? `, ${factor.unit}` : ''}`;
  const save = () => {
    setTried(true);
    if (parsed.ok && !whyErr) onSave(parsed.value, backToFile ? '' : reason.trim());
  };
  const options = factor.type === 'choice' ? factor.options.map((o) => [o, factor.optionLabels?.[o] ?? o]) : factor.type === 'key' ? keyOptions(factor).map((o) => [o, o]) : [];
  return (
    <form
      className="adm-edit"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {factor.type === 'boolean' ? (
        <label className="adm-check">
          <input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} />
          {factor.label}
        </label>
      ) : options.length ? (
        <label className="ob-field">
          {label}
          <select value={text} onChange={(e) => setText(e.target.value)}>
            {options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="ob-field">
          {label}
          <input inputMode={factor.type === 'number' && factor.decimals ? 'decimal' : 'numeric'} autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          {factor.type === 'number' && factor.nullable && <small className="note">Gol înseamnă „fără cifră”.</small>}
        </label>
      )}
      {!parsed.ok && (tried || text !== fieldText(first)) && <ErrorLine>{parsed.error}</ErrorLine>}
      {!backToFile && (
        <label className="ob-field">
          De unde vine cifra
          <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="de exemplu Agro-Info, nov. 2026" autoComplete="off" />
        </label>
      )}
      {tried && whyErr && <ErrorLine>{whyErr}</ErrorLine>}
      <div className="adm-acts">
        <button type="submit" className="btn btn-dark">
          Pune în ciornă
        </button>
        {row.value !== row.fileValue && (
          <button type="button" className="btn btn-line" onClick={() => onSave(row.fileValue, '')}>
            Înapoi la cifra din sursă
          </button>
        )}
        <button type="button" className="btn btn-line" onClick={onClose}>
          Renunță
        </button>
      </div>
    </form>
  );
}

/** One published version; it can show its changes and be put back in force. */
function VersionItem({ v, current, busy, onRevert, store }: { v: VersionInfo; current: boolean; busy: boolean; onRevert: () => void; store: NonNullable<ReturnType<typeof useStore>> }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Override[] | null>(null);
  const [failed, setFailed] = useState(false);
  const toggle = async () => {
    setOpen((o) => !o);
    if (items || open) return;
    try {
      setItems((await store.adminCall<{ overrides: Override[] }>(`/api/admin/versions/${v.version}`)).overrides);
    } catch {
      setFailed(true);
    }
  };
  const rows = useMemo(() => (items ? factorRows(items).filter((r) => r.reason !== null) : []), [items]);
  return (
    <li className="adm-version">
      <div className="adm-row-h">
        <div>
          <b>Versiunea {v.version}</b> {current && <span className="tag v">în vigoare</span>}
          <p className="note">
            {date(v.publishedAt.slice(0, 10), true)} · {v.note}
          </p>
        </div>
        <div className="adm-acts">
          <button type="button" className="link" aria-expanded={open} onClick={() => void toggle()}>
            {open ? 'Ascunde' : 'Vezi cifrele'}
          </button>
          {!current && (
            <NetButton reason={PUBLISH_NET} className="btn btn-line" disabled={busy} onClick={onRevert}>
              Înapoi la asta
            </NetButton>
          )}
        </div>
      </div>
      {open &&
        (failed ? (
          <ErrorLine>Nu s-au putut citi cifrele versiunii.</ErrorLine>
        ) : !items ? (
          <p className="note">Se încarcă…</p>
        ) : rows.length === 0 ? (
          <p className="note">Cifrele din surse, fără nicio schimbare.</p>
        ) : (
          <ul className="adm-changes">
            {rows.map((r) => (
              <li key={r.path}>
                <b>
                  {r.factor.label}
                  {r.where && <span className="note"> · {r.where}</span>}
                </b>
                <span>
                  {showValue(r.factor, r.fileValue)} → <b>{showValue(r.factor, r.value)}</b>
                </span>
                <span className="note">De ce: {r.reason}</span>
              </li>
            ))}
          </ul>
        ))}
    </li>
  );
}
