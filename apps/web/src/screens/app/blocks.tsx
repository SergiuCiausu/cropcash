/* Building blocks shared by the phone (c-deck) and laptop (2-rail) layouts. */
import { useState } from 'react';
import {
  addMonths,
  CreditInputSchema,
  ENVELOPE_KINDS,
  loadData,
  type CropEconomics,
  type Envelopes,
  type Timeline,
  type TimelineEntry,
} from '@cropcash/shared';
import { t } from '../../i18n';
import { api, ApiError } from '../../api/client';
import { Icon, cropColor, type IconName } from '../../components/Icon';
import { Donut } from '../../components/Donut';
import { Sheet, VerifyBadge } from '../../components/ui';
import {
  currentMonthKey,
  formatDayMonth,
  formatHa,
  formatLei,
  formatMonth,
  formatMonthCap,
  formatMonthYear,
  formatMonthYearLower,
} from '../../lib/format';
import { countyName, cropName, type FarmPlan } from '../../lib/plan';
import { entryTitle } from '../../lib/entryText';

const data = loadData();
const leiKg = (bani: number) => (bani / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2 });

/* ── Coming up ─────────────────────────────────────────────────────────── */

function entryLook(e: TimelineEntry): { icon: IconName; tone: '' | 'b' | 'c' } {
  // Violet (b) marks estimates, gold (c) marks what needs attention (prototype's "both" palette).
  switch (e.kind) {
    case 'apia_advance':
    case 'apia_balance':
      return { icon: 'down', tone: 'b' };
    case 'crop_sale':
      return { icon: 'sprout', tone: '' };
    case 'credit':
      return { icon: 'bank', tone: 'b' };
    case 'loan_repayment':
      return { icon: 'bank', tone: 'c' };
    case 'input_cost':
      return { icon: 'sack', tone: 'c' };
    default:
      return { icon: 'cal', tone: 'c' };
  }
}

