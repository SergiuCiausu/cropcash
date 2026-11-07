import { useState, type ReactNode } from 'react';
import {
  followOpportunity,
  unfollowOpportunity,
  type MatchReason,
  type OpportunityMatch,
  type OpportunityRow,
  type StoredPassage,
  type StoredSource,
} from '@cropcash/shared';
import { t } from '../../i18n';
import { Sheet } from '../../components/ui';
import { callWrite } from '../../functions/call';
import { formatDayMonth, formatDayMonthYear, formatEuroCents } from '../../lib/format';
import { useSavedRead, type ReadState } from '../../lib/savedRead';

const HOME_ROWS = 3;

interface Match {
  forYou: OpportunityMatch[];
  check: OpportunityMatch[];
}
type Detail = (OpportunityRow & { evidence: string | null; good: MatchReason[]; doubts: MatchReason[]; following: boolean }) | null;
interface OfficialChange {
  id: number;
  institution: string;
  title: string;
  kind: string;
  date: string;
  url: string;
}
interface CallChange {
  key: string;
  title: string;
  field: string;
  to: string | null;
  date: string;
  url: string;
}

const reasonText = (r: MatchReason) => t(`opportunities.reasons.${r.code}`, r.vars);

/** Loading, no internet and old copies look the same everywhere. */
function Loaded<T>({ read, children }: { read: ReadState<T>; children: (data: T) => ReactNode }) {
  if (read.status === 'loading') return <p className="muted">{t('common.wait')}</p>;
  if (read.status === 'offline') return <p className="muted">{t('opportunities.offline')}</p>;
  if (read.status === 'failed') return <p className="muted">{t('opportunities.failed')}</p>;
  return (
    <>
      {read.status === 'saved' && <p className="muted">{t('opportunities.savedAt', { date: formatDayMonth(read.savedAt.slice(0, 10)) })}</p>}
      {children(read.data as T)}
    </>
  );
}

function closes(o: Pick<OpportunityRow, 'status' | 'deadline' | 'openDate'>) {
  if (o.status === 'announced' && o.openDate) return t('opportunities.opens', { date: formatDayMonth(o.openDate) });
  return o.deadline ? t('opportunities.closes', { date: formatDayMonth(o.deadline) }) : t('opportunities.noDate');
}

