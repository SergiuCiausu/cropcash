'use client';
/* In-app notifications (web/legacy/notifications.js): toasts, and the bell that opens a demo panel
   with one button per message. Messages are built from the farm's own plan (lib/ui/messages.ts). */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { FarmView } from '../../lib/cc/plan';
import { callName } from '../../lib/cc/monitor';
import { useFarm, useMoney, useMonitor } from '../../lib/cc/react';
import { publicConfig } from '../../lib/live/index';
import type { Mode } from '../../lib/paths';
import { buildMessage, inboxMessages, panelRows, type MessageInput, type Tone, type ToastInput } from '../../lib/ui/messages';
import { Icon } from './bits';
import { FrameContext } from './context';
import '../../styles/notifications.css';

const VISIBLE = 3;
const LIFE = 8000;
const LEAVE = 200;
const TONE_ICON: Record<Tone, 'cal' | 'down' | 'shield'> = { info: 'cal', good: 'down', warn: 'shield', urgent: 'shield' };

const X = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
const BELL = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

type Toast = ToastInput & { kind: string; id: number; leaving?: boolean; in?: boolean };

/** The queue of toasts: at most three on screen, the rest wait their turn. */
export function useToaster() {
  const [shown, setShownState] = useState<Toast[]>([]);
  const [said, setSaid] = useState<{ polite: string; loud: string }>({ polite: '', loud: '' });
  /* The list lives in a ref too, so the queue is worked out once per change, outside React's updaters. */
  const list = useRef<Toast[]>([]);
  const setShown = useCallback((change: (l: Toast[]) => Toast[]) => {
    list.current = change(list.current);
    setShownState(list.current);
  }, []);
  const waiting = useRef<Toast[]>([]);
  const next = useRef(0);

  const drain = useCallback(() => {
    const live = list.current.filter((t) => !t.leaving).length;
    const add = waiting.current.splice(0, Math.max(0, VISIBLE - live));
    if (!add.length) return;
    const last = add[add.length - 1];
    setSaid((s) => ({ ...s, [last.tone === 'urgent' ? 'loud' : 'polite']: `${last.title}. ${last.body ?? ''}` }));
    setShown((l) => [...add.reverse(), ...l]);
  }, [setShown]);

  const notify = useCallback(
    (n: ToastInput) => {
      waiting.current.push({ kind: 'note', ...n, tone: n.tone ?? 'info', id: ++next.current });
      drain();
    },
    [drain],
  );

  const close = useCallback(
    (id: number, expired = true) => {
      const toast = list.current.find((t) => t.id === id);
      if (toast?.leaving) return;
      if (expired) toast?.onExpire?.();
      setShown((l) => l.map((t) => (t.id === id ? { ...t, leaving: true, in: false } : t)));
      setTimeout(() => {
        setShown((l) => l.filter((t) => t.id !== id));
        drain();
      }, LEAVE);
    },
    [drain, setShown],
  );

  const show = useCallback((id: number) => setShown((l) => l.map((t) => (t.id === id ? { ...t, in: true } : t))), [setShown]);

  return { shown, said, notify, close, show };
}

export type Toaster = ReturnType<typeof useToaster>;

function ToastItem({ t, toaster }: { t: Toast; toaster: Toaster }) {
  const left = useRef(LIFE);
  const began = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { close, show } = toaster;
  const action = t.action;
  /* The timer pauses while the farmer reads or tabs through the toast. An urgent one stays. */
  const run = useCallback(() => {
    if (t.tone === 'urgent') return;
    began.current = Date.now();
    timer.current = setTimeout(() => close(t.id), left.current);
  }, [close, t.id, t.tone]);
  const hold = () => {
    clearTimeout(timer.current);
    left.current = Math.max(1500, left.current - (Date.now() - began.current));
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => show(t.id)));
    run();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer.current);
    };
  }, [run, show, t.id]);
  return (
    <article className={`ntf ${t.tone}${t.in ? ' in' : ''}${t.leaving ? ' leaving' : ''}`} data-kind={t.kind} onPointerEnter={hold} onPointerLeave={run} onFocus={hold} onBlur={run}>
      <span className="ntf-ic">
        <Icon name={TONE_ICON[t.tone]} />
      </span>
      <div className="ntf-text">
        <b>{t.title}</b>
        {t.body ? <p>{t.body}</p> : null}
        {action && 'run' in action ? (
          <button
            type="button"
            className="ntf-act"
            onClick={() => {
              action.run();
              close(t.id, false);
            }}
          >
            {action.label}
          </button>
        ) : action ? (
          <a href={action.href}>{action.label}</a>
        ) : null}
      </div>
      <button type="button" className="ntf-x" aria-label="Închide" onClick={() => close(t.id)}>
        {X}
      </button>
    </article>
  );
}

