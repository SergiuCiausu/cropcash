'use client';
/* "Contul tău": Stripe setup, the split with "Bine așa", salaries paid, the pension, the currency and
   the demo (was web/legacy/bani.js). What's on screen comes from the saved farm, so it opens offline.
   Anything that moves money needs internet and is never queued: without it the button says so and
   nothing changes. Ion's farm has no Stripe account: it shows what one would hold, built from his
   plan (lib/demo-account.ts), and nothing here moves money or calls Stripe. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CURRENCIES, ExchangeRatesSchema, type CurrencyCode } from '../../../packages/shared/src/currency/index';
import { date, exact } from '../../lib/cc/format';
import { ionFarm } from '../../lib/cc/farm';
import { useFarm, useMoney, useOnline, useStore, useView } from '../../lib/cc/react';
import { demoAccount } from '../../lib/demo-account';
import { failText as moneyFailText } from '../../lib/live/fail-text';
import { publicConfig } from '../../lib/live/index';
import { monthName } from '../../lib/ui/chart';
import { ErrorLine, NetButton, OfflineNote, Sheet, useHref } from '../app/bits';
import { useSaved } from '../app/useSaved';
import { PageLink } from '../app/Frame';

const NEEDS_NET = 'Pornește internetul ca să muți banii.';
const KINDS = [
  ['salary', 'Salariu'],
  ['spring_inputs', 'Cheltuieli fermă'],
  ['debts', 'Datorii'],
  ['pension', 'Pensie'],
] as const;
const PAID: Record<string, string> = { scheduled: 'programat', pending: 'pe drum', paid: 'plătit', failed: 'neplătit' };
const NAMES: Record<CurrencyCode, string> = { RON: 'lei', EUR: 'euro', USD: 'dolari', GBP: 'lire' };
const EVENT_KIND: Record<string, string> = { apia_advance: 'avansul APIA', apia_balance: 'restul de la APIA', crop_sale: 'vânzarea recoltei', credit: 'creditul pe adeverința APIA' };
const FORWARD = [1, 3, 6];

type Pots = Record<(typeof KINDS)[number][0], number>;
type Payout = { id?: string; scheduled_for: string; amount_bani: number; status: string };
type ClockEvent = { type: string; ok?: boolean; amount: number; kind?: string; date: string };
type Tools = Parameters<Parameters<NonNullable<ReturnType<typeof useStore>>['send']>[0]>[0];
type Slot = 'setup' | 'demo' | 'split';

function Bars({ env, lei }: { env: Pots; lei: (b: number) => string }) {
  const max = Math.max(...KINDS.map(([k]) => env[k]), 1);
  return (
    <>
      {KINDS.map(([k, name]) => (
        <li className="ac-env" key={k}>
          <span className="ac-env-l">
            <b>{name}</b>
            <span>{lei(env[k])}</span>
          </span>
          <span className="ac-env-bar">
            <i style={{ transform: `scaleX(${(env[k] / max).toFixed(3)})` }} />
          </span>
        </li>
      ))}
    </>
  );
}

export default function Bani() {
  const farm = useFarm()!;
  const header = (
    <header className="page-h">
      <div>
        <h1>Contul tău</h1>
        <p className="lead">Banii care vin prin CropCash. Totul e simulat: nu se mișcă bani reali.</p>
      </div>
    </header>
  );
  const offline = <OfflineNote>Nu ai internet. Vezi ce e salvat pe telefon, dar banii nu se pot muta acum.</OfflineNote>;
  if (!farm.me && !farm.isIon)
    return (
      <>
        {header}
        {offline}
        <div className="bento">
          <section className="card s12">
            <h2>Încă nu ai cont</h2>
            <p className="note">Banii se pot muta doar dintr-un cont. {farm.signedIn ? <a href="/onboarding">Spune-ne despre fermă</a> : <a href="/login">Intră în cont</a>}.</p>
            <SignOut />
          </section>
        </div>
      </>
    );
  return (
    <>
      {header}
      {offline}
      <Account />
    </>
  );
}

/** Leaving the account asks first: coming back needs the password, and records not yet sent are lost. */
function SignOut() {
  const farm = useFarm()!;
  const [asking, setAsking] = useState(false);
  if (!farm.signedIn) return null;
  return (
    <>
      <button type="button" className="btn btn-line gap" onClick={() => setAsking(true)}>
        Ieși din cont
      </button>
      <Sheet open={asking} onClose={() => setAsking(false)} className="h-sheet" label="Ieși din cont?">
        <h2>Ieși din cont?</h2>
        <p className="note">{farm.outbox.length ? 'Ai lucruri notate care nu s-au trimis încă. Dacă ieși acum, se pierd.' : 'Ca să intri din nou îți trebuie parola.'}</p>
        <div className="ob-actions">
          <a className={`btn ${farm.outbox.length ? 'btn-danger' : 'btn-dark'}`} href="/login?signout=1">
            Da, ies din cont
          </a>
          <button type="button" className="btn btn-line" onClick={() => setAsking(false)}>
            Rămân
          </button>
        </div>
      </Sheet>
    </>
  );
}

