'use client';
/* "Întreabă" (docs/functions.md §14, plan steps 9c–9d), from web/legacy/assistant.js. One button on
   every page opens it. Answers come from POST /api/assistant. A save the assistant prepares arrives
   as a card with the exact values; only the farmer's tap sends it, through the store's send(), so the
   figures update at once. The conversation stays in this tab (sessionStorage). Needs internet and a
   signed-in farm; on Ion's farm it shows prepared answers from his plan, which also work offline. */
import { Fragment, useContext, useEffect, useRef, useState } from 'react';
import planParams from '../../../docs/data/plan-params.json';
import { failText } from '../../lib/cc/format';
import { failText as sharedFailText } from '../../lib/live/fail-text';
import { newIntentKey } from '../../lib/live/intent';
import { useFarm, useMoney, useOnline, useStore, useView } from '../../lib/cc/react';
import { pageKeys } from '../../lib/cc/storage';
import { blocks, card, ERRORS, EXAMPLES, MAX_TURNS, NO_NET, withClientId, type Action, type Span, type Turn } from '../../lib/ui/assistant';
import { DEMO_QUESTIONS, demoCard, type DemoContext } from '../../lib/ui/demo-assistant';
import { AssistantCards } from '../assistant-cards';
import { ErrorLine, NetButton, Sheet } from './bits';
import { FrameContext } from './context';
import '../../public/assistant.css';

type Item =
  | { kind: 'me'; text: string }
  | { kind: 'ai'; text: string; unverified?: boolean; sources?: { url: string; title: string }[]; cards?: unknown[] }
  | { kind: 'wait' }
  | { kind: 'err'; text: string }
  | { kind: 'card'; id: number; action: Action };

/** A turn as this tab keeps it: the answer's cards stay with it, but only role and text go to the API. */
type Kept = Turn & { cards?: unknown[] };
export const forApi = (turns: Kept[]): Turn[] => turns.map(({ role, text }) => ({ role, text }));

/** Ion's farm: prepared questions, answered on the phone from his plan. */
function DemoAsk() {
  const view = useView('farm');
  const [asked, setAsked] = useState<(typeof DEMO_QUESTIONS)[number] | null>(null);
  /* The cards read only the plan, so the plan's farm shape is enough. */
  const card = asked && view ? demoCard(asked.card, { farm: view.storedFarm() as unknown as DemoContext['farm'], plan: view.farmPlan(), data: view.data(), today: view.today }) : null;
  return (
    <>
      {asked ? (
        <>
          <div className="ask-msg me">
            <p>{asked.question}</p>
          </div>
          <div className="ask-msg ai">
            <Rich text={asked.answer} />
            <p className="ask-note">Exemplu de răspuns. În contul tău, asistentul răspunde despre ferma ta.</p>
          </div>
          {card && <AssistantCards cards={[card]} />}
        </>
      ) : (
        <p className="ask-empty">Așa răspunde asistentul despre ferma lui Ion. Alege o întrebare.</p>
      )}
      <div className="ask-chips">
        {DEMO_QUESTIONS.filter((q) => q !== asked).map((q) => (
          <button type="button" className="ask-chip" key={q.question} onClick={() => setAsked(q)}>
            {q.question}
          </button>
        ))}
      </div>
      <a className="btn btn-dark gap" href="/login?mode=register">
        Fă-ți cont
      </a>
    </>
  );
}