export function Toaster({ toaster }: { toaster: Toaster }) {
  return (
    <>
      <section className="ntf-box" aria-label="Notificări">
        {toaster.shown.map((t) => (
          <ToastItem key={t.id} t={t} toaster={toaster} />
        ))}
      </section>
      <div className="ntf-sr" role="status">
        {toaster.said.polite}
      </div>
      <div className="ntf-sr" role="alert">
        {toaster.said.loud}
      </div>
    </>
  );
}

/** The panel with test buttons is for the pitch. A farmer's bell opens their messages. */
const isTesting = (mode: Mode) => mode === 'demo' || !!publicConfig().demo;

/** One bell in the phone header and one in the rail: only one is ever visible, and neither covers the page. */
export function Bell({ open, onToggle, mode }: { open: boolean; onToggle: () => void; mode: Mode }) {
  const testing = isTesting(mode);
  return (
    <button type="button" className="ntf-bell" aria-label={testing ? 'Probează notificările' : 'Mesaje'} aria-expanded={open} aria-controls="ntf-panel" onClick={onToggle}>
      {BELL}
      <span>{testing ? 'Notificări' : 'Mesaje'}</span>
    </button>
  );
}

/** What the messages are built from: the plan of the page's view (null for a closed harvest). */
function useMessageInput(view: FarmView): MessageInput {
  const farm = useFarm();
  const monitor = useMonitor();
  const { href } = useContext(FrameContext);
  return useMemo(() => {
    let plan = null;
    try {
      plan = view.closed ? null : view.farmPlan();
    } catch {
      plan = null;
    }
    return {
      plan,
      data: view.data(),
      today: view.today,
      doneTasks: new Set(farm?.doneTasks ?? []),
      calls: monitor.followed.filter((c) => c.title).map((c) => ({ title: callName(c as { title: string }), deadline: c.deadline ?? null })),
      changes: monitor.changes as MessageInput['changes'],
      href,
    };
  }, [view, farm, monitor, href]);
}

export function NotificationPanel({ view, open, onClose }: { view: FarmView; open: boolean; onClose: () => void }) {
  const { notify, mode } = useContext(FrameContext);
  const money = useMoney();
  const input = useMessageInput(view);
  const rows = useMemo(() => panelRows(input), [input]);
  const inbox = useMemo(() => inboxMessages(input), [input]);
  const ref = useRef<HTMLElement>(null);

  const back = useCallback(() => {
    onClose();
    (Array.from(document.querySelectorAll<HTMLElement>('.ntf-bell')).find((b) => b.offsetParent) ?? null)?.focus();
  }, [onClose]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open && !document.querySelector('dialog[open]')) back();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, back]);

  const send = (kind: string) => {
    const n = buildMessage(kind, input);
    if (n) notify({ ...n, title: money.text(n.title), body: n.body && money.text(n.body) });
  };
  /* On a phone the toasts would cover the panel, so it steps aside. */
  const afterSend = () => {
    if (matchMedia('(max-width: 760px), (max-height: 500px)').matches) back();
  };

  /* Worked out on the phone from the saved plan, so the messages are there without internet too. */
  if (!isTesting(mode))
    return (
      <section ref={ref} className="ntf-panel" id="ntf-panel" hidden={!open} aria-label="Mesaje">
        <div className="ntf-head">
          <h2>Mesaje</h2>
          <button type="button" className="ntf-x" aria-label="Închide" onClick={back}>
            {X}
          </button>
        </div>
        {inbox.length ? (
          <ul>
            {inbox.map((m) => (
              <li key={m.kind} className="ntf-msg">
                <span>
                  <b>{money.text(m.title)}</b>
                  {m.body ? <small>{money.text(m.body)}</small> : null}
                  {m.action ? <a href={m.action.href}>{m.action.label}</a> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ntf-empty">Nimic nou. Îți scriem aici când se apropie un termen sau când se schimbă ceva la bani.</p>
        )}
      </section>
    );

  return (
    <section ref={ref} className="ntf-panel" id="ntf-panel" hidden={!open} aria-label="Probează notificările">
      <div className="ntf-head">
        <h2>Probează notificările</h2>
        <button type="button" className="ntf-x" aria-label="Închide" onClick={back}>
          {X}
        </button>
      </div>
      <ul>
        {rows.map((m) => (
          <li key={m.kind}>
            <span>
              <b>{m.name}</b>
              <small>{m.sub}</small>
            </span>
            <button
              type="button"
              className="ntf-send"
              disabled={!m.ok}
              onClick={() => {
                send(m.kind);
                afterSend();
              }}
            >
              Trimite
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="ntf-all"
        disabled={!rows.some((m) => m.ok)}
        onClick={() => {
          rows.filter((m) => m.ok).forEach((m) => send(m.kind));
          afterSend();
        }}
      >
        Trimite toate
      </button>
    </section>
  );
}
