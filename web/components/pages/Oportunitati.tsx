'use client';
/* "Oportunități": search_opportunities, list_opportunity_changes, follow_opportunity, unfollow_opportunity
   (was web/legacy/oportunitati.js). Signed in, the calls come from the monitor and a copy stays on the
   phone. Signed out, a dated snapshot. How a call fits the farm uses the same rules as
   match_opportunities, so it works for any farm offline. Conditions come only from
   docs/data/funding-guides.json, or the page says to check the guide. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { date, daysLeft, eurShort, failText, group as groupDigits, zile } from '../../lib/cc/format';
import { callCode, callName, VARIANT, type PageCall } from '../../lib/cc/monitor';
import { useFarm, useMonitor, useMonitorRefresh, useOnline, useStore, useView } from '../../lib/cc/react';
import { pageFits, type PageFit } from '../../lib/live/monitor';
import { CHEVRON, ErrorLine, Icon, NetButton, OfflineNote, Sheet, useHref } from '../app/bits';
import { PageLink, SubNav } from '../app/Frame';

const KIND: Record<string, string> = { afir: 'AFIR', mipe: 'Fonduri europene', ec: 'Comisia Europeană' };
const CHANGE: Record<string, string> = { new: 'Apel nou', removed: 'A dispărut din listă înainte de termen', status: 'Și-a schimbat starea' };
const GOOD: Record<string, string> = { for_farmers: 'Fermierii pot depune direct', small_farms: 'E pentru ferme mici' };
const DOUBT: Record<string, string> = {
  needs_company: 'Cere PFA sau firmă',
  firms_only: 'E pentru firme. Depinde de forma juridică și de activitate',
  institutions_only: 'E pentru instituții și autorități',
  partnership: 'Cere de obicei parteneri din mai multe țări',
  other_region: 'E pentru altă regiune',
  other_sector: 'E pentru alt fel de fermă',
  young_farmers: 'E pentru tinerii fermieri',
  check_who: 'Tema e agricolă, dar sursa nu spune cine poate depune',
  not_for_farms: 'Nu pare să fie pentru o fermă ca a ta',
  low_confidence: 'Datele despre acest apel sunt incomplete',
};
const RULED_OUT = ['age_limit', 'other_region', 'other_sector', 'partnership', 'institutions_only', 'not_for_farms'];
const VIEWS = [
  ['fit', 'Pentru ferma ta'],
  ['soon', 'Se închid curând'],
  ['new', 'Ce e nou'],
  ['mine', 'În calendar'],
  ['all', 'Toate'],
] as const;
type ViewName = (typeof VIEWS)[number][0];
const PAGE_SIZE = 30;
const NEEDS_NET = 'Pornește internetul ca să schimbi calendarul.';

type Reason = PageFit['good'][number];
type Fit = Pick<PageFit, 'level' | 'good' | 'doubts'> & { why: string };
interface Row {
  key: string;
  name: string;
  deadline: string | null;
  status: string;
  kind: string;
  fit: Fit;
  calls: PageCall[];
}

function variantLabel(c: PageCall) {
  const m = c.title.match(/(Adulți|Tineri)\s*$/);
  if (m) return m[1];
  if (/regiunile mai dezvoltate\s*$/.test(c.title)) return 'Regiuni mai dezvoltate';
  return (c.region || 'Toată țara').replace('putin', 'puțin').replace('nationala', 'națională');
}
const says = (r: Reason) => (r.code === 'age_limit' ? `Limita de vârstă e ${r.vars?.limit} de ani` : r.code === 'closes_soon' ? `Mai sunt ${zile(Number(r.vars?.days))}` : (GOOD[r.code] ?? DOUBT[r.code] ?? ''));
const dosare = (n: number) => (n === 1 ? '1 dosar depus' : `${groupDigits(n)} ${n % 100 >= 20 || n % 100 === 0 ? 'de ' : ''}dosare depuse`);
const stillOpen = (r: Row, today: string) => !r.deadline || daysLeft(r.deadline, today) >= 0;

function factsOf(r: Row, today: string) {
  const c = r.calls[0];
  const money = r.calls.every((x) => x.budgetEur != null) ? eurShort(r.calls.reduce((s, x) => s + (x.budgetEur ?? 0), 0)) : null;
  return { deadline: c.deadline, days: c.deadline ? daysLeft(c.deadline, today) : null, money, filed: c.filed, filedEur: c.filedEur };
}

function Deadline({ iso, today }: { iso: string | null; today: string }) {
  if (!iso)
    return (
      <span className="dl">
        <small>Fără termen</small>
      </span>
    );
  const d = daysLeft(iso, today);
  return (
    <span className={`dl${d <= 14 ? ' soon' : ''}`}>
      <b>{d === 0 ? 'Azi' : d === 1 ? 'Mâine' : d < 60 ? zile(d) : date(iso)}</b>
      <small>{d < 60 ? date(iso) : iso.split('-')[0]}</small>
    </span>
  );
}

function Tile({ label, value, sub, className }: { label: string; value: ReactNode; sub?: string; className?: string }) {
  return (
    <div className={className}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export default function Oportunitati() {
  useMonitorRefresh();
  const farmView = useView('farm')!;
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const monitor = useMonitor();
  const href = useHref();
  const onServer = !!farm.me;
  const today = farmView.today;
  const data = farmView.data();
  const CALLS = monitor.calls;
  const EVENTS = monitor.events;
  const follows = monitor.follows;

  const rows = useMemo(() => {
    const fits = pageFits(CALLS, farmView.farm, data, today);
    const fitOf = (c: PageCall): Fit => {
      const fit = fits[c.key];
      if (!fit) return { level: 'no', why: 'Apelul s-a închis.', good: [], doubts: [] } as Fit;
      const first = fit.level === 'no' ? fit.doubts.find((d) => RULED_OUT.includes(d.code)) : (fit.doubts[0] ?? fit.good[0]);
      return { ...fit, why: first ? `${says(first)}.` : '' };
    };
    /* Near-identical calls become one row. Each one stays visible in the detail. */
    const merged = new Map<string, Row>();
    for (const c of CALLS) {
      const fit = fitOf(c);
      const id = `${c.title.replace(VARIANT, '')}|${c.deadline}|${fit.level}`;
      if (!merged.has(id)) merged.set(id, { key: c.key, name: callName(c), deadline: c.deadline, status: c.status, kind: c.kind, fit, calls: [] });
      merged.get(id)!.calls.push(c);
    }
    return [...merged.values()].sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9'));
  }, [CALLS, farmView.farm, data, today]);

  const level = (l: string) => rows.filter((r) => r.fit.level === l);
  const near = level('near');
  const check = level('check');
  const firm = level('firm');
  const soon = rows.filter((r) => r.deadline && daysLeft(r.deadline, today) >= 0 && daysLeft(r.deadline, today) <= 30);
  const followed = (r: Row) => r.calls.some((c) => follows.has(c.key));
  /* Best fit first, then the earliest deadline (rows are already sorted by it). A closed call can't be the next step. */
  const closest = (() => {
    for (const list of [near, check, firm]) {
      const live = list.filter((r) => stillOpen(r, today));
      if (live.length) return live.find((r) => r.deadline) ?? live[0];
    }
    return null;
  })();

  const [tab, setTab] = useState<ViewName>('fit');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [firmOpen, setFirmOpen] = useState(false);
  const [filter, setFilter] = useState({ text: '', kind: '', status: '', days: '', eur: '0' });
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const detail = rows.find((r) => r.key === detailKey) ?? null;
  /* A row on Acasă opens its own call here. Near-identical calls share a row, so any of them finds it. */
  const openedFromHash = useRef(false);
  useEffect(() => {
    if (openedFromHash.current || !rows.length || !location.hash) return;
    openedFromHash.current = true;
    const wanted = decodeURIComponent(location.hash.slice(1));
    const row = rows.find((r) => r.calls.some((c) => c.key === wanted));
    if (row) setDetailKey(row.key);
  }, [rows]);
  const setF = (k: keyof typeof filter, v: string) => {
    setFilter((x) => ({ ...x, [k]: v }));
    setShown(PAGE_SIZE);
  };
  const filterCount = [filter.kind, filter.status, filter.days, filter.eur].filter((v) => v && v !== '0').length;
  const matches = (r: Row) => {
    const text = filter.text.trim().toLowerCase();
    const days = +filter.days;
    const money = r.calls.reduce((s, c) => s + (c.budgetEur ?? 0), 0);
    return (
      (!text || `${r.name} ${r.calls.map((c) => `${c.title} ${c.programme}`).join(' ')}`.toLowerCase().includes(text)) &&
      (!filter.kind || r.kind === filter.kind) &&
      (!filter.status || r.status === filter.status) &&
      (!days || (!!r.deadline && daysLeft(r.deadline, today) <= days)) &&
      (+filter.eur === 0 || money >= +filter.eur)
    );
  };
  const counts: Record<ViewName, number> = { fit: near.length + check.length + firm.length, soon: soon.length, new: EVENTS.length, mine: rows.filter(followed).length, all: rows.length };

  function rowView(r: Row, showWhy: boolean) {
    const f = factsOf(r, today);
    const parts = [f.money ? `${f.money} alocați` : '', f.filed != null ? dosare(f.filed) : ''].filter(Boolean);
    return (
      <button key={r.key} type="button" className="row" title={r.calls[0].title} onClick={() => setDetailKey(r.key)}>
        <span className="r-main">
          <b>{r.name}</b>
          {showWhy && <small>{r.fit.why}</small>}
          {parts.length > 0 && <small className="r-facts">{parts.join(' · ')}</small>}
        </span>
        <span className="r-side">
          {r.status === 'announced' && <span className="tag v">Anunțat</span>}
          {followed(r) && (
            <span className="in-cal" role="img" aria-label="În calendar" title="În calendar">
              <Icon name="cal" />
            </span>
          )}
        </span>
        <Deadline iso={r.deadline} today={today} />
      </button>
    );
  }
  /* A reason shared by the whole group is said once, in its heading. */
  function section({ title, list, total = list.length, note, why = true, closed = false }: { title: string; list: Row[]; total?: number; note?: string; why?: boolean; closed?: boolean }) {
    if (!list.length) return null;
    const same = why && list.every((r) => r.fit.why === list[0].fit.why);
    const body = <div className="rows">{list.map((r) => rowView(r, why && !same))}</div>;
    const lead = note || (same ? list[0].fit.why : '');
    const head = (
      <>
        <span className="g-t">
          {title} <span className="n">{total}</span>
        </span>
        {lead && <span className="g-n">{lead}</span>}
      </>
    );
    if (closed)
      return (
        <details className="group acc" open={firmOpen} onToggle={(e) => setFirmOpen(e.currentTarget.open)}>
          <summary>
            <span>{head}</span>
            <span className="cue">
              <span className="show">Arată</span>
              <span className="hide">Ascunde</span>
              {CHEVRON}
            </span>
          </summary>
          {body}
        </details>
      );
    return (
      <section className="group">
        <h3 className="g-h">{head}</h3>
        {body}
      </section>
    );
  }
  const empty = (text: string) => <p className="empty">{text}</p>;

  function list(): ReactNode {
    if (tab === 'fit') {
      /* The closest call is in the green card, so only the other close ones are listed here. */
      const otherNear = near.filter((r) => r !== closest && stillOpen(r, today));
      return (
        <>
          {section({ title: 'Tot aproape', list: otherNear })}
          {section({ title: 'De verificat', list: check })}
          {section({ title: 'Doar dacă ai o firmă', list: firm, closed: true })}
          {otherNear.length + check.length + firm.length === 0 && empty(closest ? 'Alte apeluri potrivite nu sunt acum.' : 'Nimic potrivit acum. Îți spunem când apare ceva.')}
        </>
      );
    }
    if (tab === 'soon')
      return (
        <>
          {section({ title: 'În următoarele 7 zile', list: soon.filter((r) => daysLeft(r.deadline!, today) <= 7) })}
          {section({ title: 'În următoarele 30 de zile', list: soon.filter((r) => daysLeft(r.deadline!, today) > 7) })}
          {!soon.length && empty('Nu se închide nimic în următoarele 30 de zile.')}
        </>
      );
    if (tab === 'new')
      return (
        <section className="card">
          {EVENTS.length
            ? EVENTS.map((e, i) => (
                <div className="reason" key={i}>
                  <b>{callName(e)}</b>
                  <small>
                    {CHANGE[e.field] ?? 'S-a schimbat'} · {KIND[e.kind] || ''} · {date(e.date, true)}
                  </small>
                </div>
              ))
            : empty('Nimic nou de la ultima verificare.')}
        </section>
      );
    if (tab === 'mine') {
      const mine = rows.filter(followed);
      return mine.length ? (
        <>
          {section({ title: 'Urmărești', list: mine, note: onServer ? '' : 'Salvate doar în acest browser.', why: false })}
          <p className="note gap">
            <PageLink path="/calendar" href={href('/calendar')}>
              Vezi calendarul
            </PageLink>
          </p>
        </>
      ) : (
        empty('N-ai pus niciun apel în calendar.')
      );
    }
    const found = rows.filter(matches);
    return (
      <>
        {found.length ? section({ title: 'Apeluri', list: found.slice(0, shown), total: found.length, why: false }) : empty('Nimic nu se potrivește cu ce ai ales.')}
        {found.length > shown && (
          <button type="button" className="btn btn-line more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Arată mai multe
          </button>
        )}
      </>
    );
  }

  const options = (rowsOf: [string, string][]) =>
    rowsOf.map(([v, l]) => (
      <option key={v} value={v}>
        {l}
      </option>
    ));

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Oportunități</h1>
          <p className="lead">Bani pentru investiții în fermă, din surse oficiale.</p>
        </div>
      </header>
      <SubNav page="/oportunitati" href={href} />
      <OfflineNote>Nu ai internet. Vezi ultima listă salvată, cu data ei jos.</OfflineNote>
      {/* The green card is the closest call and nothing else. With none open, the list below says so. */}
      {closest && (
        <section className="cta field verdict split" id="verdict">
          <div className="v-next">
            <p className="eyebrow">Cel mai aproape</p>
            <h2>{closest.name}</h2>
            <p>{closest.fit.why}</p>
            <div className="v-next-foot">
              <ul className="farm-strip">
                {closest.deadline ? (
                  <>
                    <li>{daysLeft(closest.deadline, today) === 0 ? 'Azi' : daysLeft(closest.deadline, today) === 1 ? 'Mâine' : `În ${zile(daysLeft(closest.deadline, today))}`}</li>
                    <li>{date(closest.deadline, true)}</li>
                  </>
                ) : (
                  <li>Fără termen</li>
                )}
                {followed(closest) && <li>În calendar</li>}
              </ul>
              <button type="button" className="see" onClick={() => setDetailKey(closest.key)}>
                Vezi detalii <Icon name="arrow" />
              </button>
            </div>
          </div>
        </section>
      )}
      <div className="vtabs" role="group" aria-label="Ce arăt">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            className="chip"
            aria-pressed={v === tab}
            onClick={(e) => {
              setTab(v);
              setShown(PAGE_SIZE);
              e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }}
          >
            {label}
            <span className="n">{counts[v]}</span>
          </button>
        ))}
      </div>
      {tab === 'all' && (
        <div className="find">
          <input type="search" placeholder="Caută un cuvânt" aria-label="Caută un cuvânt" value={filter.text} onChange={(e) => setF('text', e.target.value)} />{' '}
          <button type="button" className="btn btn-line" aria-controls="filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
            {'Filtre '}
            <span>{filterCount || ''}</span>
          </button>
        </div>
      )}
      {tab === 'all' && filtersOpen && (
        <div className="filters four" id="filters">
          <label>
            Program
            <select value={filter.kind} onChange={(e) => setF('kind', e.target.value)}>
              {options([['', 'Toate'], ['afir', 'AFIR'], ['mipe', 'Fonduri europene (MIPE)'], ['ec', 'Comisia Europeană']])}
            </select>
          </label>{' '}
          <label>
            Stare
            <select value={filter.status} onChange={(e) => setF('status', e.target.value)}>
              {options([['', 'Toate'], ['open', 'Deschis'], ['announced', 'Anunțat']])}
            </select>
          </label>{' '}
          <label>
            Termen
            <select value={filter.days} onChange={(e) => setF('days', e.target.value)}>
              {options([['', 'Oricând'], ['30', 'Sub 30 de zile'], ['90', 'Sub 90 de zile']])}
            </select>
          </label>{' '}
          <label>
            Bani alocați
            <select value={filter.eur} onChange={(e) => setF('eur', e.target.value)}>
              {options([['0', 'Oricât'], ['1000000', 'Peste 1 mil. €'], ['10000000', 'Peste 10 mil. €']])}
            </select>
          </label>
        </div>
      )}
      <div>{list()}</div>
      {monitor.at && (
        <p className="note gap">
          Date din {date(monitor.at, true)}
          {monitor.fromServer ? '' : ', salvate în aplicație'}. E un prim filtru: verifică la instituție înainte să te bazezi pe el.
        </p>
      )}
      {detail && <Detail key={detail.key} today={today} r={detail} on={followed(detail)} at={monitor.at} onServer={onServer} onClose={() => setDetailKey(null)} follows={follows} store={store} online={online} guides={data.fundingGuides.guides} />}
    </>
  );
}

