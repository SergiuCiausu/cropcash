'use client';
/* „Contracte”: every contract the farm signed, arendă included (docs/contracts-plan.md §7). Three tabs: what to decide
   and by when, all of them by type, and the taxes they bring to the state. A contract's card says what it weighs
   on the farm's money (§5.2). Shared by /contracte and /ferma-lui-ion/contracte (screens/contracte.tsx).
   Offline: everything reads from the copy on the phone and is computed here. „Am hotărât” waits in the queue (it
   only notes a decision). Adding or changing a contract, and the farm's tax answers, need internet: a queued
   contract couldn't name another side added offline. On Ion's farm a decision stays on the phone. */
import { useContext, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AddFarmContractInputSchema,
  decisionsFor,
  PAYMENT_REPEATS,
  UpdateFarmContractInputSchema,
  type ContractDecision,
  type PartyKind,
  type PaymentRepeat,
  type StoredContractPayment,
  type StoredFarmContract,
} from '../../../packages/shared/src/contracts/model';
import { offeredKinds, type AnyContractKind, type ContractKind } from '../../../packages/shared/src/contracts/types';
import { defaultVatBp, type LegalForm, type TaxLine, type VatStatus } from '../../../packages/shared/src/contracts/taxes';
import type { ContractView } from '../../../packages/shared/src/contracts/view';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import {
  ACTION_DECISION,
  ACTION_WORDS,
  contractViews,
  contractWindow,
  decisionWords,
  dueLine,
  farmSummary,
  flowAmount,
  inForce,
  KIND_ICONS,
  kindName,
  LEGAL_FORM_WORDS,
  refusalLetter,
  taxCsv,
  taxName,
  taxRows,
  toDecide,
  uninsured,
  VAT_WORDS,
  windowMoney,
} from '../../lib/cc/contracts';
import { date, exact, failText, ha } from '../../lib/cc/format';
import { useFarm, useOnline, useStore, useView } from '../../lib/cc/react';
import { newIntentKey } from '../../lib/live/intent';
import { ErrorLine, Icon, NetButton, OfflineNote, Sheet, useHref, Verify } from '../app/bits';
import { FrameContext } from '../app/context';
import { PageLink } from '../app/Frame';
import { monthName } from '../app/ItemSheet';
import '../../styles/events.css';
import '../../styles/people.css';
import '../../styles/arenda.css';
import '../../styles/contracts.css';

type Tab = 'decide' | 'all' | 'taxes';
type Open = { view: string } | { add: true } | { edit: string } | { letter: string } | null;