function Rich({ text }: { text: string }) {
  const money = useMoney();
  const render = (spans: Span[]) =>
    spans.map((s, i) => (s.bold ? <b key={i}>{s.text}</b> : <span key={i}>{s.text}</span>));
  return (
    <>
      {blocks(money.text(text)).map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>{render(b.spans)}</p>
        ) : (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{render(item)}</li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

function Card({ action }: { action: Action }) {
  const store = useStore();
  const online = useOnline();
  const { scope } = useContext(FrameContext);
  const view = useView(scope);
  const money = useMoney();
  const [state, setState] = useState<'open' | 'saving' | 'saved' | 'no' | 'unknown'>('open');
  /* One key per card, the same on every tap, for the moves that carry no id of their own. */
  const [intent] = useState(newIntentKey);
  const [error, setError] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState<string | null>(null);
  const c = card(action, (id) => view?.cropName(id) || id);

  useEffect(() => {
    if (!c.task || !store) return;
    store.live
      .read<{ id: string; titleRo: string }>('list_tasks', { status: 'all' })
      .then((res) => setTaskTitle((res.data ?? []).find((t) => t.id === c.task)?.titleRo ?? null))
      .catch(() => undefined);
  }, [c.task, store]);

  const save = async () => {
    if (!store) return;
    setState('saving');
    setError(null);
    try {
      await store.send(({ write }) => write(action.function, action.input, { key: intent }));
      setState('saved');
    } catch (e) {
      /* A money move whose answer was lost may have happened: no second tap until the figures show it. */
      setState((e as { unknownOutcome?: boolean } | null)?.unknownOutcome ? 'unknown' : 'open');
      setError(failText(e, online));
    }
  };

  return (
    <div className="ask-msg card">
      <p className="eyebrow">{c.title}</p>
      <dl>
        {c.rows.map(([k, v], i) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd>{i === 0 && taskTitle ? taskTitle : money.text(v)}</dd>
          </div>
        ))}
      </dl>
      {state === 'saved' ? (
        <p className="ask-done">Salvat. Cifrele s-au actualizat.</p>
      ) : state === 'no' ? (
        <p className="ask-done muted">N-am salvat nimic.</p>
      ) : (
        <div className="ask-acts">
          <NetButton className="btn btn-dark" reason="Pornește internetul ca să salvezi." disabled={state === 'saving' || state === 'unknown'} onClick={save}>
            Da, salvează
          </NetButton>
          <button type="button" className="btn btn-line" disabled={state === 'saving'} onClick={() => setState('no')}>
            Nu
          </button>
        </div>
      )}
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}

export function Assistant() {
  const store = useStore();
  const farm = useFarm();
  const online = useOnline();
  const { mode } = useContext(FrameContext);
  const key = pageKeys(mode).assistant;
  /* Ion's farm is never signed in, even when the visitor is: the assistant answers only for a real farm. */
  const signedIn = mode === 'farm' && !!farm?.signedIn;
  const [open, setOpen] = useState(false);
  const [small, setSmall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [slow, setSlow] = useState(false);
  const [draft, setDraft] = useState('');
  const turns = useRef<Kept[]>([]);
  const cardId = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);

  const keep = () => {
    try {
      sessionStorage.setItem(key, JSON.stringify(turns.current.slice(-MAX_TURNS)));
    } catch {
      /* private window */
    }
  };

  /* The phone's bottom bar is fixed, so the button sits above it. */
  useEffect(() => {
    const place = () => {
      const rail = document.querySelector<HTMLElement>('.rail');
      const fixed = rail && getComputedStyle(rail).position === 'fixed';
      document.documentElement.style.setProperty('--ask-bottom', fixed ? `${rail!.offsetHeight + 12}px` : '20px');
    };
    place();
    addEventListener('resize', place);
    return () => removeEventListener('resize', place);
  }, []);

  /* Scrolling down, the button shrinks to its icon, so it covers less of what's being read. */
  useEffect(() => {
    let last = scrollY;
    const onScroll = () => {
      if (Math.abs(scrollY - last) < 8) return;
      setSmall(scrollY > last && scrollY > 40);
      last = scrollY;
    };
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [items]);

  const openSheet = () => {
    try {
      turns.current = JSON.parse(sessionStorage.getItem(key) || '[]');
    } catch {
      turns.current = [];
    }
    setItems(turns.current.map((t) => (t.role === 'user' ? { kind: 'me', text: t.text } : { kind: 'ai', text: t.text, cards: t.cards })));
    setOpen(true);
    if (signedIn) setTimeout(() => input.current?.focus(), 0);
  };

  async function ask(text: string) {
    if (busy || !text.trim() || !store) return;
    if (!online) {
      setItems((l) => [...l, { kind: 'err', text: NO_NET }]);
      return;
    }
    setBusy(true);
    setDraft('');
    const slowTimer = setTimeout(() => setSlow(true), planParams.network.slow_hint_s.value * 1000);
    turns.current.push({ role: 'user', text: text.trim() });
    setItems((l) => [...l, { kind: 'me', text: text.trim() }, { kind: 'wait' }]);
    try {
      const res = await store.live.api<{ reply: string; unverified?: unknown[]; sources?: { url: string; title: string }[]; actions?: Action[]; cards?: unknown[] }>('/api/assistant', {
        method: 'POST',
        timeout: 'ai',
        body: JSON.stringify({ messages: forApi(turns.current.slice(-MAX_TURNS)) }),
      });
      turns.current.push({ role: 'assistant', text: res.reply, ...(res.cards?.length ? { cards: res.cards } : {}) });
      keep();
      setItems((l) => [
        ...l.filter((i) => i.kind !== 'wait'),
        { kind: 'ai', text: res.reply, unverified: !!res.unverified?.length, sources: res.sources?.slice(0, 4), cards: res.cards },
        ...(res.actions ?? []).map((a) => ({ kind: 'card' as const, id: ++cardId.current, action: withClientId(a, () => crypto.randomUUID()) })),
      ]);
    } catch (e) {
      turns.current.pop();
      keep();
      const code = (e as { code?: string } | null)?.code;
      setItems((l) => [...l.filter((i) => i.kind !== 'wait'), { kind: 'err', text: (code && ERRORS[code]) || sharedFailText(e, 'ai', online) }]);
      /* What the farmer asked goes back in the box, unless they have started typing something else. */
      setDraft((d) => d || text);
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setBusy(false);
      input.current?.focus();
    }
  }

  const submit = () => {
    void ask(draft);
  };

  return (
    <>
      <button type="button" className={`ask-fab${small ? ' small' : ''}`} aria-label="Întreabă" aria-haspopup="dialog" onClick={openSheet}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        <span>Întreabă</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} className="ask-sheet" label="Întreabă">
        <header className="ask-head">
          <h2>Întreabă</h2>
          <button type="button" className="ask-close" aria-label="Închide" onClick={() => setOpen(false)}>
            ✕
          </button>
        </header>
        <div className="ask-log" role="log" aria-live="polite" ref={log}>
          {mode === 'demo' ? (
            <DemoAsk />
          ) : !signedIn ? (
            <div className="ask-empty">
              <p>Asistentul răspunde din cifrele fermei tale, așa că lucrează doar cu un cont.</p>
              <a className="btn btn-dark" href="/login">
                Intră în cont
              </a>
            </div>
          ) : !items.length ? (
            <div className="ask-empty">
              <p>Întreabă despre banii fermei, subvenții, termene sau ce s-ar schimba dacă…</p>
              <div className="ask-chips">
                {EXAMPLES.map((q) => (
                  <button type="button" className="ask-chip" key={q} onClick={() => void ask(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            items.map((item, i) => {
              if (item.kind === 'card') return <Card key={`c${item.id}`} action={item.action} />;
              if (item.kind === 'wait')
                return (
                  <div key={i} className="ask-msg ai wait">
                    <p>{slow ? 'Încă mă uit…' : 'Mă uit în cifrele fermei…'}</p>
                  </div>
                );
              if (item.kind === 'err')
                return (
                  <div key={i} className="ask-msg err">
                    <p>{item.text}</p>
                  </div>
                );
              if (item.kind === 'me')
                return (
                  <div key={i} className="ask-msg me">
                    <p>{item.text}</p>
                  </div>
                );
              return (
                <Fragment key={i}>
                  <div className="ask-msg ai">
                    <Rich text={item.text} />
                    {item.unverified && <p className="ask-note">Unele cifre nu sunt confirmate încă.</p>}
                    {item.sources?.length ? (
                      <p className="ask-note">
                        Surse:{' '}
                        {item.sources.map((s, j) => (
                          <span key={s.url}>
                            {j ? ', ' : ''}
                            <a href={s.url} target="_blank" rel="noopener">
                              {s.title}
                            </a>
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </div>
                  <AssistantCards cards={item.cards} />
                </Fragment>
              );
            })
          )}
        </div>
        {signedIn && (
          <>
            <form
              className="ask-form"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label className="ask-sr" htmlFor="ask-input">
                Întrebarea ta
              </label>
              <textarea
                id="ask-input"
                ref={input}
                rows={2}
                maxLength={2000}
                placeholder="Scrie întrebarea ta…"
                enterKeyHint="send"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <NetButton type="submit" className="btn btn-dark" reason={NO_NET} disabled={busy}>
                Trimite
              </NetButton>
            </form>
            <p className="ask-foot">
              Răspunde un program de inteligență artificială, nu un om, și poate greși. Cifrele vin din planul fermei tale. Asistentul nu salvează nimic singur: tu apeși pe card.{' '}
              <button
                type="button"
                className="ask-link"
                onClick={() => {
                  turns.current = [];
                  keep();
                  setItems([]);
                }}
              >
                Începe din nou
              </button>
            </p>
          </>
        )}
      </Sheet>
    </>
  );
}
