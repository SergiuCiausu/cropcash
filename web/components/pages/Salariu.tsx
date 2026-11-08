'use client';
/* "Salariul tău": the farm's own year, from the money on hand to the salary it allows (was
   web/legacy/salariu.js). Every line comes from salaryBreakdown and salaryMonths, so the page holds no
   figures. Ion's farm shows the demo pension from plan-params.json (P24). Shared by /salariu and
   /ferma-lui-ion/salariu (screens/salariu.tsx). Offline it computes from what's saved on the phone. */
import { useState } from 'react';
import { salaryBreakdown, salaryMonths, type MoneyLine } from '../../../packages/shared/src/functions/explain';
import { num } from '../../lib/cc/format';
import { useFarm, useMoney, useView } from '../../lib/cc/react';
import { YEARS, yearName, type Year } from '../../lib/ui/chart';
import { OfflineNote, useHref } from '../app/bits';
import { PageLink } from '../app/Frame';

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const monthWord = (key: string) => MONTHS[+key.split('-')[1] - 1];
const monthName = (key: string) => `${monthWord(key)} ${key.slice(0, 4)}`;
const monthRange = (from: string, to: string) => (from === to ? monthName(from) : from.slice(0, 4) === to.slice(0, 4) ? `${monthWord(from)}–${monthName(to)}` : `${monthName(from)}–${monthName(to)}`);
const luni = (n: number) => (n === 1 ? 'o lună' : `${n} luni`);
const both = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} și ${words[words.length - 1]}` : words[0] ?? '');
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const kilo = (pricePerT: number) => (pricePerT / 100000).toFixed(2).replace('.', ',');
const SOURCE = { own: 'cifrele tale', gathered: 'din Recolte', average: 'media noastră' };

type Line = MoneyLine & { what?: string; firstMonth: string; lastMonth: string };
type Breakdown = ReturnType<typeof salaryBreakdown>;

/** The sum of the amounts as printed, so a farmer adding them up gets the same figure. */
function printedTotal(b: Breakdown) {
  const whole = (bani: number) => Math.round(bani / 100) * 100;
  const out = [...b.costs.map((l) => l.amount), b.pension];
  return whole(b.opening) + b.income.reduce((s, l) => s + whole(l.amount), 0) - out.reduce((s, v) => s + whole(v), 0);
}

export default function Salariu() {
  const view = useView('farm')!;
  const farm = useFarm()!;
  const href = useHref();
  const { lei } = useMoney();
  const signed = (bani: number) => (bani < 0 ? `−${lei(bani)}` : lei(bani));
  const [year, setYear] = useState<Year>('medium');
  const [wholeYear, setWholeYear] = useState(false);
  const data = view.data();
  const plan = view.farmPlan();
  const onServer = !!farm.me;

  const cropWord = (id?: string | null) => (view.cropName(id ?? '') || '').toLowerCase();
  const incomeLabel = (l: Line) => (l.kind === 'apia_advance' ? 'Avans APIA' : l.kind === 'apia_balance' ? 'Restul de la APIA' : l.kind === 'credit' ? 'Credit' : `Vânzare ${cropWord(l.cropId)}`);
  const costLabel = (l: Line) => (l.kind === 'loan_repayment' ? 'Creditul dat înapoi' : l.what ? `${capital(l.what)}, ${cropWord(l.cropId)}` : `Lucrări la ${cropWord(l.cropId)}`);
  /* "din grâu", "de la APIA": where the next money comes from. */
  const fromWhere = (lines: Line[]) => {
    const crops = [...new Set(lines.filter((l) => l.cropId).map((l) => cropWord(l.cropId)))];
    const parts = crops.length ? [`din ${both(crops)}`] : [];
    if (lines.some((l) => !l.cropId)) parts.push('de la APIA');
    return parts.join(' și ');
  };
  const paidIn = (k: Year) => (k === 'medium' ? plan.monthlySalary : salaryBreakdown(plan, k, data).salary);

  const b = salaryBreakdown(plan, year, data);
  const ledger = salaryMonths(plan, year, data);
  const pension = plan.smoothing.pensionMonthly ?? 0;
  const printed = printedTotal(b);
  const month = monthName(b.limitingMonth);
  const left = ledger.months.find((m) => m.key === b.limitingMonth)!.left;
  const next = b.nextIncome ? `În ${monthName(b.nextIncome.month)} intră ${lei(b.nextIncome.amount)} ${fromWhere(b.nextIncome.lines as Line[])}.` : '';

  let why: string;
  if (b.deficit) {
    const without = b.withoutSetAsides < 0 ? `Chiar dacă nu pui nimic deoparte, tot lipsesc ${lei(b.withoutSetAsides)}.` : `Dacă nu pui nimic deoparte, îți rămân ${lei(b.withoutSetAsides)}.`;
    why = `În ${month} lipsesc ${lei(printed)}, chiar fără salariu. ${without} ${next}`.trim();
  } else if (b.nextIncome) why = `În ${month} îți rămân ${lei(left)}, după toate plățile. ${next}`;
  else why = `Suma ține tot anul. În ${month} îți rămân ${lei(left)}.`;

  const rounded = b.salary !== Math.round(b.exact / 100) * 100;
  let end = `${lei(printed)} ÷ ${luni(b.months)} = ${lei(b.exact)} pe lună.${rounded ? ` Rotunjim în jos la ${lei(b.salary)}.` : ''}`;
  if (b.deficit) end = `Până în ${monthName(b.limitingMonth)} ies mai mulți bani decât intră, așa că nu poți scoate salariu.`;
  else if (b.salary === 0) end = `Sunt prea puțini bani ca să împărțim la ${luni(b.months)}.`;
  if (year === 'medium' && plan.salaryFixed !== null) end += ` Ai ales să scoți ${lei(ledger.salary)} pe lună.`;

  /* Month by month: months with nothing in them fold into one row. */
  const regular = both([ledger.salary ? `${lei(ledger.salary)} salariu` : '', pension ? `${lei(pension)} pentru pensie` : ''].filter(Boolean));
  const stop = b.nextIncome?.month ?? b.limitingMonth;
  const endAt = ledger.months.findIndex((m) => m.key === stop);
  const shown = wholeYear ? ledger.months : ledger.months.slice(0, endAt + 1);
  const quietWord = ledger.salary && pension ? 'Doar salariul și pensia' : ledger.salary ? 'Doar salariul' : pension ? 'Doar pensia' : 'Nimic de plătit';
  const rows: { from: string; to: string; left: number; lines: [string, string][]; quiet: boolean }[] = [];
  for (const m of shown) {
    const lines: [string, string][] = [...m.income.map((l) => [incomeLabel(l as Line), `+${lei(l.amount)}`] as [string, string]), ...m.costs.map((l) => [costLabel(l as Line), `−${lei(l.amount)}`] as [string, string])];
    const quiet = !lines.length && m.key !== b.limitingMonth;
    const last = rows[rows.length - 1];
    if (quiet && last?.quiet) {
      last.to = m.key;
      last.left = m.left;
      continue;
    }
    rows.push({ from: m.key, to: m.key, left: m.left, lines, quiet });
  }
  const stated = b.nextIncome && plan.salaryFixed === null;

  /* What the plan rests on. */
  const crops = plan.economics.map((c) => `${cropWord(c.cropId)} ${num(c.productionT)} t la ${kilo(c.pricePerT)} lei/kg (${SOURCE[view.figureSource(c.cropId)]})`);
  const ownPension = view.pensionBani();
  const assumed = [
    `Am pornit de la ${lei(onServer ? plan.startBalance : view.farm.startBalanceBani)} în cont.`,
    crops.length ? `Într-un an normal: ${both(crops)}.` : '',
    'Banii de la APIA sunt puși în ultima zi în care pot veni, ca planul să țină și dacă întârzie.',
    ownPension ? `Pensie: ${lei(ownPension)} pe lună${onServer || farm.ownPension !== null ? '' : ', ca exemplu'}.` : 'Nu pui bani deoparte pentru pensie.',
  ].filter(Boolean);

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Salariul tău</h1>
          <p className="lead">Cât poți scoate lună de lună din {view.farm.summary}.</p>
        </div>
      </header>
      <OfflineNote>Nu ai internet. Salariul se calculează pe telefon, din datele salvate.</OfflineNote>
      <div className="bento">
        <section className="chart-card field hero-card pay-hero s12">
          <div>
            <p className="eyebrow">
              {yearName(year)}: {b.deficit ? 'banii nu ajung' : 'poți scoate sigur'}
            </p>
            <p className="amount">{lei(ledger.salary)} pe lună</p>
            <p className="why" aria-live="polite">
              {why}
            </p>
          </div>
          <div className="year-pick" role="group" aria-label="Ce fel de an">
            {YEARS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={k === year} onClick={() => setYear(k)}>
                <span>{label}</span>
                <b>{lei(paidIn(k))}</b>
              </button>
            ))}
          </div>
        </section>
        <section className="card s5">
          <div className="pay-sum">
            <h2>{b.deficit ? 'De ce nu ajung banii' : `Cum am ajuns la ${lei(b.salary)}`}</h2>
            <ul className="sums">
              <SumRow label="Ai în cont" amount={lei(b.opening)} />
              {(b.income as Line[]).map((l, i) => (
                <SumRow key={`i${i}`} label={incomeLabel(l)} sub={monthRange(l.firstMonth, l.lastMonth)} amount={`+${lei(l.amount)}`} />
              ))}
              {(b.costs as Line[]).map((l, i) => (
                <SumRow key={`c${i}`} label={costLabel(l)} sub={monthRange(l.firstMonth, l.lastMonth)} amount={`−${lei(l.amount)}`} />
              ))}
              {b.pension ? (
                <SumRow
                  label={
                    <PageLink path="/pensie" href={href('/pensie')}>
                      Pensie
                    </PageLink>
                  }
                  sub={`${lei(pension)} × ${luni(b.months)}`}
                  amount={`−${lei(b.pension)}`}
                />
              ) : null}
              <SumRow label={b.deficit ? 'Îți lipsesc' : 'Rămân pentru salariu'} amount={lei(printed)} className="total" />
            </ul>
            <p className="sum-end">{end}</p>
          </div>
        </section>
        <section className="card s7">
          <h2>Lună cu lună</h2>
          {regular && <p className="note">În fiecare lună ies {regular}.</p>}
          <p className="m-head">
            <span>Luna</span>
            <span>Îți rămân</span>
          </p>
          <ol className="months">
            {rows.map((r) => {
              const tight = r.from === b.limitingMonth;
              return (
                <li key={r.from} className={`m-row${tight ? ' tight' : ''}`}>
                  <div className="m-top-line">
                    <b>{r.from === r.to ? monthName(r.from) : `${monthWord(r.from)}–${monthWord(r.to)}`}</b>
                    {tight && <span className="tag d">{b.deficit ? 'Aici nu ajung banii' : 'Cea mai grea lună'}</span>}
                    <span className={`m-left${r.left < 0 ? ' short' : ''}`}>{signed(r.left)}</span>
                  </div>
                  {r.quiet && <p className="note">{quietWord}</p>}
                  {r.lines.length > 0 && (
                    <ul className="m-lines">
                      {r.lines.map(([label, amount], i) => (
                        <li key={i}>
                          <span>{label}</span>
                          <b>{amount}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
          {stated && <p className="note gap">Când intră banii {fromWhere(b.nextIncome!.lines as Line[])}, recalculăm salariul.</p>}{' '}
          {endAt < ledger.months.length - 1 && (
            <button type="button" className="btn btn-line m-more" onClick={() => setWholeYear((w) => !w)}>
              {wholeYear ? 'Arată mai puțin' : 'Arată tot anul'}
            </button>
          )}
        </section>
        <section className="card s12">
          <div className="card-h">
            <h2>Ce am presupus</h2>
            <span>
              <PageLink path="/date-plan" href={href('/date-plan')}>
                Schimbă
              </PageLink>
            </span>
          </div>
          <ul className="assumed">
            {assumed.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function SumRow({ label, sub, amount, className }: { label: React.ReactNode; sub?: string; amount: string; className?: string }) {
  return (
    <li className={className}>
      <span>
        {label}
        {sub && <small>{sub}</small>}
      </span>
      <b>{amount}</b>
    </li>
  );
}
