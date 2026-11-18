'use client';
/* „Oameni”: the farm's people, what each costs, and „Am plătit salariile” (docs/employees-arenda-plan.md §1.5).
   Shared by /oameni and /ferma-lui-ion/oameni (screens/oameni.tsx).
   Offline: the list and the month's pay read from the copy on the phone; „Am plătit” notes expenses, which
   wait in the queue like any other expense. Adding, changing or archiving a person needs internet. */
import { useContext, useRef, useState, type FormEvent } from 'react';
import {
  EmployeeInputSchema,
  monthlyCost,
  payToRecord,
  splitByActive,
  type EmployeeKind,
  type PayToRecord,
  type RecordedPay,
  type StoredEmployee,
} from '../../../packages/shared/src/payroll/index';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import { date, exact, failText, MONTHS } from '../../lib/cc/format';
import { useFarm, useOnline, useStore, useView } from '../../lib/cc/react';
import { newIntentKey } from '../../lib/live/intent';
import { AmountEcho, ErrorLine, NetButton, OfflineNote, Sheet } from '../app/bits';
import { FrameContext } from '../app/context';
import { monthName, PayrollWarn } from '../app/PayrollWarn';
import '../../styles/events.css';
import '../../styles/people.css';

const KIND_WORDS: [EmployeeKind, string, string][] = [
  ['permanent', 'Angajat permanent', 'Lucrează tot anul, plătit pe lună.'],
  ['seasonal', 'Sezonier', 'Lucrează doar în unele luni.'],
  ['zilier', 'Zilier', 'Plătit pe zi, în lunile în care vine.'],
];
const kindWord = (k: EmployeeKind) => KIND_WORDS.find(([x]) => x === k)![1];

/** "plătit pe 10", "200 lei pe zi, 12 zile pe lună", "doar mar.–iun." */
function payWords(e: StoredEmployee): string {
  const basis = e.pay_basis === 'day' ? `${exact(e.cost_bani)} lei pe zi, ${e.days_per_month} zile pe lună` : `plătit pe ${e.pay_day} în luna următoare`;
  const months = e.active_months ? `, doar ${e.active_months.map((m) => MONTHS[m - 1]).join(' ')}` : '';
  return `${basis}${months}`;
}