function Rows({ rows, onOpen }: { rows: (OpportunityRow & Partial<Pick<OpportunityMatch, 'doubts'>>)[]; onOpen: (key: string) => void }) {
  return (
    <ul className="opp-list">
      {rows.map((o) => (
        <li key={o.key}>
          <button type="button" onClick={() => onOpen(o.key)}>
            <b>{o.title}</b>
            <small>{closes(o)}</small>
            {o.doubts?.[0] && <small className="opp-doubt">{reasonText(o.doubts[0])}</small>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** On the home screen: the few calls that fit best. */
export function OpportunitiesCard({ onOpen, className = '' }: { onOpen: (key?: string) => void; className?: string }) {
  const read = useSavedRead<Match>('match_opportunities', {});
  return (
    <section className={`card ${className}`}>
      <div className="card-h">
        <h2>{t('opportunities.title')}</h2>
        <button type="button" className="linkbtn" onClick={() => onOpen()}>
          {t('opportunities.seeAll')}
        </button>
      </div>
      <Loaded read={read}>
        {(m) =>
          m.forYou.length > 0 ? (
            <Rows rows={m.forYou.slice(0, HOME_ROWS)} onOpen={onOpen} />
          ) : (
            <p className="muted">{t('opportunities.noneForYou')}</p>
          )
        }
      </Loaded>
    </section>
  );
}

function ForYou({ onOpen }: { onOpen: (key: string) => void }) {
  const read = useSavedRead<Match>('match_opportunities', {});
  return (
    <Loaded read={read}>
      {(m) => (
        <>
          {m.forYou.length > 0 ? <Rows rows={m.forYou} onOpen={onOpen} /> : <p className="muted">{t('opportunities.noneForYou')}</p>}
          {m.check.length > 0 && (
            <>
              <p className="field-l">{t('opportunities.toCheck')}</p>
              <Rows rows={m.check} onOpen={onOpen} />
            </>
          )}
        </>
      )}
    </Loaded>
  );
}

function All({ onOpen }: { onOpen: (key: string) => void }) {
  const [text, setText] = useState('');
  const read = useSavedRead<OpportunityRow[]>('search_opportunities', text.trim() ? { text: text.trim() } : {});
  return (
    <>
      <input
        className="input"
        type="search"
        aria-label={t('opportunities.search')}
        placeholder={t('opportunities.search')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Loaded read={read}>
        {(rows) => (rows.length > 0 ? <Rows rows={rows} onOpen={onOpen} /> : <p className="muted">{t('opportunities.noResults')}</p>)}
      </Loaded>
    </>
  );
}

function Changes({ onOpen }: { onOpen: (key: string) => void }) {
  const calls = useSavedRead<CallChange[]>('list_opportunity_changes', {});
  const pages = useSavedRead<OfficialChange[]>('list_recent_changes', {});
  return (
    <>
      <Loaded read={calls}>
        {(rows) =>
          rows.length > 0 && (
            <ul className="opp-list">
              {rows.map((c) => (
                <li key={`${c.key}:${c.field}:${c.date}`}>
                  <button type="button" onClick={() => onOpen(c.key)}>
                    <b>{c.title}</b>
                    <small>{t(`opportunities.fieldChanged.${c.field === 'new' ? 'new' : c.field === 'deadline' ? 'deadline' : 'other'}`, { date: formatDayMonth(c.date) })}</small>
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
      <Loaded read={pages}>
        {(rows) =>
          rows.length > 0 ? (
            <ul className="opp-list">
              {rows.map((c) => (
                <li key={c.id}>
                  <a href={c.url} target="_blank" rel="noreferrer">
                    <b>{c.title}</b>
                    <small>{t(`opportunities.pageChanged.${c.kind}`, { who: c.institution, date: formatDayMonth(c.date) })}</small>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('opportunities.noChanges')}</p>
          )
        }
      </Loaded>
    </>
  );
}

function Sources() {
  const [text, setText] = useState('');
  const query = text.trim();
  const found = useSavedRead<StoredPassage[]>('search_documents', query.length >= 2 ? { text: query } : null);
  const sources = useSavedRead<StoredSource[]>('list_sources', {});
  return (
    <>
      <input
        className="input"
        type="search"
        aria-label={t('opportunities.searchDocs')}
        placeholder={t('opportunities.searchDocs')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {query.length >= 2 ? (
        <Loaded read={found}>
          {(rows) =>
            rows.length > 0 ? (
              <ul className="opp-list">
                {rows.map((p, i) => (
                  <li key={`${p.url}:${i}`}>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      <b>{p.title}</b>
                      <small>{p.body.slice(0, 220)}…</small>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('opportunities.noResults')}</p>
            )
          }
        </Loaded>
      ) : (
        <Loaded read={sources}>
          {(rows) => (
            <>
              <p className="muted">{t('opportunities.sourcesCount', { count: rows.length })}</p>
              <ul className="opp-list">
                {rows.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      <b>{s.title}</b>
                      <small>
                        {s.institution}, {t(`opportunities.sourceState.${s.state === 'active' ? 'active' : 'problem'}`)}
                        {s.last_checked && `, ${formatDayMonthYear(s.last_checked.slice(0, 10))}`}
                      </small>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Loaded>
      )}
    </>
  );
}

function OpportunityDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => Promise<void> }) {
  const read = useSavedRead<Detail>('get_opportunity', { key: id });
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async (now: boolean) => {
    setBusy(true);
    setError('');
    try {
      await callWrite(now ? unfollowOpportunity : followOpportunity, { key: id });
      setFollowing(!now);
      await onChanged();
    } catch {
      setError(t('opportunities.followFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="linkbtn" onClick={onBack}>
        {t('common.back')}
      </button>
      <Loaded read={read}>
        {(o) => {
          if (!o) return <p className="muted">{t('opportunities.noResults')}</p>;
          const isFollowing = following ?? o.following;
          return (
            <>
              <h3 className="opp-title">{o.title}</h3>
              <p className="muted">{o.programme}</p>
              <dl className="opp-facts">
                <dt>{t('opportunities.status')}</dt>
                <dd>{t(`opportunities.statuses.${o.status}`)}</dd>
                <dt>{t('opportunities.deadline')}</dt>
                <dd>{o.deadline ? formatDayMonthYear(o.deadline) : t('opportunities.noDate')}</dd>
                {o.budgetEurCents !== null && (
                  <>
                    <dt>{t('opportunities.allocated')}</dt>
                    <dd>{t('opportunities.euro', { amount: formatEuroCents(o.budgetEurCents) })}</dd>
                  </>
                )}
              </dl>
              {o.good.length > 0 && (
                <ul className="opp-reasons">
                  {o.good.map((r) => (
                    <li key={r.code}>{reasonText(r)}</li>
                  ))}
                </ul>
              )}
              {o.doubts.length > 0 && (
                <ul className="opp-reasons opp-doubt">
                  {o.doubts.map((r) => (
                    <li key={r.code}>{reasonText(r)}</li>
                  ))}
                </ul>
              )}
              {o.relevanceNote && <p>{o.relevanceNote}</p>}
              <p className="muted">{t('opportunities.disclaimer')}</p>
              {error && (
                <p role="alert" className="err">
                  {error}
                </p>
              )}
              {o.deadline && (
                <button
                  type="button"
                  className={`btn btn-block ${isFollowing ? 'btn-line' : 'btn-dark'}`}
                  disabled={busy || !navigator.onLine}
                  onClick={() => void toggle(isFollowing)}
                >
                  {t(isFollowing ? 'opportunities.unfollow' : 'opportunities.follow')}
                </button>
              )}
              {!navigator.onLine && <p className="muted">{t('opportunities.followOffline')}</p>}
              <a className="btn btn-line btn-block" href={o.url} target="_blank" rel="noreferrer">
                {t('opportunities.source')}
              </a>
            </>
          );
        }}
      </Loaded>
    </>
  );
}

const TABS = ['forYou', 'all', 'changes', 'sources'] as const;
type Tab = (typeof TABS)[number];

export function OpportunitiesSheet({
  open,
  openKey,
  onClose,
  onChanged,
}: {
  open: boolean;
  openKey: string | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>('forYou');
  const [picked, setPicked] = useState<string | null>(null);
  const key = picked ?? openKey;

  return (
    <Sheet
      open={open}
      onClose={() => {
        setPicked(null);
        onClose();
      }}
      title={t('opportunities.title')}
    >
      {!open ? null : key ? (
        <OpportunityDetail
          id={key}
          onChanged={onChanged}
          onBack={() => {
            setPicked(null);
            if (openKey) onClose();
          }}
        />
      ) : (
        <>
          <div className="cur-toggle" role="group" aria-label={t('opportunities.title')}>
            {TABS.map((id) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
                {t(`opportunities.tabs.${id}`)}
              </button>
            ))}
          </div>
          {tab === 'forYou' && <ForYou onOpen={setPicked} />}
          {tab === 'all' && <All onOpen={setPicked} />}
          {tab === 'changes' && <Changes onOpen={setPicked} />}
          {tab === 'sources' && <Sources />}
        </>
      )}
    </Sheet>
  );
}