export function ComingList({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol>
      {entries.map((e) => {
        const look = entryLook(e);
        const sub =
          e.kind === 'deadline'
            ? t('calendar.until', { date: formatDayMonth(e.date) })
            : e.estimated
              ? t('calendar.estimated')
              : (e.what ?? cropName(e.cropId) ?? '');
        return (
          <li className="tx" key={e.id}>
            <span className={`ti ${look.tone}`}>
              <Icon name={look.icon} />
            </span>
            <div className="tm">
              <b>
                {entryTitle(e)}
                {e.unverified && <VerifyBadge />}
              </b>
              <small>{sub}</small>
            </div>
            <div className="ta">
              {e.direction !== 'none' && (
                <b className={e.direction === 'in' ? 'pos' : ''}>
                  {e.direction === 'in' ? '+' : '−'}
                  {formatLei(e.value)} {t('common.lei')}
                </b>
              )}
              <small>
                {e.window && <span className="st">{t('common.estimated')}, </span>}
                {formatDayMonth(e.date)}
              </small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Costs ─────────────────────────────────────────────────────────────── */

export function CostRows({ plan, className = '' }: { plan: FarmPlan; className?: string }) {
  const total = plan.costs.reduce((s, c) => s + c.amount, 0) || 1;
  const max = plan.costs[0]?.amount ?? 1;
  return (
    <ol className={className}>
      {plan.costs.map((c) => (
        <li className="cost" key={c.cropId}>
          <span className="ti">
            <Icon name="sack" />
          </span>
          <div>
            <div className="cl">
              <b>{cropName(c.cropId)}</b>
              <span className="pct">{Math.round((c.amount / total) * 100)}%</span>
              <span className="amt">
                {formatLei(c.amount)} {t('common.lei')}
              </span>
            </div>
            <div className="bar">
              <i style={{ transform: `scaleX(${(c.amount / max).toFixed(3)})`, background: cropColor(c.cropId) }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CostDonut({ plan }: { plan: FarmPlan }) {
  const total = plan.costs.reduce((s, c) => s + c.amount, 0);
  return (
    <Donut
      center={formatLei(total)}
      centerLabel={t('home.leiTotal')}
      slices={plan.costs.map((c) => ({
        key: c.cropId,
        label: cropName(c.cropId),
        value: c.amount,
        color: cropColor(c.cropId),
      }))}
    />
  );
}

/* ── Month by month ────────────────────────────────────────────────────── */

export function MonthTable({ timeline }: { timeline: Timeline }) {
  return (
    <div>
      <div className="mrow head">
        <span>{t('forecast.colMonth')}</span>
        <span>{t('forecast.colIn')}</span>
        <span>{t('forecast.colOut')}</span>
        <span>{t('forecast.colLeft')}</span>
      </div>
      {timeline.months.map((m) => {
        const low = m.key === timeline.lowest.key;
        return (
          <div className={`mrow${low ? ' low' : ''}`} key={m.key}>
            <span>
              {formatMonthYear(m.key)}
              {low && t('forecast.tightTag')}
            </span>
            <span data-l={t('forecast.colIn')}>{formatLei(m.in)}</span>
            <span data-l={t('forecast.colOut')}>{formatLei(m.out)}</span>
            <span className={`v${m.balanceEnd < 0 ? ' neg' : ''}`}>
              {formatLei(m.balanceEnd)} {t('common.lei')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Crops ─────────────────────────────────────────────────────────────── */

export function CropCardBody({ e }: { e: CropEconomics }) {
  return (
    <>
      <h2>
        {cropName(e.cropId)}
        <span className="st-pill">{formatHa(e.areaAri / 100)} ha</span>
      </h2>
      <p className="n20 margin">
        {formatLei(e.marginPerHa)} {t('common.lei')}
      </p>
      <p className="lab">{t('fields.marginPerHa')}</p>
      <div className="crop-l">
        <span>{t('fields.harvest')}</span>
        <span>{t('fields.tonnes', { t: formatHa(e.productionT) })}</span>
      </div>
      <div className="crop-l">
        <span>{t('fields.price')}</span>
        <span>{t('fields.perT', { amount: formatLei(e.pricePerT) })}</span>
      </div>
      <div className="crop-l">
        <span>{t('fields.income')}</span>
        <span>
          {formatLei(e.income)} {t('common.lei')}
        </span>
      </div>
      <div className="crop-l">
        <span>{t('fields.cost')}</span>
        <span>
          {formatLei(e.cost)} {t('common.lei')}
        </span>
      </div>
      <div className="crop-l">
        <span>{t('fields.breakEven')}</span>
        <span>{t('fields.perKg', { amount: leiKg(e.breakEvenPerKg) })}</span>
      </div>
    </>
  );
}

export function MarginBars({ plan }: { plan: FarmPlan }) {
  const max = Math.max(...plan.economics.map((e) => Math.max(0, e.marginPerHa)), 1);
  return (
    <ul>
      {plan.economics.map((e) => (
        <li key={e.cropId} style={{ padding: '6px 0' }}>
          <div className="crop-l">
            <span>
              {cropName(e.cropId)}, {formatHa(e.areaAri / 100)} ha
            </span>
            <span>
              {formatLei(e.marginPerHa)} {t('common.lei')} / ha
            </span>
          </div>
          <div className="bar">
            <i
              style={{
                transform: `scaleX(${(Math.max(0, e.marginPerHa) / max).toFixed(3)})`,
                background: cropColor(e.cropId),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Salary and credit (step 5, decisions A + C) ───────────────────────── */

const monthOptions = (from: string, count: number) => Array.from({ length: count }, (_, i) => addMonths(from, i));

export function CreditSheet({
  onClose,
  onSaved,
  suggestion,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  suggestion: FarmPlan['creditSuggestion'];
}) {
  const now = currentMonthKey();
  const defaultTake = suggestion?.credit.takeMonth ?? addMonths(now, 1);
  const [amount, setAmount] = useState(suggestion ? String(suggestion.credit.amount / 100) : '');
  const [take, setTake] = useState(defaultTake);
  const [repay, setRepay] = useState(addMonths(defaultTake, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const body = { amountLei: Number(amount.replace(/[.\s]/g, '')), takeMonth: take, repayMonth: repay };
    if (!CreditInputSchema.safeParse(body).success) return setError(t('credit.invalid'));
    if (!navigator.onLine) return setError(t('offline.needed.save_plan'));
    setBusy(true);
    setError(null);
    try {
      await api('/api/credits', { method: 'POST', body: JSON.stringify(body) });
      await onSaved();
      onClose();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={t('credit.title')}>
      <label className="field-l">
        {t('credit.amount')}
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.\s]/g, ''))} />
      </label>
      <label className="field-l">
        {t('credit.take')}
        <select value={take} onChange={(e) => setTake(e.target.value)}>
          {monthOptions(now, 12).map((m) => (
            <option key={m} value={m}>
              {formatMonthYear(m)}
            </option>
          ))}
        </select>
      </label>
      <label className="field-l">
        {t('credit.repay')}
        <select value={repay} onChange={(e) => setRepay(e.target.value)}>
          {monthOptions(addMonths(take, 1), 18).map((m) => (
            <option key={m} value={m}>
              {formatMonthYear(m)}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">{t('credit.note')}</p>
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-dark btn-block" style={{ marginTop: 14 }} disabled={busy} onClick={() => void save()}>
        {busy ? t('common.wait') : t('credit.save')}
      </button>
    </Sheet>
  );
}

/** Salary call-to-action on the bright field (prototype's CTA slot). */
export function SalaryCta({
  plan,
  onCredit,
  onChanged,
  className = '',
}: {
  plan: FarmPlan;
  onCredit: () => void;
  onChanged: () => Promise<void>;
  className?: string;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const { salary, creditSuggestion: s } = plan;
  const remove = async (groupId: string) => {
    if (!navigator.onLine) return;
    setRemoving(groupId);
    try {
      await api(`/api/credits/${groupId}`, { method: 'DELETE' });
      await onChanged();
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section className={`cta field ${className}`}>
      <div>
        <p className="eyebrow">{t('salary.eyebrow')}</p>
        <h2>{t('salary.headline', { amount: formatLei(plan.monthlySalary) })}</h2>
        <p>
          {salary.deficit
            ? t('salary.deficit', { month: formatMonth(salary.bindingMonth) })
            : t('salary.why', { month: formatMonth(salary.bindingMonth) })}
        </p>
        {plan.salaryFixed !== null && <p style={{ marginTop: 4 }}>{t('salary.fixedNote')}</p>}
      </div>
      {s && (
        <div className="suggest">
          <b>{t('salary.suggestTitle')}. </b>
          {t('salary.suggest', {
            credit: formatLei(s.credit.amount),
            month: formatMonth(s.credit.takeMonth ?? ''),
            salary: formatLei(s.salary),
          })}
          <small>{t('salary.suggestNote')}</small>
        </div>
      )}
      {plan.credits.length > 0 && (
        <ul className="rows">
          {plan.credits.map((c) => (
            <li key={c.groupId}>
              <small style={{ color: 'var(--on-hero)' }}>
                {t('salary.declared', {
                  amount: formatLei(c.amount),
                  take: formatMonthYearLower(c.takeDate.slice(0, 7)),
                  repay: c.repayDate ? formatMonthYearLower(c.repayDate.slice(0, 7)) : '—',
                })}
              </small>
              <button
                type="button"
                className="linkbtn"
                style={{ color: 'var(--on-hero)' }}
                disabled={removing === c.groupId}
                aria-label={t('salary.removeLabel', { amount: formatLei(c.amount) })}
                onClick={() => void remove(c.groupId)}
              >
                {t('salary.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className="btn btn-dark" onClick={onCredit}>
          {t('salary.takeCredit')} <Icon name="arrow" />
        </button>
      </div>
    </section>
  );
}

/* ── Reserves ──────────────────────────────────────────────────────────── */

/** Screen Î2: the bad-years fund. Works offline (computed on the device). */
export function RiskFundBody({ plan }: { plan: FarmPlan }) {
  const { saved, missing, done } = plan.riskFund;
  const pct = plan.riskFund.pct / 100;
  const bad = plan.badYears;
  return (
    <div>
      <p className="res-label">{t('reserve.badYearTitle')}</p>
      <p className="res-amt">
        {formatLei(saved)} {t('common.lei')}
      </p>
      <div className="meter" style={{ marginTop: 14 }}>
        <i style={{ transform: `scaleX(${pct.toFixed(4)})` }} />
      </div>
      <div className="res-note">
        <span>{t('reserve.badYearHave')}</span>
        <span>{t('reserve.badYearOf', { amount: formatLei(plan.riskTarget) })}</span>
      </div>
      <p className="res-note" style={{ display: 'block', fontWeight: 600 }}>
        {done ? t('reserve.badYearDone') : t('reserve.badYearMissing', { amount: formatLei(missing) })}
      </p>
      {bad && (
        <p className="res-note" style={{ display: 'block' }}>
          {t('reserve.badYearFreq', {
            county: countyName(bad.county),
            crop: cropName(bad.cropId).toLocaleLowerCase('ro-RO'),
            bad: bad.bad,
            total: bad.total,
          })}
        </p>
      )}
      <p className="res-note" style={{ display: 'block' }}>
        {t('reserve.badYearWhy', { amount: formatLei(plan.riskTarget) })}
      </p>
      {!done && (
        <p className="res-note" style={{ display: 'block' }}>
          {t('reserve.badYearHow', { pct: plan.riskPct })}
        </p>
      )}
    </div>
  );
}

export function SpringCard({ plan, className = '' }: { plan: FarmPlan; className?: string }) {
  const { spring } = plan;
  const shortBy = spring.need - spring.available;
  return (
    <section className={`card ${className}`}>
      {spring.firstMonth && spring.lastMonth ? (
        <>
          <div className="card-h">
            <h2>{t('reserve.springTitle', { from: formatMonth(spring.firstMonth), to: formatMonth(spring.lastMonth) })}</h2>
          </div>
          <p className="n28">
            {formatLei(spring.need)} {t('common.lei')}
          </p>
          <p className="muted">{t('reserve.springHave', { amount: formatLei(spring.available, 100) })}</p>
          <p style={{ marginTop: 8, fontWeight: 600 }}>
            {shortBy > 0 ? t('reserve.springShort', { amount: formatLei(shortBy, 100) }) : t('reserve.springOk')}
          </p>
        </>
      ) : (
        <p>{t('reserve.springNone')}</p>
      )}
    </section>
  );
}

function EnvelopeBars({ env }: { env: Envelopes }) {
  const max = Math.max(...Object.values(env), 1);
  return (
    <ol>
      {ENVELOPE_KINDS.map((k, i) => (
        <li className="cost" key={k} style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
          <div>
            <div className="cl">
              <b>{t(`envelopes.kinds.${k}`)}</b>
              <span className="amt">
                {formatLei(env[k])} {t('common.lei')}
              </span>
            </div>
            <div className="bar">
              <i style={{ transform: `scaleX(${(env[k] / max).toFixed(3)})`, background: `var(--ch${i + 1})` }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EnvelopesCard({
  plan,
  onChanged,
  className = '',
}: {
  plan: FarmPlan;
  onChanged: () => Promise<void>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = Object.values(plan.envelopes).reduce((a, b) => a + b, 0);

  const confirm = async () => {
    if (!navigator.onLine) return setError(t('offline.needed.save_plan'));
    setBusy(true);
    setError(null);
    try {
      await api('/api/envelopes', { method: 'PUT', body: JSON.stringify(plan.proposal) });
      await onChanged();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'too_much' ? t('envelopes.tooMuch') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`card ${className}`}>
      <div className="card-h">
        <h2>{t('envelopes.title')}</h2>
      </div>
      {total > 0 ? <EnvelopeBars env={plan.envelopes} /> : <p className="muted">{t('envelopes.empty')}</p>}
      <p className="note" style={{ marginTop: 8 }}>
        {t('envelopes.riskLater', { pct: plan.riskPct })}
      </p>
      {plan.startBalance > 0 ? (
        <button type="button" className="btn btn-dark btn-block" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
          {t('envelopes.split')}
        </button>
      ) : (
        <p className="note">{t('envelopes.noMoney')}</p>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('envelopes.splitTitle', { amount: formatLei(plan.startBalance) })}>
        <p className="muted">{t('envelopes.splitLead')}</p>
        <EnvelopeBars env={plan.proposal} />
        <p className="note" style={{ marginTop: 8 }}>
          {plan.monthsCovered === 1 ? t('envelopes.splitWhyOne') : t('envelopes.splitWhy', { months: plan.monthsCovered })}
        </p>
        {error && (
          <p role="alert" className="err">
            {error}
          </p>
        )}
        <button type="button" className="btn btn-dark btn-block" style={{ marginTop: 14 }} disabled={busy} onClick={() => void confirm()}>
          {busy ? t('common.wait') : t('envelopes.confirm')}
        </button>
      </Sheet>
    </section>
  );
}

/* ── Subsidy summary card body ─────────────────────────────────────────── */

export function SubsidySummary({ plan, onOpen }: { plan: FarmPlan; onOpen: () => void }) {
  const { totals } = plan.subsidies;
  return (
    <>
      <p className="lbl">{t('deck.subsidyCard')}</p>
      <p className="n20">
        {formatLei(totals.lei.probable, 100)} {t('common.lei')}
      </p>
      <div className="spacer" />
      <div className="kv s">
        <span>{t('deck.advance')}</span>
        <b>
          {formatLei(totals.advanceLei)} {t('common.lei')}
        </b>
      </div>
      <div className="kv s">
        <span>{t('deck.rest')}</span>
        <b>
          {formatLei(totals.balanceLei.probable)} {t('common.lei')}
        </b>
      </div>
      <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={onOpen}>
        {t('fields.subsidyMore')} <Icon name="arrow" />
      </button>
    </>
  );
}

export { formatMonthCap, data as referenceData };