export default function Oameni() {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const online = useOnline();
  const [editing, setEditing] = useState<StoredEmployee | 'new' | null>(null);
  const me = farm.me;
  const people = me?.employees ?? [];
  const { active, past } = splitByActive(people, view.today);
  const plan = view.farmPlan();
  const month = view.today.slice(0, 7);
  const thisMonth = plan.timelines.medium.months.find((m) => m.key === month);
  const dueThisMonth = (thisMonth?.entries ?? []).filter((e) => e.kind === 'payroll').reduce((s, e) => s + e.value, 0);
  const perMonth = active.reduce((s, e) => s + monthlyCost(e), 0);

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Oameni</h1>
          <p className="lead">Cine lucrează la fermă și cât te costă, tot cu taxe. Salariile lor intră în plan înaintea salariului tău.</p>
        </div>
        {me && (
          <div className="acts">
            <NetButton reason="Un om nou se adaugă când ai internet." className="btn btn-dark" onClick={() => setEditing('new')}>
              Adaugă un om
            </NetButton>
          </div>
        )}
      </header>

      {!me && <p className="note">Pe ferma lui Ion nu sunt oameni angajați. Pe ferma ta îi adaugi aici și salariile lor intră în plan.</p>}

      <PayrollWarn plan={plan} />

      <div className="bento">
        <section className="card s7" aria-labelledby="pp-month">
          <div className="card-h">
            <h2 id="pp-month">Salariile pe {monthName(month)}</h2>
            <span>{exact(dueThisMonth)} lei de plătit</span>
          </div>
          {me ? <PayMonth people={people} month={month} transactions={(me.transactions ?? []) as unknown as RecordedPay[]} /> : <p className="note">Nimic de plătit.</p>}
        </section>

        <section className="card s5" aria-labelledby="pp-total">
          <div className="card-h">
            <h2 id="pp-total">Cât te costă pe lună</h2>
          </div>
          <p className="pp-big">{exact(perMonth)} lei</p>
          <p className="note">
            {active.length === 0 ? 'Nu ai încă oameni în listă.' : `${active.length === 1 ? 'Un om' : `${active.length} oameni`}, într-o lună în care lucrează toți. Tu scrii costul total, contabilul face actele.`}
          </p>
          {me && <FieldWork value={me.own_field_work ?? null} />}
        </section>

        <section className="card s12" aria-labelledby="pp-list">
          <div className="card-h">
            <h2 id="pp-list">Oamenii fermei</h2>
          </div>
          {active.length === 0 ? (
            <p className="empty">Adaugă tractoristul, mecanicul sau zilierii, cu cât te costă fiecare.</p>
          ) : (
            <div className="rows">
              {active.map((e) => (
                <PersonRow key={e.id} e={e} onOpen={() => setEditing(e)} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <details className="more">
              <summary>Au plecat ({past.length})</summary>
              <div className="rows">
                {past.map((e) => (
                  <PersonRow key={e.id} e={e} onOpen={() => setEditing(e)} />
                ))}
              </div>
            </details>
          )}
          <OfflineNote>Fără internet vezi oamenii și notezi salariile plătite. Ca să adaugi sau să schimbi un om, ai nevoie de internet.</OfflineNote>
        </section>
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} className="detail ev-sheet" label={editing === 'new' ? 'Adaugă un om' : 'Schimbă'} keepOnBackdrop>
        {editing !== null ? <PersonForm key={editing === 'new' ? 'new' : editing.id} person={editing === 'new' ? null : editing} online={online} onClose={() => setEditing(null)} /> : null}
      </Sheet>
    </>
  );
}

function PersonRow({ e, onOpen }: { e: StoredEmployee; onOpen: () => void }) {
  const left = !!e.archived_at;
  return (
    <button type="button" className="row" onClick={onOpen}>
      <span className="r-main">
        <b>{e.name}</b>
        <small>
          {[e.role, kindWord(e.kind), left ? `a plecat${e.ends_on ? ` pe ${date(e.ends_on, true)}` : ''}` : payWords(e)].filter(Boolean).join(' · ')}
        </small>
      </span>
      <span className="r-side">
        <b>{exact(monthlyCost(e))} lei</b>
        <small>pe lună</small>
      </span>
    </button>
  );
}

/** „Am plătit salariile pe [luna]”: each person's pay still due, editable, noted as expenses in one tap. */
function PayMonth({ people, month, transactions }: { people: StoredEmployee[]; month: string; transactions: RecordedPay[] }) {
  const store = useStore()!;
  const view = useView('farm')!;
  const online = useOnline();
  const { notify } = useContext(FrameContext);
  const due = payToRecord(people, transactions, month);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* One id per person per tap, kept on a retry, so a second send can't note the pay twice. */
  const keys = useRef<Record<string, string>>({});

  if (due.length === 0) {
    return <p className="note">{people.length === 0 ? 'Nimic de plătit.' : `Salariile pe ${monthName(month)} sunt notate.`}</p>;
  }
  const text = (p: PayToRecord) => amounts[p.employeeId] ?? String(Math.round(p.amount / 100));

  async function pay() {
    const rows = due.map((p) => ({ p, lei: parseWholeLei(text(p)) }));
    if (rows.some((r) => r.lei == null || r.lei < 0)) return setErr('Scrie fiecare sumă în lei întregi. Pune 0 la cine n-a primit încă.');
    setErr(null);
    setBusy(true);
    try {
      await store.send(async ({ write }) => {
        for (const { p, lei } of rows) {
          if (!lei) continue;
          keys.current[p.employeeId] ??= newIntentKey();
          await write('add_expense', { category: 'salaries', amountLei: lei, date: view.today, employeeId: p.employeeId, envelope: 'payroll', clientId: keys.current[p.employeeId] });
        }
      });
      keys.current = {};
      setAmounts({});
      notify({ tone: 'info', title: 'Am notat salariile', body: online ? 'Planul nu le mai socotește de plătit.' : 'Se trimit când ai internet.' });
    } catch (e) {
      setErr(failText(e, online));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="ev-fields">
        {due.map((p) => (
          <label key={p.employeeId}>
            {p.name} <small>(pe {monthName(p.workMonth)}, ziua de plată {date(p.date)})</small>
            <input inputMode="numeric" autoComplete="off" value={text(p)} onChange={(e) => setAmounts({ ...amounts, [p.employeeId]: e.target.value })} />
            <AmountEcho text={text(p)} />
          </label>
        ))}
      </div>
      <ErrorLine>{err}</ErrorLine>
      <div className="ob-actions">
        <button type="button" className="btn btn-dark" disabled={busy} aria-busy={busy} onClick={() => void pay()}>
          {busy ? 'Se notează…' : `Am plătit salariile pe ${monthName(month)}`}
        </button>
      </div>
      <p className="note">Notează doar ce ai plătit deja. Banii ies din plicul „Salariile oamenilor”, cât e în el.</p>
    </>
  );
}

/** „Lucrările pe câmp le fac oamenii tăi?” (D3). Yes makes Recolte ask for the farm's own cost per ha. */
function FieldWork({ value }: { value: boolean | null }) {
  const store = useStore()!;
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function set(v: boolean) {
    setBusy(true);
    setErr(null);
    try {
      await store.send(({ write }) => write('set_own_field_work', { ownFieldWork: v }));
    } catch (e) {
      setErr(failText(e, online));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="pp-field">
      <legend>Lucrările pe câmp (arat, semănat, recoltat) le fac oamenii tăi?</legend>
      <div className="chips">
        {[
          [true, 'Da'],
          [false, 'Nu, plătesc pe altcineva'],
        ].map(([v, label]) => (
          <NetButton key={String(v)} reason="Răspunsul se salvează când ai internet." className="chip" aria-pressed={value === v} disabled={busy} onClick={() => void set(v as boolean)}>
            {label as string}
          </NetButton>
        ))}
      </div>
      {value === true && <p className="note">Atunci costul pe hectar din Recolte trebuie să fie al fermei tale, fără munca lor, ca să nu fie socotită de două ori.</p>}
      <ErrorLine>{err}</ErrorLine>
    </fieldset>
  );
}

const EMPTY = { name: '', role: '', kind: 'permanent' as EmployeeKind, cost: '', days: '', months: [] as number[], payDay: '10', startsOn: '', endsOn: '' };

function PersonForm({ person, online, onClose }: { person: StoredEmployee | null; online: boolean; onClose: () => void }) {
  const store = useStore()!;
  const view = useView('farm')!;
  const { notify } = useContext(FrameContext);
  const [f, setF] = useState(() =>
    person
      ? {
          name: person.name,
          role: person.role ?? '',
          kind: person.kind,
          cost: String(Math.round(person.cost_bani / 100)),
          days: person.days_per_month ? String(person.days_per_month) : '',
          months: person.active_months ?? [],
          payDay: String(person.pay_day),
          startsOn: person.starts_on,
          endsOn: person.ends_on ?? '',
        }
      : { ...EMPTY, startsOn: view.today },
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leftOn, setLeftOn] = useState(view.today);
  const clientId = useRef(newIntentKey());
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const byDay = f.kind === 'zilier';
  const seasonal = f.kind !== 'permanent';
  const left = !!person?.archived_at;

  /* The person as the API takes it. A seasonal person without months picked works every month. */
  function input() {
    return {
      name: f.name.trim(),
      ...(f.role.trim() ? { role: f.role.trim() } : {}),
      kind: f.kind,
      costLei: parseWholeLei(f.cost) ?? 0,
      payBasis: byDay ? 'day' : 'month',
      ...(byDay ? { daysPerMonth: Number(f.days) || 0 } : {}),
      ...(seasonal && f.months.length ? { activeMonths: f.months } : {}),
      ...(byDay ? {} : { payDay: Number(f.payDay) || 10 }),
      startsOn: f.startsOn,
      ...(f.endsOn ? { endsOn: f.endsOn } : {}),
    };
  }

  function check(): string | null {
    if (!f.name.trim()) return 'Scrie numele.';
    const lei = parseWholeLei(f.cost);
    if (!lei || lei <= 0) return byDay ? 'Scrie cât te costă pe zi, în lei întregi.' : 'Scrie cât te costă pe lună, tot cu taxe, în lei întregi.';
    if (byDay && !(Number(f.days) >= 1 && Number(f.days) <= 31)) return 'Scrie câte zile pe lună vine, de la 1 la 31.';
    if (!f.startsOn) return 'Alege de când lucrează.';
    if (f.endsOn && f.endsOn < f.startsOn) return 'Ultima zi nu poate fi înaintea primei zile.';
    return EmployeeInputSchema.safeParse(input()).success ? null : 'Ceva nu se potrivește. Verifică sumele și zilele.';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = check();
    if (problem) return setErr(problem);
    setErr(null);
    setBusy(true);
    try {
      await store.send(({ write }) => (person ? write('update_employee', { ...input(), id: person.id }) : write('add_employee', { ...input(), clientId: clientId.current })));
      notify({ tone: 'info', title: person ? 'Am schimbat' : `Am adăugat pe ${f.name.trim()}`, body: 'Salariul lui e acum în plan.' });
      onClose();
    } catch (e2) {
      setErr(failText(e2, online));
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    setErr(null);
    try {
      await store.send(({ write }) => write('archive_employee', { id: person!.id, endsOn: leftOn }));
      notify({ tone: 'info', title: `${person!.name} e la „Au plecat”`, body: 'Cheltuielile cu el rămân, cu numele lui.' });
      onClose();
    } catch (e2) {
      setErr(failText(e2, online));
      setBusy(false);
    }
  }

  return (
    <form className="ev-form" noValidate onSubmit={(e) => void submit(e)}>
      <div className="top">
        <h2 tabIndex={-1} autoFocus>
          {person ? person.name : 'Un om nou'}
        </h2>
        <button type="button" className="x" aria-label="Închide" onClick={onClose}>
          ×
        </button>
      </div>

      <fieldset>
        <legend>Cum lucrează</legend>
        <div className="chips">
          {KIND_WORDS.map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={f.kind === k} disabled={left} onClick={() => set({ kind: k, ...(k === 'permanent' ? { months: [] } : {}) })}>
              {label}
            </button>
          ))}
        </div>
        <small className="note">{KIND_WORDS.find(([k]) => k === f.kind)![2]}</small>
      </fieldset>

      <div className="ev-fields">
        <label>
          Numele
          <input value={f.name} maxLength={80} autoComplete="off" disabled={left} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          Ce face <small>(dacă vrei)</small>
          <input value={f.role} maxLength={60} placeholder="tractorist, mecanic…" disabled={left} onChange={(e) => set({ role: e.target.value })} />
        </label>
        <label className="ev-wide">
          {byDay ? 'Cât te costă pe zi, în lei' : 'Cât te costă pe lună, tot cu taxe, în lei'}
          <input inputMode="numeric" autoComplete="off" value={f.cost} disabled={left} onChange={(e) => set({ cost: e.target.value })} />
          <AmountEcho text={f.cost} />
        </label>
        {byDay ? (
          <label>
            Câte zile pe lună vine
            <input inputMode="numeric" value={f.days} disabled={left} onChange={(e) => set({ days: e.target.value })} />
          </label>
        ) : (
          <label>
            În ce zi îl plătești <small>(luna următoare)</small>
            <input inputMode="numeric" value={f.payDay} disabled={left} onChange={(e) => set({ payDay: e.target.value })} />
          </label>
        )}
        <label>
          Lucrează de pe
          <input type="date" value={f.startsOn} disabled={left} onChange={(e) => set({ startsOn: e.target.value })} />
        </label>
        <label>
          Până pe <small>(dacă știi)</small>
          <input type="date" min={f.startsOn} value={f.endsOn} disabled={left} onChange={(e) => set({ endsOn: e.target.value })} />
        </label>
        {seasonal && (
          <fieldset className="ev-wide">
            <legend>În ce luni lucrează {f.months.length === 0 && <small>(nebifat: în toate)</small>}</legend>
            <div className="chips">
              {MONTHS.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  aria-pressed={f.months.includes(i + 1)}
                  disabled={left}
                  onClick={() => set({ months: f.months.includes(i + 1) ? f.months.filter((x) => x !== i + 1) : [...f.months, i + 1].sort((a, b) => a - b) })}
                >
                  {m}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <ErrorLine>{err}</ErrorLine>
      {!left && (
        <div className="ob-actions">
          <NetButton reason="Se salvează când ai internet." type="submit" className="btn btn-dark" disabled={busy} aria-busy={busy}>
            {busy ? 'Se salvează…' : person ? 'Salvează' : 'Adaugă'}
          </NetButton>
        </div>
      )}

      {person && !left && (
        <fieldset className="pp-leave">
          <legend>A plecat de la fermă?</legend>
          {leaving ? (
            <div className="ev-fields">
              <label>
                Ultima zi de lucru
                <input type="date" min={person.starts_on} value={leftOn} onChange={(e) => setLeftOn(e.target.value)} />
              </label>
              <div className="ob-actions">
                <NetButton reason="Se salvează când ai internet." className="btn" disabled={busy || !leftOn} onClick={() => void archive()}>
                  Mută la „Au plecat”
                </NetButton>
              </div>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => setLeaving(true)}>
              A plecat
            </button>
          )}
          <small className="note">Nu se șterge: cheltuielile cu salariul lui rămân, cu numele lui.</small>
        </fieldset>
      )}
    </form>
  );
}