function Account() {
  const view = useView('farm')!;
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const href = useHref();
  const { text: t } = useMoney();
  const DEMO = farm.isIon;
  const farmPlan = view.farmPlan();
  const account = DEMO ? demoAccount(farmPlan as unknown as Parameters<typeof demoAccount>[0], view.today, ionFarm(view.baseData()).account!.payoutsShown) : null;
  const me = (DEMO ? { stripe_account_id: 'demo', payouts: account!.payouts, transactions: [] } : farm.me!) as { stripe_account_id?: string | null; payouts?: unknown[]; transactions?: { kind: string; amount_bani: number }[]; demo_now?: string | null };
  const plan = DEMO ? { ...farmPlan, envelopes: account!.envelopes } : farmPlan;
  const lei = (bani: number) => t(`${bani < 0 ? '−' : ''}${exact(Math.abs(bani))} lei`);
  const hasAccount = !!me.stripe_account_id;
  const transactions = me.transactions ?? [];
  const pensions = transactions.filter((x) => x.kind === 'pension');
  const saved = -pensions.reduce((s, x) => s + x.amount_bani, 0);
  const pensionMonthly = plan.smoothing.pensionMonthly ?? 0;
  const advanceIn = transactions.some((x) => x.kind === 'apia_advance');
  const rows = [...((me.payouts ?? []) as Payout[])].sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for));
  const envelopes = plan.envelopes as Pots;
  const showDemo = !DEMO && !!publicConfig().demo && hasAccount;

  /* ---- Moving money ---- */
  const running = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [stuck, setStuck] = useState<Set<string>>(new Set());
  const [errs, setErrs] = useState<Partial<Record<Slot, string>>>({});
  const [events, setEvents] = useState<ClockEvent[]>([]);
  /* null = closed; 0 = the farmer asked; more = this much just arrived from APIA. */
  const [split, setSplit] = useState<number | null>(null);
  const problem = (e: unknown) => ((e as { code?: string } | null)?.code === 'stale_clock' ? 'Data s-a schimbat pe alt ecran. Reîncarcă pagina și încearcă din nou.' : moneyFailText(e, 'money', online));
  const announce = useSaved();
  async function run(id: string, slot: Slot, action: (tools: Tools) => Promise<unknown>, onDone?: () => void, title?: string) {
    if (running.current) return;
    running.current = true;
    setBusy(id);
    setErrs((x) => ({ ...x, [slot]: undefined }));
    try {
      await (title ? announce(title, () => store.send(action)) : store.send(action));
      onDone?.();
    } catch (e) {
      /* It may have happened: no second tap until the next load shows it. */
      if ((e as { unknownOutcome?: boolean } | null)?.unknownOutcome) setStuck((s) => new Set(s).add(id));
      setErrs((x) => ({ ...x, [slot]: problem(e) }));
    } finally {
      running.current = false;
      setBusy(null);
    }
  }
  const moneyButton = (id: string, label: ReactNode, className: string, onClick: () => void, off = false) => (
    <NetButton reason={NEEDS_NET} className={className} disabled={off || busy === id || stuck.has(id)} aria-busy={busy === id || undefined} onClick={onClick}>
      {busy === id ? 'Așteaptă puțin…' : label}
    </NetButton>
  );

  /* ---- Rates for next time, offline ---- */
  useEffect(() => {
    let live = true;
    store.live
      .api<{ rates?: unknown }>('/api/exchange-rates')
      .then(({ rates }) => {
        const parsed = ExchangeRatesSchema.safeParse(rates);
        if (live && parsed.success) store.setRates(parsed.data);
      })
      .catch(() => undefined); // keeps the saved rates
    return () => {
      live = false;
    };
  }, [store]);

  function eventText(e: ClockEvent) {
    const amount = lei(e.amount);
    if (e.type === 'salary') return e.ok ? `Salariu plătit: ${amount}` : `Salariul de ${amount} n-a putut fi plătit: nu sunt destui bani în contul CropCash.`;
    if (e.type === 'income') return `Au intrat ${amount}: ${EVENT_KIND[e.kind ?? ''] ?? ''}`;
    if (e.type === 'expense') return `Cheltuială fermă: ${amount} (${view.cropName(e.kind ?? '')})`;
    if (e.type === 'pension') return `Pus deoparte pentru pensie: ${amount}`;
    return `Rată la credit plătită din bancă: ${amount}`;
  }
  const filled = KINDS.some(([k]) => envelopes[k] > 0);
  const code = farm.currency.code;
  const forwardLabel = (n: number) => `Dăm timpul înainte: ${n === 1 ? 'o lună' : `${n} luni`}`;

  return (
    <div className="bento">
      {!hasAccount && (
        <section className="card s12">
          <div className="card-h">
            <h2>Contul CropCash</h2>
          </div>
          <p className="note">Banii de la APIA ajung într-un cont CropCash, din care îți plătim salariul lunar.</p>
          <ErrorLine>{errs.setup}</ErrorLine>
          {moneyButton('setup', 'Activează contul', 'btn btn-dark gap', () => void run('setup', 'setup', ({ api }) => api('/api/stripe/setup', { method: 'POST', timeout: 'setup', body: '{}' } as RequestInit), undefined, 'Am activat contul'))}
        </section>
      )}
      <section className="card s7">
        <div className="card-h">
          <h2>Plicurile tale</h2>
        </div>
        {filled ? (
          <ol className="ac-envs">
            <Bars env={envelopes} lei={lei} />
          </ol>
        ) : (
          <p className="note">Încă n-ai împărțit banii pe plicuri.</p>
        )}
        {DEMO ? (
          <p className="note gap">Așa ar împărți aplicația banii lui {ionFarm(view.baseData()).name}. În exemplu nu se mută bani.</p>
        ) : plan.startBalance > 0 ? (
          <button type="button" className="btn btn-dark gap" onClick={() => setSplit(0)}>
            Împarte banii pe plicuri
          </button>
        ) : (
          <p className="note">
            Ca să împărți banii, spune-ne întâi{' '}
            <PageLink path="/date-plan" href={href('/date-plan')}>
              câți bani ai
            </PageLink>
            .
          </p>
        )}
      </section>
      <section className="card s5">
        <div className="card-h">
          <h2>Salarii</h2>
        </div>
        {rows.length ? (
          <ol className="ac-list">
            {rows.map((p) => (
              <li key={p.id ?? p.scheduled_for}>
                <span>
                  <b>{monthName(p.scheduled_for.slice(0, 7))}</b>
                  <small>{PAID[p.status] ?? ''}</small>
                </span>
                <span className="ac-amt">{lei(p.amount_bani)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="note">Niciun salariu plătit încă.</p>
        )}
        {pensions.length > 0 && <p className="note gap">Pensie: {pensions.length === 1 ? 'o plată făcută' : `${pensions.length} plăți făcute`}.</p>}
      </section>
      <section className="card s7">
        <div className="card-h">
          <h2>Pensie</h2>
          <span>
            <PageLink path="/pensie" href={href('/pensie')}>
              {pensionMonthly > 0 ? 'Schimbă' : 'Vezi cât strângi'}
            </PageLink>
          </span>
        </div>
        {pensionMonthly > 0 ? (
          <>
            <p className="n20">Pui {lei(pensionMonthly)} pe lună.</p>
            {!DEMO && <p className="note">Până acum: {lei(saved)}</p>}
          </>
        ) : (
          <p className="note">Nu pui încă bani deoparte pentru pensie.</p>
        )}
      </section>
      <section className="card s5">
        <div className="card-h">
          <h2>Moneda</h2>
        </div>
        {farm.currency.rates ? (
          <div className="chips">
            {CURRENCIES.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={c === code} onClick={() => store.setCurrency(c)}>
                {NAMES[c]}
              </button>
            ))}
          </div>
        ) : (
          <p className="note">Pornește internetul o dată ca să poți schimba moneda.</p>
        )}
        {code !== 'RON' && <p className="note gap">Sume orientative în {NAMES[code]}. Câmpurile și prețurile pe kilogram rămân în lei.</p>}
      </section>
      {!DEMO && (
        <section className="card s12">
          <h2>Ferma ta</h2>
          <p className="note">Numele, județul, hectarele și banii de acum.</p>
          <a className="btn btn-line gap" href="/onboarding">
            Schimbă datele fermei
          </a>
          <SignOut />
        </section>
      )}
      {showDemo && (
        <section className="card s12">
          <div className="card-h">
            <h2>Demo</h2>
            <span>Azi, în demo: {date(view.today, true)}</span>
          </div>
          <div className="ob-actions">
            {moneyButton(
              'income',
              advanceIn ? 'Avansul APIA a intrat' : 'Simulează avansul APIA',
              'btn btn-dark',
              () =>
                void run('income', 'demo', async ({ write }) => {
                  const res = (await write('simulate_apia_advance', {})) as { event?: ClockEvent };
                  if (res.event) {
                    setEvents([res.event]);
                    setSplit(res.event.amount);
                  }
                }),
              advanceIn,
            )}
            {FORWARD.map((n) => (
              <span key={n}>
                {moneyButton(`f${n}`, forwardLabel(n), 'btn btn-line', () =>
                  void run(`f${n}`, 'demo', async ({ write }) => {
                    /* The date on screen goes with the tap: the same tap sent twice moves the clock once. */
                    const from = farm.me?.demo_now;
                    const res = (await write('advance_clock', { months: n, ...(from ? { from } : {}) })) as { events?: ClockEvent[] };
                    setEvents(res.events ?? []);
                  }),
                )}
              </span>
            ))}
          </div>
          <ErrorLine>{errs.demo}</ErrorLine>
          {events.length > 0 && (
            <>
              <h3 className="gap">Ce s-a întâmplat</h3>
              <ol className="ac-list">
                {events.map((e, i) => (
                  <li key={i}>
                    <span>
                      <small>{eventText(e)}</small>
                    </span>
                    <span className="ac-amt">{date(e.date)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}
      {split !== null && (
        <Sheet open onClose={() => setSplit(null)} className="h-sheet" label={split ? 'Au intrat bani!' : `Împarte ${lei(plan.startBalance)}`} locked={busy === 'accept'}>
          <h2>{split ? 'Au intrat bani!' : `Împarte ${lei(plan.startBalance)}`}</h2>
          <p className="note">{split ? `Au intrat ${lei(split)} de la APIA. Îți propunem așa:` : 'Îți propunem așa. Banii rămân la tine, iar plicurile te ajută să știi pentru ce sunt.'}</p>
          <ol className="ac-envs">
            <Bars env={plan.proposal as Pots} lei={lei} />
          </ol>
          <p className="note">Salariul și pensia acoperă {plan.monthsCovered === 1 ? 'o lună' : `${plan.monthsCovered} luni`}, până la următoarele încasări.</p>
          <ErrorLine>{errs.split}</ErrorLine>
          <div className="ob-actions">
            {moneyButton('accept', 'Bine așa', 'btn btn-dark', () => void run('accept', 'split', ({ write }) => write('save_envelopes', plan.proposal as unknown as Record<string, unknown>), () => setSplit(null), 'Am împărțit banii pe plicuri'))}
            <button type="button" className="btn btn-line" disabled={busy === 'accept'} onClick={() => setSplit(null)}>
              Mai târziu
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