export default function Contracte() {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const href = useHref();
  const data = view.data();
  const today = view.today;
  const fc = farm.contracts;
  const months = data.params.forecast.plan_months.value;
  const views = useMemo(() => contractViews(fc, data, contractWindow(today, months)), [fc, data, today, months]);
  const due = useMemo(() => toDecide(views, today), [views, today]);
  const summary = useMemo(() => farmSummary(views, today), [views, today]);
  const [tab, setTab] = useState<Tab>(due.length ? 'decide' : 'all');
  const [open, setOpen] = useState<Open>(null);
  const cropName = (id: string) => data.crops.crops.find((c) => c.id === id)?.name_ro ?? data.catalogue.find((c) => c.id === id)?.name_ro ?? id;
  const opened = open && 'view' in open ? views.find((v) => v.id === open.view) : open && 'letter' in open ? views.find((v) => v.id === open.letter) : null;
  const editing = open && 'edit' in open ? fc.contracts.find((c) => c.id === open.edit) : null;

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Contracte</h1>
          <p className="lead">Tot ce ai semnat: până când merge, ce ai de hotărât și cât te costă, cu banii la stat.</p>
        </div>
        {farm.me && (
          <div className="acts">
            <NetButton reason="Un contract nou se adaugă când ai internet." className="btn btn-dark" onClick={() => setOpen({ add: true })}>
              Adaugă un contract
            </NetButton>
          </div>
        )}
      </header>
      {farm.isIon && <p className="note">Pe ferma lui Ion, contractele sunt exemple. Ce hotărăști aici rămâne doar pe telefonul ăsta.</p>}

      <section className="card" aria-labelledby="ct-sum">
        <h2 id="ct-sum" className="sr-only">
          Pe scurt
        </h2>
        <dl className="ar-facts">
          <div>
            <dt>În vigoare</dt>
            <dd>{summary.count}</dd>
          </div>
          <div>
            <dt>Primești, în {months} luni</dt>
            <dd>{exact(summary.inBani)} lei</dd>
          </div>
          <div>
            <dt>Plătești, în {months} luni</dt>
            <dd>{exact(summary.outBani)} lei</dd>
          </div>
          <div>
            <dt>Bani la stat</dt>
            <dd>{exact(summary.taxes.toStateBani)} lei</dd>
          </div>
        </dl>
        {summary.taxes.unknown > 0 && <p className="note">Plus {summary.taxes.unknown === 1 ? 'o sumă pe care n-o știm încă' : `${summary.taxes.unknown} sume pe care nu le știm încă`}: vezi Taxe.</p>}
        {summary.next && <p className="note">Următorul de hotărât: {summary.next.party}. {dueLine(summary.next, today)}</p>}
      </section>

      <div className="vtabs" role="group" aria-label="Ce arată pagina">
        {(
          [
            ['decide', due.length ? `De hotărât (${due.length})` : 'De hotărât'],
            ['all', 'Toate'],
            ['taxes', 'Taxe'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} type="button" className="chip" aria-pressed={tab === t} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'decide' && (
        <div className="ct-due">
          {due.length === 0 ? (
            <p className="empty">Nimic de hotărât acum. Îți spunem din timp, aici și pe Acasă.</p>
          ) : (
            due.map((v) => <DueCard key={v.id} v={v} onOpen={() => setOpen({ view: v.id })} onLetter={() => setOpen({ letter: v.id })} />)
          )}
        </div>
      )}
      {tab === 'all' && <AllContracts views={views} cropName={cropName} onOpen={(id) => setOpen({ view: id })} />}
      {tab === 'taxes' && <Taxes views={views} />}

      <OfflineNote>Fără internet vezi contractele, termenele și taxele, și poți nota ce ai hotărât. Ca să adaugi sau să schimbi un contract, ai nevoie de internet.</OfflineNote>

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        className="detail ev-sheet"
        label={open && 'add' in open ? 'Adaugă un contract' : open && 'edit' in open ? 'Schimbă contractul' : open && 'letter' in open ? 'Scrisoarea de refuz' : 'Contractul'}
        keepOnBackdrop={!!open && ('add' in open || 'edit' in open)}
      >
        {open === null ? null : 'add' in open ? (
          <AddContract onClose={() => setOpen(null)} cropName={cropName} arendaHref={href('/arenda')} />
        ) : 'edit' in open ? (
          editing ? <ContractForm key={editing.id} kind={editing.kind} contract={editing} cropName={cropName} onClose={() => setOpen({ view: editing.id })} /> : null
        ) : 'letter' in open ? (
          opened ? <Letter v={opened} onClose={() => setOpen({ view: opened.id })} /> : null
        ) : opened ? (
          <ContractCard v={opened} cropName={cropName} onClose={() => setOpen(null)} onEdit={() => setOpen({ edit: opened.id })} onLetter={() => setOpen({ letter: opened.id })} />
        ) : null}
      </Sheet>
    </>
  );
}

// ── De hotărât ────────────────────────────────────────────────────────────────────

/** Records a decision: sent, queued without internet, or kept on Ion's phone. */
function useDecide(v: ContractView) {
  const store = useStore()!;
  const view = useView('farm')!;
  const online = useOnline();
  const farm = useFarm()!;
  const { notify } = useContext(FrameContext);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function decide(decision: ContractDecision | null, after?: () => void) {
    setBusy(true);
    setErr(null);
    try {
      await store.decideContract({ id: v.id, source: v.source === 'arenda' ? 'arenda' : 'contract', decision, decidedOn: view.today });
      notify({ tone: 'info', title: decision ? 'Am notat ce ai hotărât' : 'Am șters hotărârea', body: farm.me && !online ? 'Se trimite când ai internet.' : '' });
      after?.();
    } catch (e) {
      setErr(failText(e, online));
    } finally {
      setBusy(false);
    }
  }
  return { decide, busy, err };
}

/** The end buttons that record a decision this kind accepts. */
const decisionActions = (v: ContractView) => v.end.actions.filter((a) => ACTION_DECISION[a] && decisionsFor(v.kind).includes(ACTION_DECISION[a]!));

function Decision({ v, onLetter }: { v: ContractView; onLetter: () => void }) {
  const { decide, busy, err } = useDecide(v);
  const today = useView('farm')!.today;
  const actions = decisionActions(v);
  const decided = v.end.decision;
  if (v.end.status === 'ended' && !uninsured(v, today)) return null;
  return (
    <div className="ct-decide">
      {decided ? (
        <>
          <p className="ct-decided">
            <Icon name="check" /> {decisionWords(v.kind, decided)}
          </p>
          <div className="chips">
            {v.kind === 'arenda' && decided === 'end' && (
              <button type="button" className="btn" onClick={onLetter}>
                Scrisoarea de refuz
              </button>
            )}
            <button type="button" className="btn" disabled={busy} onClick={() => void decide(null)}>
              Schimbă hotărârea
            </button>
          </div>
        </>
      ) : actions.length ? (
        <div className="chips">
          {actions.map((a) => (
            <button key={a} type="button" className="btn" disabled={busy} onClick={() => void decide(ACTION_DECISION[a]!, v.kind === 'arenda' && a === 'refuse' ? onLetter : undefined)}>
              {ACTION_WORDS[a]}
            </button>
          ))}
        </div>
      ) : v.kind === 'sale' ? (
        <p className="note">Când livrezi și primești banii, notează vânzarea la Recolte.</p>
      ) : v.kind === 'supply' ? (
        <p className="note">Când plătești, notează cheltuiala la Recolte.</p>
      ) : null}
      <ErrorLine>{err}</ErrorLine>
    </div>
  );
}

function DueCard({ v, onOpen, onLetter }: { v: ContractView; onOpen: () => void; onLetter: () => void }) {
  const view = useView('farm')!;
  const data = view.data();
  const late = v.end.status === 'overdue' || uninsured(v, view.today);
  return (
    <section className={`card ct-card${late ? ' late' : ''}`} aria-label={`${kindName(data, v.kind)} cu ${v.party}`}>
      <button type="button" className="ct-head" onClick={onOpen}>
        <span className="ti b">
          <Icon name={KIND_ICONS[v.kind]} />
        </span>
        <span className="r-main">
          <b>{v.party || kindName(data, v.kind)}</b>
          <small>{[kindName(data, v.kind), v.title].filter(Boolean).join(' · ')}</small>
        </span>
      </button>
      <p className="ct-line">{dueLine(v, view.today)}</p>
      <Decision v={v} onLetter={onLetter} />
    </section>
  );
}

// ── Toate ─────────────────────────────────────────────────────────────────────────

function AllContracts({ views, cropName, onOpen }: { views: ContractView[]; cropName: (id: string) => string; onOpen: (id: string) => void }) {
  const view = useView('farm')!;
  const onServer = !!useFarm()!.me;
  const data = view.data();
  const live = views.filter(inForce);
  const past = views.filter((v) => !inForce(v));
  const kinds = [...new Set(live.map((v) => v.kind))];
  const row = (v: ContractView) => {
    const m = windowMoney(v);
    const money = m.inBani ? `+${exact(m.inBani)} lei` : m.outBani ? `−${exact(m.outBani)} lei` : m.kg ? flowAmount({ amountBani: null, kg: m.kg }, cropName, v.cropId) : '—';
    return (
      <button key={v.id} type="button" className="row" onClick={() => onOpen(v.id)}>
        <span className="r-main">
          <b>{v.party || kindName(data, v.kind)}</b>
          <small>
            {[v.title, v.end.endsOn ? `până pe ${date(v.end.endsOn, true)}` : 'fără sfârșit scris', v.end.decision ? 'hotărât' : v.end.status === 'renewed' ? 'reînnoit' : ''].filter(Boolean).join(' · ')}
          </small>
        </span>
        <span className="r-side">
          <b className={m.inBani ? 'pos' : ''}>{money}</b>
          <small>în {data.params.forecast.plan_months.value} luni</small>
        </span>
      </button>
    );
  };
  if (!live.length && !past.length)
    return <p className="empty">{onServer ? 'Niciun contract încă. Adaugă-l pe primul: o vânzare, un leasing, o asigurare.' : 'Niciun contract.'}</p>;
  return (
    <div className="bento">
      {kinds.map((k) => (
        <section key={k} className="card s12" aria-labelledby={`ct-k-${k}`}>
          <div className="card-h">
            <h2 id={`ct-k-${k}`}>{kindName(data, k)}</h2>
          </div>
          <div className="rows">{live.filter((v) => v.kind === k).map(row)}</div>
        </section>
      ))}
      {past.length > 0 && (
        <section className="card s12">
          <details className="more">
            <summary>Încheiate ({past.length})</summary>
            <div className="rows">{past.map(row)}</div>
          </details>
        </section>
      )}
    </div>
  );
}

// ── Cardul unui contract ──────────────────────────────────────────────────────────

function ImpactLines({ v }: { v: ContractView }) {
  const view = useView('farm')!;
  const impact = useMemo(() => view.contractImpact(v.id), [view, v.id]);
  if (!impact) return null;
  const lines: string[] = [];
  for (const y of impact.years) {
    const parts = [y.inBani ? `primești ${exact(y.inBani)} lei` : '', y.outBani ? `plătești ${exact(y.outBani)} lei` : '', y.taxBani > 0 ? `plus ${exact(y.taxBani)} lei taxe` : y.taxBani < 0 ? `și primești înapoi ${exact(-y.taxBani)} lei TVA` : ''].filter(Boolean);
    if (!parts.length) continue;
    const share = y.outBani && y.shareOfOutPct !== null ? ` Asta e ${y.shareOfOutPct}% din cheltuielile fermei pe recolta asta.` : y.inBani && y.shareOfInPct !== null ? ` Asta e ${y.shareOfInPct}% din banii care intră pe recolta asta.` : '';
    lines.push(`Pentru recolta ${y.year}: ${parts.join(', ')}.${share}`);
  }
  const s = impact.salary;
  if (s.withBani !== s.withoutBani) lines.push(`Fără contractul ăsta, salariul tău lunar ar fi ${exact(s.withoutBani)} lei, nu ${exact(s.withBani)} lei.`);
  const u = impact.untilEnd;
  const outLeft = u.outBani + Math.max(0, u.taxBani);
  const until = u.pastPlan ? ` în următoarele ${view.data().params.forecast.plan_months.value} luni (merge și după)` : ` până pe ${date(u.through, true)}`;
  if (outLeft) lines.push(`Mai ai de plătit ${exact(outLeft)} lei${until}.`);
  if (u.inBani) lines.push(`Mai ai de primit ${exact(u.inBani)} lei${until}.`);
  if (impact.perHa)
    lines.push(
      impact.perHa.leftBani >= 0
        ? `Pământul ăsta îți lasă ${exact(impact.perHa.leftBani)} lei pe hectar pe an, după arendă.`
        : `Pământul ăsta te costă cu ${exact(-impact.perHa.leftBani)} lei pe hectar pe an mai mult decât aduce, după arendă.`,
    );
  if (!lines.length) return null;
  return (
    <fieldset className="ar-contracts">
      <legend>Ce înseamnă pentru banii fermei</legend>
      <ul className="ct-impact">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </fieldset>
  );
}

const taxAmount = (l: TaxLine) => (l.amountBani === null ? 'nu știm încă' : `${l.effect === 'deductible' ? '−' : ''}${exact(l.amountBani)} lei`);

function ContractCard({ v, cropName, onClose, onEdit, onLetter }: { v: ContractView; cropName: (id: string) => string; onClose: () => void; onEdit: () => void; onLetter: () => void }) {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const store = useStore()!;
  const online = useOnline();
  const href = useHref();
  const { notify } = useContext(FrameContext);
  const data = view.data();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stored = v.source === 'contract' ? farm.contracts.contracts.find((c) => c.id === v.id) : null;
  const ended = v.end.status === 'ended';
  const flows = v.flows.slice(0, 6);
  const taxes = v.taxes.filter((l) => l.effect !== 'cost' || l.amountBani !== null).slice(0, 6);

  async function archive() {
    setBusy(true);
    setErr(null);
    try {
      await store.send(({ write }) => write('archive_contract', { id: v.id }));
      notify({ tone: 'info', title: 'Contractul e încheiat', body: 'Rămâne la „Încheiate”. Nu se șterge nimic.' });
      onClose();
    } catch (e) {
      setErr(failText(e, online));
      setBusy(false);
    }
  }

  return (
    <div className="ev-form">
      <div className="top">
        <h2 tabIndex={-1} autoFocus>
          {v.party || kindName(data, v.kind)}
        </h2>
        <button type="button" className="x" aria-label="Închide" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="note">
        {[kindName(data, v.kind), v.title, stored?.number ? `nr. ${stored.number}` : '', v.areaAri ? `${ha(v.areaAri)} ha` : ''].filter(Boolean).join(' · ')}
      </p>
      <dl className="ar-owed">
        <div>
          <dt>De pe</dt>
          <dd>{date(v.startsOn, true)}</dd>
        </div>
        <div>
          <dt>Până pe</dt>
          <dd>
            {v.end.endsOn ? date(v.end.endsOn, true) : 'fără sfârșit scris'}
            {v.end.term.index > 0 ? ', după reînnoire' : ''}
          </dd>
        </div>
      </dl>
      <p className="ct-line">{ended ? (v.end.decision ? `S-a încheiat. ${decisionWords(v.kind, v.end.decision)}` : 'S-a încheiat.') : dueLine(v, view.today)}</p>
      {v.end.renewsItself && !ended && <p className="note">Dacă nu hotărăști nimic, se reînnoiește singur.</p>}
      <Decision v={v} onLetter={onLetter} />
      {v.kind === 'arenda' && !v.end.decision && !ended && (
        <button type="button" className="btn ct-letter" onClick={onLetter}>
          Vezi scrisoarea de refuz
        </button>
      )}

      <ImpactLines v={v} />

      {flows.length > 0 && (
        <fieldset className="ar-contracts">
          <legend>Plățile care urmează</legend>
          <div className="rows">
            {flows.map((f) => (
              <div key={`${f.paymentId}:${f.date}`} className="row ct-flow">
                <span className="r-main">
                  <b>{f.label ?? (f.direction === 'in' ? 'Primești' : 'Plătești')}</b>
                  <small>{date(f.date, true)}</small>
                </span>
                <span className="r-side">
                  <b className={f.direction === 'in' ? 'pos' : ''}>
                    {f.direction === 'in' ? '+' : '−'}
                    {flowAmount(f, cropName, f.cropId ?? v.cropId)}
                  </b>
                </span>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      {taxes.length > 0 && (
        <fieldset className="ar-contracts">
          <legend>Taxele lui</legend>
          <div className="rows">
            {taxes.map((l, i) => (
              <div key={`${l.tax}:${l.dueOn}:${i}`} className="row ct-flow">
                <span className="r-main">
                  <b>
                    {taxName(l)} {l.status === 'DE-VERIFICAT' && <Verify />}
                  </b>
                  <small>{[l.dueOn ? `până pe ${date(l.dueOn, true)}` : '', l.form ? `formularul ${l.form}` : '', l.note].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="r-side">
                  <b>{taxAmount(l)}</b>
                </span>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <ErrorLine>{err}</ErrorLine>
      {v.kind === 'arenda' ? (
        <p className="note">
          Arenda o schimbi la <PageLink path="/arenda" href={href('/arenda')}>Arendă</PageLink>, unde sunt proprietarii și plata arenzii.
        </p>
      ) : (
        farm.me &&
        stored &&
        !stored.archived_at && (
          <div className="ob-actions">
            <NetButton reason="Se schimbă când ai internet." className="btn btn-dark" disabled={busy} onClick={onEdit}>
              Schimbă contractul
            </NetButton>
            <NetButton reason="Se salvează când ai internet." className="btn" disabled={busy} onClick={() => void archive()}>
              Contractul s-a încheiat
            </NetButton>
          </div>
        )
      )}
    </div>
  );
}

// ── Scrisoarea de refuz (arendă, §3.3) ────────────────────────────────────────────

function Letter({ v, onClose }: { v: ContractView; onClose: () => void }) {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const c = farm.contracts.leases.find((x) => x.id === v.id);
  const owner = farm.contracts.landowners.find((o) => o.id === c?.landowner_id);
  const [copied, setCopied] = useState(false);
  if (!c || !owner) return null;
  const text = refusalLetter(c, owner, view.farm.name, view.today);
  function print() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.title = 'Refuzul reînnoirii arenzii';
    const pre = w.document.createElement('pre');
    pre.style.cssText = 'font: 15px/1.6 Georgia, serif; white-space: pre-wrap; max-width: 640px; margin: 48px auto;';
    pre.textContent = text;
    w.document.body.appendChild(pre);
    w.print();
  }
  return (
    <div className="ev-form">
      <div className="top">
        <h2 tabIndex={-1} autoFocus>
          Scrisoarea de refuz
        </h2>
        <button type="button" className="x" aria-label="Înapoi la contract" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="note">
        Refuzul se face în scris{v.end.actBy ? `, până pe ${date(v.end.actBy, true)}` : ''}. Trimite-o cu confirmare de primire și păstrează dovada. Textul e un model: nu e verificat încă de un avocat.
      </p>
      <textarea className="ct-letter-text" readOnly rows={14} value={text} aria-label="Textul scrisorii" />
      <div className="ob-actions">
        <button type="button" className="btn btn-dark" onClick={print}>
          Tipărește
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void navigator.clipboard
              ?.writeText(text)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }
        >
          {copied ? 'Copiat' : 'Copiază textul'}
        </button>
      </div>
    </div>
  );
}

// ── Taxe (§4.3) ───────────────────────────────────────────────────────────────────

function Taxes({ views }: { views: ContractView[] }) {
  const view = useView('farm')!;
  const live = views.filter(inForce);
  const rows = useMemo(() => taxRows(live), [live]);
  const who = new Map(views.map((v) => [v.id, v.party]));
  function downloadCsv() {
    const url = URL.createObjectURL(new Blob(['﻿' + taxCsv(live)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `taxe-contracte-${view.today.slice(0, 7)}-pentru-contabil.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="bento">
      <TaxProfileCard />
      <section className="card s12" aria-labelledby="ct-tax">
        <div className="card-h">
          <h2 id="ct-tax">Bani la stat, lună de lună</h2>
        </div>
        {rows.months.length === 0 ? (
          <p className="empty">Contractele tale nu aduc taxe de plătit în lunile care urmează.</p>
        ) : (
          rows.months.map((m) => (
            <div key={m.month ?? 'x'} className="ar-village">
              <h3>
                {m.month ? monthName(m.month) : 'Fără dată'} · {exact(m.totals.toStateBani)} lei
                {m.totals.unknown > 0 ? `, plus ${m.totals.unknown === 1 ? 'o sumă necunoscută' : `${m.totals.unknown} sume necunoscute`}` : ''}
              </h3>
              <div className="rows">
                {m.lines.map((l, i) => (
                  <div key={`${l.contractId}:${l.tax}:${i}`} className="row ct-flow">
                    <span className="r-main">
                      <b>
                        {taxName(l)} {l.effect === 'withheld' && <span className="tag n">reținut</span>} {l.status === 'DE-VERIFICAT' && <Verify />}
                      </b>
                      <small>{[who.get(l.contractId) ? `contractul cu ${who.get(l.contractId)}` : '', `la ${l.to === 'ANAF' ? 'ANAF' : 'primărie'}`, l.form ? `formularul ${l.form}` : '', l.dueOn ? `până pe ${date(l.dueOn, true)}` : '', l.note].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="r-side">
                      <b>{taxAmount(l)}</b>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        {rows.totals.withheldBani > 0 && <p className="note">Impozitul reținut îl oprești din arenda proprietarilor și îl plătești tu la ANAF: nu e din banii tăi.</p>}
        {rows.costBani > 0 && <p className="note">TVA plătit pe facturi, pe care nu-l primești înapoi: {exact(rows.costBani)} lei. E în cheltuieli, nu la stat.</p>}
        {rows.months.length > 0 && (
          <button type="button" className="btn ar-csv" onClick={downloadCsv}>
            Lista pentru contabil
          </button>
        )}
        <p className="note">Sumele le socotește aplicația din contracte. Le confirmă contabilul.</p>
      </section>
    </div>
  );
}

function TaxProfileCard() {
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const { notify } = useContext(FrameContext);
  const row = farm.contracts.profileRow;
  const [f, setF] = useState<{ legalForm: LegalForm | null; vatStatus: VatStatus | null; micro: boolean | null }>({ legalForm: row.legal_form ?? null, vatStatus: row.vat_status ?? null, micro: row.micro_tax ?? null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const editable = !!farm.me;
  const unknown = !row.legal_form || !row.vat_status || (row.legal_form === 'srl' && row.micro_tax == null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await store.send(({ write }) => write('set_tax_profile', { legalForm: f.legalForm, vatStatus: f.vatStatus, micro: f.legalForm === 'srl' ? f.micro : null }));
      notify({ tone: 'info', title: 'Am salvat', body: 'Taxele contractelor se socotesc după răspunsurile tale.' });
    } catch (e) {
      setErr(failText(e, online));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card s12" aria-labelledby="ct-prof">
      <div className="card-h">
        <h2 id="ct-prof">Ce fel de fermă ești</h2>
      </div>
      <fieldset className="ct-q">
        <legend>Forma</legend>
        <div className="chips">
          {LEGAL_FORM_WORDS.map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={f.legalForm === k} disabled={!editable} onClick={() => setF({ ...f, legalForm: k, micro: k === 'srl' ? f.micro : null })}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="ct-q">
        <legend>TVA</legend>
        <div className="chips">
          {VAT_WORDS.map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={f.vatStatus === k} disabled={!editable} onClick={() => setF({ ...f, vatStatus: k })}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      {f.legalForm === 'srl' && (
        <fieldset className="ct-q">
          <legend>Plătești impozitul pe veniturile microîntreprinderii?</legend>
          <div className="chips">
            {(
              [
                [true, 'Da'],
                [false, 'Nu'],
              ] as [boolean, string][]
            ).map(([k, label]) => (
              <button key={label} type="button" className="chip" aria-pressed={f.micro === k} disabled={!editable} onClick={() => setF({ ...f, micro: k })}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {unknown && <p className="note">Până ne spui, TVA-ul pe ce plătești intră ca un cost, iar TVA-ul pe vânzări și impozitul micro nu sunt în plan. Dacă nu știi, întreabă contabilul.</p>}
      {!editable && <p className="note">Ion e persoană fizică și nu plătește TVA. Pe ferma ta răspunzi tu aici.</p>}
      <ErrorLine>{err}</ErrorLine>
      {editable && (
        <NetButton reason="Se salvează când ai internet." className="btn btn-dark" disabled={busy} aria-busy={busy} onClick={() => void save()}>
          {busy ? 'Se salvează…' : 'Salvează'}
        </NetButton>
      )}
    </section>
  );
}

// ── Adaugă / schimbă ──────────────────────────────────────────────────────────────

function AddContract({ onClose, cropName, arendaHref }: { onClose: () => void; cropName: (id: string) => string; arendaHref: string }) {
  const view = useView('farm')!;
  const data = view.data();
  const [kind, setKind] = useState<ContractKind | null>(null);
  if (kind) return <ContractForm kind={kind} contract={null} cropName={cropName} onClose={onClose} onBack={() => setKind(null)} />;
  return (
    <div className="ev-form">
      <div className="top">
        <h2 tabIndex={-1} autoFocus>
          Ce fel de contract?
        </h2>
        <button type="button" className="x" aria-label="Închide" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="ct-tiles">
        {offeredKinds(data.contractTypes).map((k) =>
          k === 'arenda' ? (
            <PageLink key={k} path="/arenda" href={arendaHref} className="ct-tile">
              <Icon name={KIND_ICONS[k]} />
              <span>{kindName(data, k)}</span>
            </PageLink>
          ) : (
            <button key={k} type="button" className="ct-tile" onClick={() => setKind(k as ContractKind)}>
              <Icon name={KIND_ICONS[k]} />
              <span>{kindName(data, k)}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

type PayRow = { label: string; firstOn: string; repeat: PaymentRepeat; times: string; lei: string; kg: string };
const REPEAT_WORDS: Record<PaymentRepeat, string> = { none: 'o dată', monthly: 'în fiecare lună', quarterly: 'o dată la 3 luni', yearly: 'în fiecare an' };
const LABEL_HINT: Partial<Record<ContractKind, string>> = { sale: 'Avans, La livrare', supply: 'La recoltă', leasing: 'Rata', insurance: 'Prima', service: 'Factura' };
const toLei = (bani: number | null) => (bani === null ? '' : String(Math.round(bani / 100)));
const optionalWhole = (s: string) => (s.trim() === '' ? undefined : (parseWholeLei(s) ?? NaN));
const optionalNumber = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));

function payRowOf(p: StoredContractPayment): PayRow {
  return { label: p.label ?? '', firstOn: p.first_on, repeat: p.repeat, times: p.times ? String(p.times) : '', lei: toLei(p.amount_bani), kg: p.kg ? String(p.kg) : '' };
}

/** Why the input was refused, in words, from the first issue's path. */
function problemOf(path: readonly PropertyKey[]): string {
  const [head, , field] = path;
  if (head === 'endsOn') return 'Sfârșitul nu poate fi înaintea începutului.';
  if (head === 'cropId') return 'Alege cultura.';
  if (head === 'payments' && field === 'firstOn') return 'O plată cade în afara contractului: verifică datele.';
  if (head === 'payments' && field === 'perHa') return 'Scrie hectarele, la „Mai multe detalii”.';
  if (head === 'payments') return 'Scrie suma fiecărei plăți, în lei.';
  if (head === 'autoRenews' || head === 'renewMonths') return 'Un contract care se reînnoiește are nevoie de data de sfârșit.';
  return 'Ceva nu se potrivește. Verifică datele și sumele.';
}

function ContractForm({ kind, contract, cropName, onClose, onBack }: { kind: ContractKind; contract: StoredFarmContract | null; cropName: (id: string) => string; onClose: () => void; onBack?: () => void }) {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const store = useStore()!;
  const online = useOnline();
  const { notify } = useContext(FrameContext);
  const data = view.data();
  const c = contract;
  const parties = farm.contracts.parties.filter((p) => !p.archived_at || p.id === c?.party_id);
  const payments = c ? farm.contracts.payments.filter((p) => p.contract_id === c.id) : [];
  const vatDefault = defaultVatBp(kind, data.contractTaxes).bp;
  const [f, setF] = useState({
    partyId: c?.party_id ?? (parties[0]?.id ?? ''),
    newName: '',
    newKind: 'company' as PartyKind,
    newCui: '',
    startsOn: c?.starts_on ?? view.today,
    endsOn: c?.ends_on ?? '',
    direction: (payments[0]?.direction ?? (kind === 'sale' ? 'in' : 'out')) as 'in' | 'out',
    pays: payments.length ? payments.map(payRowOf) : [{ label: '', firstOn: c?.starts_on ?? view.today, repeat: (kind === 'leasing' ? 'monthly' : kind === 'insurance' ? 'yearly' : 'none') as PaymentRepeat, times: '', lei: '', kg: '' }],
    autoRenews: c ? c.auto_renews : (null as boolean | null),
    cropId: c?.crop_id ?? (kind === 'sale' ? 'grau' : ''),
    tonnes: c?.quantity_kg ? String(c.quantity_kg / 1000).replace('.', ',') : '',
    title: c?.title ?? '',
    number: c?.number ?? '',
    signedOn: c?.signed_on ?? '',
    notice: c?.notice_days != null ? String(c.notice_days) : '',
    vat: c?.vat_bp != null ? String(c.vat_bp / 100).replace('.', ',') : '',
    residual: toLei(c?.residual_bani ?? null),
    area: c?.area_ari ? String(c.area_ari / 100).replace('.', ',') : '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientIds = useRef({ party: newIntentKey(), contract: newIntentKey() });
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const setPay = (i: number, patch: Partial<PayRow>) => set({ pays: f.pays.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const newParty = f.partyId === '' || !parties.some((p) => p.id === f.partyId);
  const inKind = kind === 'sale' || kind === 'supply';
  const cropIds = [...new Set([...(farm.me?.parcels ?? []).map((p) => p.crop_id), 'grau', 'porumb', 'floarea-soarelui'])];

  function input(partyId: string) {
    const tonnes = optionalNumber(f.tonnes);
    const vat = optionalNumber(f.vat);
    return {
      partyId,
      kind,
      ...(f.title.trim() ? { title: f.title.trim() } : {}),
      ...(f.number.trim() ? { number: f.number.trim() } : {}),
      ...(f.signedOn ? { signedOn: f.signedOn } : {}),
      startsOn: f.startsOn,
      ...(f.endsOn ? { endsOn: f.endsOn } : {}),
      ...(f.autoRenews !== null && f.endsOn ? { autoRenews: f.autoRenews } : {}),
      ...(optionalWhole(f.notice) !== undefined ? { noticeDays: optionalWhole(f.notice) } : {}),
      ...(c?.renew_months && f.endsOn ? { renewMonths: c.renew_months } : {}),
      plotIds: c?.plot_ids ?? [],
      ...(optionalNumber(f.area) !== undefined ? { areaHa: optionalNumber(f.area) } : {}),
      ...(kind === 'sale' || (kind === 'supply' && f.cropId) ? { cropId: f.cropId } : {}),
      ...(tonnes !== undefined && f.cropId ? { quantityKg: Math.round(tonnes * 1000) } : {}),
      ...(vat !== undefined ? { vatBp: Math.round(vat * 100) } : {}),
      ...(kind === 'leasing' && optionalWhole(f.residual) !== undefined ? { residualLei: optionalWhole(f.residual) } : {}),
      payments: f.pays.map((p) => {
        const lei = optionalWhole(p.lei);
        const kg = optionalWhole(p.kg);
        return {
          direction: f.direction,
          ...(p.label.trim() ? { label: p.label.trim() } : {}),
          firstOn: p.firstOn,
          repeat: p.repeat,
          ...(p.repeat !== 'none' && optionalWhole(p.times) !== undefined ? { times: optionalWhole(p.times) } : {}),
          ...(lei !== undefined ? { amountLei: lei } : {}),
          ...(kg !== undefined && inKind ? { kg, cropId: f.cropId || 'grau' } : {}),
        };
      }),
    };
  }

  function check(): string | null {
    if (newParty && !f.newName.trim()) return 'Scrie cu cine e contractul.';
    if (!f.startsOn) return 'Alege de când e contractul.';
    if (kind === 'sale' && !f.cropId) return 'Alege cultura pe care o vinzi.';
    for (const p of f.pays) {
      if (!p.firstOn) return 'Alege data fiecărei plăți.';
      if (p.lei.trim() === '' && (!inKind || p.kg.trim() === '')) return inKind ? 'Scrie suma în lei sau kilogramele, la fiecare plată.' : 'Scrie suma fiecărei plăți, în lei.';
      if ([p.lei, p.kg, p.times].some((s) => Number.isNaN(optionalWhole(s)))) return 'Scrie sumele în lei întregi și kilogramele în numere întregi.';
    }
    if ([f.tonnes, f.vat, f.area].some((s) => Number.isNaN(optionalNumber(s))) || Number.isNaN(optionalWhole(f.notice)) || Number.isNaN(optionalWhole(f.residual))) return 'Verifică numerele de la „Mai multe detalii”.';
    const schema = c ? UpdateFarmContractInputSchema : AddFarmContractInputSchema;
    const parsed = schema.safeParse(c ? { ...input(f.partyId || '00000000-0000-4000-8000-000000000000'), id: c.id } : input(newParty ? '00000000-0000-4000-8000-000000000000' : f.partyId));
    return parsed.success ? null : problemOf(parsed.error.issues[0]?.path ?? []);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = check();
    if (problem) return setErr(problem);
    setErr(null);
    setBusy(true);
    try {
      await store.send(async ({ write }) => {
        let partyId = f.partyId;
        if (newParty) {
          /* Never queued (it needs internet), so the answer always has the id. */
          const res = await write<{ id: string }>('add_party', { name: f.newName.trim(), kind: f.newKind, ...(f.newKind === 'company' && f.newCui.trim() ? { cui: f.newCui.trim() } : {}), clientId: clientIds.current.party });
          if ('id' in res) partyId = res.id;
        }
        if (c) await write('update_contract', { ...input(partyId), id: c.id });
        else await write('add_contract', { ...input(partyId), clientId: clientIds.current.contract });
      });
      notify({ tone: 'info', title: c ? 'Am schimbat contractul' : 'Am adăugat contractul', body: 'E în plan și în calendar.' });
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
          {c ? 'Schimbă contractul' : kindName(data, kind)}
        </h2>
        <button type="button" className="x" aria-label={onBack ? 'Înapoi' : 'Închide'} onClick={onBack ?? onClose}>
          ×
        </button>
      </div>

      <div className="ev-fields">
        <label className="ev-wide">
          Cu cine
          <select value={newParty ? '' : f.partyId} onChange={(e) => set({ partyId: e.target.value })}>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="">cineva nou…</option>
          </select>
        </label>
        {newParty && (
          <>
            <label>
              Numele
              <input value={f.newName} maxLength={80} autoComplete="off" placeholder="Cereale Câmpia SRL" onChange={(e) => set({ newName: e.target.value })} />
            </label>
            <fieldset>
              <legend>E o firmă sau un om?</legend>
              <div className="chips">
                {(
                  [
                    ['company', 'Firmă'],
                    ['person', 'Om'],
                  ] as [PartyKind, string][]
                ).map(([k, label]) => (
                  <button key={k} type="button" className="chip" aria-pressed={f.newKind === k} onClick={() => set({ newKind: k })}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            {f.newKind === 'company' && (
              <label>
                CUI <small>(dacă îl știi; cu RO dacă plătește TVA)</small>
                <input value={f.newCui} maxLength={14} autoComplete="off" onChange={(e) => set({ newCui: e.target.value })} />
              </label>
            )}
          </>
        )}
        <label>
          De pe
          <input type="date" value={f.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
        </label>
        <label>
          Până pe <small>(cum scrie în contract)</small>
          <input type="date" min={f.startsOn} value={f.endsOn} onChange={(e) => set({ endsOn: e.target.value })} />
        </label>
        {kind === 'sale' && (
          <>
            <fieldset className="ev-wide">
              <legend>Ce vinzi</legend>
              <div className="chips">
                {cropIds.map((id) => (
                  <button key={id} type="button" className="chip" aria-pressed={f.cropId === id} onClick={() => set({ cropId: id })}>
                    {cropName(id)}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Câte tone
              <input inputMode="decimal" autoComplete="off" value={f.tonnes} onChange={(e) => set({ tonnes: e.target.value })} />
            </label>
          </>
        )}
        {kind === 'other' && (
          <fieldset>
            <legend>Banii</legend>
            <div className="chips">
              {(
                [
                  ['out', 'Plătesc'],
                  ['in', 'Primesc'],
                ] as ['in' | 'out', string][]
              ).map(([d, label]) => (
                <button key={d} type="button" className="chip" aria-pressed={f.direction === d} onClick={() => set({ direction: d })}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {(kind === 'service' || kind === 'other') && (
          <fieldset>
            <legend>Se reînnoiește singur?</legend>
            <div className="chips">
              {(
                [
                  [true, 'Da'],
                  [false, 'Nu'],
                ] as [boolean, string][]
              ).map(([v, label]) => (
                <button key={label} type="button" className="chip" aria-pressed={f.autoRenews === v} onClick={() => set({ autoRenews: f.autoRenews === v ? null : v })}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <fieldset className="ar-contracts">
        <legend>{f.direction === 'in' ? 'Cât și când primești' : 'Cât și când plătești'} <small>(fără TVA)</small></legend>
        {f.pays.map((p, i) => (
          <div key={i} className="ev-fields ct-pay">
            <label>
              Ce plată <small>(dacă vrei)</small>
              <input value={p.label} maxLength={40} placeholder={LABEL_HINT[kind]} onChange={(e) => setPay(i, { label: e.target.value })} />
            </label>
            <label>
              {p.repeat === 'none' ? 'Pe' : 'Prima dată pe'}
              <input type="date" value={p.firstOn} onChange={(e) => setPay(i, { firstOn: e.target.value })} />
            </label>
            <label>
              Lei
              <input inputMode="numeric" autoComplete="off" value={p.lei} onChange={(e) => setPay(i, { lei: e.target.value })} />
            </label>
            {inKind && (
              <label>
                Sau kg <small>(în produse)</small>
                <input inputMode="numeric" autoComplete="off" value={p.kg} onChange={(e) => setPay(i, { kg: e.target.value })} />
              </label>
            )}
            <label>
              Cât de des
              <select value={p.repeat} onChange={(e) => setPay(i, { repeat: e.target.value as PaymentRepeat })}>
                {PAYMENT_REPEATS.map((r) => (
                  <option key={r} value={r}>
                    {REPEAT_WORDS[r]}
                  </option>
                ))}
              </select>
            </label>
            {p.repeat !== 'none' && (
              <label>
                De câte ori <small>(gol: până la sfârșit)</small>
                <input inputMode="numeric" autoComplete="off" value={p.times} onChange={(e) => setPay(i, { times: e.target.value })} />
              </label>
            )}
            {f.pays.length > 1 && (
              <button type="button" className="btn ct-pay-x" onClick={() => set({ pays: f.pays.filter((_, j) => j !== i) })}>
                Scoate plata
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn" onClick={() => set({ pays: [...f.pays, { label: '', firstOn: f.pays[f.pays.length - 1]?.firstOn ?? f.startsOn, repeat: 'none', times: '', lei: '', kg: '' }] })}>
          Încă o plată
        </button>
      </fieldset>

      <details className="more">
        <summary>Mai multe detalii</summary>
        <div className="ev-fields">
          <label>
            Un nume pentru el <small>(dacă vrei)</small>
            <input value={f.title} maxLength={80} placeholder={kind === 'leasing' ? 'Tractorul' : kind === 'sale' ? 'Grâu din recolta 2027' : ''} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label>
            Numărul contractului
            <input value={f.number} maxLength={40} onChange={(e) => set({ number: e.target.value })} />
          </label>
          <label>
            Semnat pe
            <input type="date" value={f.signedOn} onChange={(e) => set({ signedOn: e.target.value })} />
          </label>
          {kind !== 'sale' && kind !== 'supply' && (
            <label>
              Preavizul, în zile <small>(cât înainte de sfârșit anunți)</small>
              <input inputMode="numeric" autoComplete="off" value={f.notice} onChange={(e) => set({ notice: e.target.value })} />
            </label>
          )}
          {kind !== 'insurance' && (
            <label>
              TVA, în procente <small>{vatDefault !== null ? `(de obicei ${vatDefault / 100})` : '(dacă e pe factură)'}</small>
              <input inputMode="decimal" autoComplete="off" value={f.vat} onChange={(e) => set({ vat: e.target.value })} />
            </label>
          )}
          {kind === 'leasing' && (
            <label>
              Valoarea reziduală, lei <small>(cât plătești ca să-l cumperi)</small>
              <input inputMode="numeric" autoComplete="off" value={f.residual} onChange={(e) => set({ residual: e.target.value })} />
            </label>
          )}
          <label>
            Hectare <small>(dacă e pe teren)</small>
            <input inputMode="decimal" autoComplete="off" value={f.area} onChange={(e) => set({ area: e.target.value })} />
          </label>
        </div>
      </details>
      {kind === 'sale' && f.tonnes.trim() !== '' && <p className="note">Tonele din contract nu mai sunt în vânzarea la piață din plan: le vinzi la prețul din contract.</p>}

      <ErrorLine>{err}</ErrorLine>
      <div className="ob-actions">
        <NetButton reason="Se salvează când ai internet." type="submit" className="btn btn-dark" disabled={busy} aria-busy={busy}>
          {busy ? 'Se salvează…' : c ? 'Salvează' : 'Adaugă contractul'}
        </NetButton>
      </div>
    </form>
  );
}