const MARK = { ok: 'Da', no: 'Nu', q: 'De verificat' } as const;

function Detail({
  r,
  on,
  at,
  onServer,
  onClose,
  follows,
  store,
  online,
  guides,
  today,
}: {
  r: Row;
  on: boolean;
  at: string | null;
  onServer: boolean;
  onClose: () => void;
  follows: Set<string>;
  store: NonNullable<ReturnType<typeof useStore>>;
  online: boolean;
  guides: { code: string; url: string; title: string; facts: { text: string; page: number }[] }[];
  today: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = r.calls[0];
  const guide = guides.find((g) => g.code === callCode(c));
  const f = factsOf(r, today);
  const left = f.days !== null && f.days >= 0;
  const doubt = (d: Reason): [keyof typeof MARK, string] => [RULED_OUT.includes(d.code) || d.code === 'needs_company' ? 'no' : 'q', says(d)];
  const listed: [keyof typeof MARK, string][] = [...r.fit.good.filter((g) => g.code !== 'closes_soon').map((g): [keyof typeof MARK, string] => ['ok', says(g)]), ...r.fit.doubts.map(doubt)];
  const checks = listed.length ? listed : ([['q', r.fit.why]] as [keyof typeof MARK, string][]);
  const fact = (k: string, v: ReactNode) =>
    v ? (
      <>
        <dt>{k}</dt>
        <dd>{v}</dd>
      </>
    ) : null;
  async function toggle() {
    setBusy(true);
    setErr(null);
    try {
      await store.setFollow(
        r.calls.map((x) => x.key).filter((k) => follows.has(k) === on),
        !on,
      );
      onClose();
    } catch (e) {
      setBusy(false);
      setErr(navigator.onLine ? failText(e, online) : NEEDS_NET);
    }
  }
  const followLabel = on ? 'Scoate din calendar' : 'Pune în calendar';
  return (
    <Sheet open onClose={onClose} className="detail" label={r.name}>
      <div className="top">
        <div>
          <h2 tabIndex={-1} autoFocus>
            {r.name}
          </h2>
          {r.calls.length === 1 && c.title !== r.name && <p className="official">{c.title}</p>}
        </div>
        <button type="button" className="x" aria-label="Închide" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="key-facts">
        <Tile label="Termen" value={f.deadline ? date(f.deadline, true) : 'Nepublicat'} sub={left ? `mai sunt ${zile(f.days!)}` : undefined} className={left && f.days! <= 14 ? 'soon' : undefined} />
        {f.money && <Tile label="Bani alocați" value={f.money} />}
        {f.filed != null && <Tile label="Dosare depuse" value={groupDigits(f.filed)} sub={f.filedEur != null && at ? `în valoare de ${eurShort(f.filedEur)}, la ${date(at)}` : undefined} />}
      </div>
      <h3>Pentru ferma ta</h3>
      <ul className="checks">
        {checks.map(([kind, text], i) => (
          <li key={i}>
            <span className={`mk ${kind}`} role="img" aria-label={MARK[kind]}>
              {kind === 'ok' ? <Icon name="check" /> : kind === 'no' ? '×' : '?'}
            </span>
            {text}
          </li>
        ))}
      </ul>
      {r.calls.length > 1 && (
        <>
          <h3>Variante</h3>
          <div className="variants">
            {r.calls.map((x) => (
              <a key={x.key} href={x.url} rel="noopener" target="_blank">
                <span>{variantLabel(x)}</span>
                <b>{x.budgetEur != null ? eurShort(x.budgetEur) : ''}</b>
              </a>
            ))}
          </div>
        </>
      )}
      {guide && (
        <details className="fold" open>
          <summary>Din ghid{CHEVRON}</summary>
          <ul>
            {guide.facts.map((x, i) => (
              <li key={i}>
                {x.text} (pagina {x.page})
              </li>
            ))}
          </ul>
          <p className="note">
            <a href={guide.url} rel="noopener" target="_blank">
              {guide.title}
            </a>
          </p>
        </details>
      )}
      <details className="fold" open>
        <summary>Alte detalii{CHEVRON}</summary>
        <dl className="facts">
          {fact('Program', c.programme)}
          {fact('Instituția', KIND[c.kind])}
          {fact('Stare', c.status === 'announced' ? 'Anunțat' : 'Deschis')}
          {fact('Se deschide', c.openDate ? date(c.openDate, true) : '')}
          {fact('Zona', r.calls.length === 1 ? variantLabel(c) : '')}
          {fact('Cine poate depune', c.applicants || 'Sursa nu spune. Verifică în ghid.')}
          {c.confidence === 'low' && fact('Atenție', 'Datele despre acest apel sunt incomplete.')}
        </dl>
      </details>
      <div className="acts">
        {onServer ? (
          <NetButton reason={NEEDS_NET} className="btn btn-dark" disabled={busy} onClick={() => void toggle()}>
            {followLabel}
          </NetButton>
        ) : (
          <button type="button" className="btn btn-dark" disabled={busy} onClick={() => void toggle()}>
            {followLabel}
          </button>
        )}
        <a className="btn btn-line" href={c.url} rel="noopener" target="_blank">
          Vezi la sursă
        </a>
        <ErrorLine>{err}</ErrorLine>
      </div>
    </Sheet>
  );
}
