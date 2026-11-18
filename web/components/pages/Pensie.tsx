'use client';
/* "Pensie": everything on screen is worked out on the phone from the saved farm, so it opens offline
   (was web/legacy/pensie.js). Starting, changing and stopping move money: they need internet, ask
   first and are never queued. Signed out, the slider works on the example farm and the button asks to sign in. */
import { useMemo, useState, type ReactNode } from 'react';
import { activePensionMonthly } from '../../../packages/shared/src/farm/plan-inputs';
import { whatIfPension } from '../../../packages/shared/src/functions/whatIf';
import { pensionParams, pensionPath, simulatePensionScenarios, suggestSliderPension } from '../../../packages/shared/src/pension/index';
import { comparisonPaidPath, PENSION_COMPARISONS, pensionOptions, type PensionComparison } from '../../../packages/shared/src/pension/options';
import { about, date, exact, failText } from '../../lib/cc/format';
import { useFarm, useMoney, useOnline, useStore, useView } from '../../lib/cc/react';
import { newIntentKey } from '../../lib/live/intent';
import { pageKeys } from '../../lib/cc/storage';
import { CHEVRON, ErrorLine, OfflineNote, Sheet, useHref, Verify } from '../app/bits';
import { useSaved } from '../app/useSaved';
import { PageLink } from '../app/Frame';
import PensionChart, { type Growth, type PensionCompare } from '../app/PensionChart';

const GROWTH: Growth[] = ['low', 'probable', 'high'];
const COMPARE_NAME: Partial<Record<PensionComparison, string>> = { contract: 'Casa de Pensii: contract', declaration: 'Casa de Pensii: Declarația Unică' };
const LATEST_PAYMENTS = 6;

type SendTools = Parameters<Parameters<NonNullable<ReturnType<typeof useStore>>['send']>[0]>[0];
interface Ask {
  title: string;
  text: string;
  yes: string;
  done: string;
  danger?: boolean;
  action: (tools: SendTools, key: string) => unknown;
}

/** The page starts over when the pension itself changed, as it did when it reloaded. */
export default function Pensie() {
  const view = useView('farm')!;
  return <PensiePage key={activePensionMonthly(view.storedFarm().pension_plans)} />;
}

function PensiePage() {
  const view = useView('farm')!;
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const href = useHref();
  const { text: t } = useMoney();
  const data = view.data();
  const P = pensionParams(data);
  const me = farm.me;
  const stored = view.storedFarm();
  const plan = useMemo(() => view.farmPlan(stored), [view, stored]);
  const age = view.farm.age;
  const lei = (bani: number) => t(`${exact(bani)} lei`);
  const aboutLei = (bani: number) => t(`${about(bani)} lei`);
  /* Signed out this is the example pension, which the other pages count too. */
  const current = activePensionMonthly(stored.pension_plans);
  const running = !!me && current > 0;
  const hasAccount = !!me?.stripe_account_id;
  const payments = (me?.transactions ?? []).filter((x) => x.kind === 'pension').sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const savedSoFar = -payments.reduce((s, x) => s + x.amount_bani, 0);
  const funds = [...data.pensionFunds.funds].sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  const options = pensionOptions(data, age);

  const [fundId, setFundId] = useState<string | null>(me?.pension_fund_id ?? null);
  const [fundErr, setFundErr] = useState<string | null>(null);
  /* Each answer rebuilds the plan, and the slider asks for several on every move. */
  const effects = useMemo(() => new Map<number, ReturnType<typeof whatIfPension>>(), [plan, fundId]); // eslint-disable-line react-hooks/exhaustive-deps
  const effect = (bani: number) => {
    if (!effects.has(bani)) effects.set(bani, whatIfPension(plan, stored as unknown as Parameters<typeof whatIfPension>[1], data, bani, fundId));
    return effects.get(bani)!;
  };
  const toStep = (v: number) => Math.min(P.sliderMaxLei, Math.max(P.sliderMinLei, Math.round(v / P.sliderStepLei) * P.sliderStepLei));
  /* The usual share of the salary, but never under what the chosen fund asks for. */
  const suggestion = () => {
    const share = suggestSliderPension(plan.monthlySalary, P);
    return Math.max(share, effect(share).minimum);
  };
  const [monthlyLei, setMonthlyLei] = useState(() => toStep((current || suggestion()) / 100));
  /* Which growth the chart draws as the solid line. The amount at the top always uses the usual one. */
  const [growth, setGrowth] = useState<Growth>('probable');
  const growthName = Object.fromEntries(GROWTH.map((k) => [k, `${P.returnsPct[k]}% pe an`])) as Record<Growth, string>;
  const monthly = monthlyLei * 100;
  /* "Compară cu": another way to save, drawn as what it costs. Remembered in this browser only. */
  const compareKey = pageKeys(store.mode).pensionCompare;
  const [against, setAgainst] = useState<PensionComparison>(() => {
    try {
      const v = localStorage.getItem(compareKey) as PensionComparison | null;
      return v && PENSION_COMPARISONS.includes(v) ? v : 'pilon3';
    } catch {
      return 'pilon3';
    }
  });
  const [ask, setAsk] = useState<Ask | null>(null);

  const sim = simulatePensionScenarios(age, monthly, P);
  const comparePath = comparisonPaidPath(against, age, P.targetAge, options);
  const compare: PensionCompare | null = comparePath ? { name: COMPARE_NAME[against] ?? '', short: 'Ai de plătit', path: comparePath } : null;
  const st = options.state;
  const w = effect(monthly);

  const pickCompare = (v: string) => {
    const next = PENSION_COMPARISONS.includes(v as PensionComparison) ? (v as PensionComparison) : 'pilon3';
    setAgainst(next);
    try {
      localStorage.setItem(compareKey, next);
    } catch {
      /* stays for this visit */
    }
  };
  const years = (
    <>
      Pensia minimă de stat e {lei(st.minimumPension)} pe lună și cere cel puțin {st.minimumYears} ani de plăți.{options.enoughYearsForMinimum ? '' : ` Până la ${P.targetAge} de ani mai ai ${options.yearsLeft}.`}
    </>
  );
  const points = 'Nu desenăm cât cresc acești bani: Casa de Pensii nu strânge o sumă pe numele tău, îți dă puncte de pensie.';
  const compareNote: ReactNode =
    against === 'contract' ? (
      <>
        Linia aurie arată cât ai de plătit cu un contract la Casa de Pensii: cel puțin {lei(st.contractMonthly)} pe lună, din {date(st.contractFrom, true)}. {points} {years}
      </>
    ) : against === 'declaration' ? (
      <>
        Linia aurie arată cât ai de plătit prin Declarația Unică: {lei(st.declarationYearly)} pe an.
        {!st.declarationVerified && (
          <>
            {' '}
            <Verify />
          </>
        )}{' '}
        {points} {years}
      </>
    ) : against === 'cei' ? (
      <>
        Contul de economii pornește din {date(options.cei.availableFrom, true)}.{' '}
        {options.cei.ceilingYearly ? (
          `Poți pune până la ${lei(options.cei.ceilingYearly)} pe an.`
        ) : (
          <>
            Nu știm încă cât poți pune pe an, așa că nu desenăm nimic. <Verify />
          </>
        )}
      </>
    ) : null;

  const salaryLine = (bani: number) => {
    const x = effect(bani);
    return x.salaryAfter === x.paidBefore ? `Salariul tău rămâne ${lei(x.paidBefore)} pe lună.` : `Salariul tău trece de la ${lei(x.paidBefore)} la ${lei(x.salaryAfter)} pe lună.`;
  };
  const suggested = plan.monthlySalary > 0 ? suggestion() : 0;
  const hint: ReactNode = w.underMinimum ? (
    <>
      Fondul ales cere cel puțin {lei(w.minimum)} pe lună.
      {!w.minimumVerified && (
        <>
          {' '}
          <Verify />
        </>
      )}
    </>
  ) : plan.monthlySalary <= 0 ? (
    'Fără salariu nu îți sugerăm o sumă.'
  ) : suggested === monthly ? (
    `Atât îți sugerăm: ${P.suggestMaxPctOfSalary}% din salariu, rotunjit.`
  ) : (
    `Îți sugerăm ${lei(suggested)} pe lună, adică ${P.suggestMaxPctOfSalary}% din salariu, rotunjit.`
  );

  const start = () => setAsk({ title: 'Pornești pensia?', text: `Pui ${lei(monthly)} pe lună, începând de azi. ${salaryLine(monthly)} În demo, plata se face cu un card de test.`, yes: `Da, pornesc cu ${lei(monthly)}`, done: 'Pensia a pornit', action: ({ write }, key) => write('start_pension', { monthlyLei }, { key }) });
  const change = () => setAsk({ title: 'Schimbi suma?', text: `De la următoarea plată pui ${lei(monthly)} pe lună în loc de ${lei(current)}. ${salaryLine(monthly)}`, yes: `Da, schimb la ${lei(monthly)}`, done: 'Am schimbat suma', action: ({ write }) => write('change_pension', { monthlyLei }) });
  const stop = () => {
    const kept = savedSoFar > 0 ? ` Cei ${lei(savedSoFar)} puși până acum rămân deoparte.` : '';
    setAsk({ title: 'Oprești pensia?', text: `De acum nu se mai ia nimic.${kept} ${salaryLine(0)}`, yes: 'Da, opresc pensia', done: 'Am oprit pensia', danger: true, action: ({ write }) => write('stop_pension', {}) });
  };

  function actions(): ReactNode {
    /* Only Ion's farm is signed out now. */
    if (!farm.signedIn)
      return (
        <>
          <a className="btn btn-dark gap" href="/login?mode=register">
            Fă-ți cont ca să pornești
          </a>
          <p className="note gap">Acum vezi exemplul lui Ion.</p>
        </>
      );
    if (!me)
      return (
        <a className="btn btn-dark gap" href="/onboarding">
          Spune-ne întâi despre fermă
        </a>
      );
    if (!hasAccount)
      return (
        <>
          <p className="note gap">Ca să pornești pensia, activează întâi contul CropCash.</p>
          <PageLink className="btn btn-line gap" path="/bani" href={href('/bani')}>
            Mergi la Contul tău
          </PageLink>
        </>
      );
    const offNote = online ? null : <p className="note gap">Ca să pornești, să schimbi sau să oprești pensia ai nevoie de internet.</p>;
    if (!running)
      return (
        <>
          <button type="button" className="btn btn-dark gap" disabled={!online || w.underMinimum} onClick={start}>
            Pornesc
          </button>
          {offNote}
        </>
      );
    return (
      <>
        <div className="ob-actions gap">
          {monthly !== current && (
            <button type="button" className="btn btn-dark" disabled={!online || w.underMinimum} onClick={change}>
              Schimbă suma la {lei(monthly)}
            </button>
          )}
          <button type="button" className="btn btn-line" disabled={!online} onClick={stop}>
            Opresc pensia
          </button>
        </div>
        {offNote}
      </>
    );
  }

  async function pickFund(value: string) {
    const before = fundId;
    const next = value || null;
    setFundId(next);
    setFundErr(null);
    if (!me) return;
    try {
      await store.send(({ write }) => write('set_pension_fund', { fundId: next }));
    } catch (e) {
      setFundId(before);
      setFundErr(failText(e, online));
    }
  }
  const chosen = funds.find((f) => f.id === fundId);
  const row = (name: string, sub: string | undefined, amount: ReactNode) => (
    <li key={`${name}${sub}`}>
      <span>
        {name}
        {sub && <small>{sub}</small>}
      </span>
      <b>{amount}</b>
    </li>
  );
  const late = !options.enoughYearsForMinimum && options.yearsLeft > 0 ? ` Dacă n-ai plătit până acum, până la ${P.targetAge} de ani mai ai ${options.yearsLeft} ani, mai puțin decât ${st.minimumYears}.` : '';

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Pensie</h1>
          <p className="lead">Bani puși deoparte în fiecare lună, pentru după 65 de ani. Totul e simulat: nu se mișcă bani reali.</p>
        </div>
      </header>
      <OfflineNote>Nu ai internet. Socotelile merg din datele salvate pe telefon, dar pensia nu se poate porni, schimba sau opri acum.</OfflineNote>
      <div className="bento">
        <section className="chart-card field hero-card s12" aria-live="polite">
          <div>
            <p className="eyebrow">{sim ? `La ${P.targetAge} de ani ai` : 'Pensia ta'}</p>
            <p className="amount">{sim ? aboutLei(sim.atTarget.probable) : lei(monthly)}</p>
            <p className="why">
              {sim
                ? `Adică încă ${lei(sim.perMonthAfter)} pe lună, timp de ${P.payoutYears} ani, dacă pui ${lei(monthly)} pe lună de acum. Din banii ăștia, ${aboutLei(sim.paidIn)} îi pui tu.${savedSoFar > 0 ? ` Pe lângă ei, ai strâns deja ${lei(savedSoFar)}.` : ''}`
                : `Pui deoparte în fiecare lună. Simularea e pentru cine are sub ${P.targetAge} de ani, așa că nu arătăm o sumă la final.`}
            </p>
          </div>
        </section>
        <section className="card s7">
          <div className="card-h">
            <h2>{running ? `Pui ${lei(current)} pe lună` : 'Cât pui pe lună?'}</h2>
          </div>
          <div>
            {running && <p className="note">Poți schimba suma de la următoarea plată sau poți opri pensia.</p>}
            <label className="ob-field pn-slider">
              {running ? 'Altă sumă' : 'Pui'}: <b>{lei(monthly)}</b>
              <input type="range" min={P.sliderMinLei} max={P.sliderMaxLei} step={P.sliderStepLei} value={monthlyLei} onChange={(e) => setMonthlyLei(+e.target.value)} />
            </label>
            <p className="note">{hint}</p>
            <p className="paper-effect" aria-live="polite">
              {salaryLine(monthly)}
            </p>
            <div>{actions()}</div>
          </div>
        </section>
        <section className="card s5" id="side">
          {running && (
            <>
              <h2>Până acum</h2>
              <p className="n20 gap">{lei(savedSoFar)}</p>
              {payments.length ? (
                <>
                  <ol className="ac-list gap">
                    {payments.slice(0, LATEST_PAYMENTS).map((x) => (
                      <li key={x.id ?? x.occurred_at}>
                        <span>
                          <b>{date(x.occurred_at.slice(0, 10), true)}</b>
                        </span>
                        <span className="ac-amt">{lei(-x.amount_bani)}</span>
                      </li>
                    ))}
                  </ol>
                  {payments.length > LATEST_PAYMENTS && <p className="note">Și încă {payments.length - LATEST_PAYMENTS} plăți mai vechi.</p>}
                </>
              ) : (
                <p className="note">Prima plată apare aici după ce trece.</p>
              )}
            </>
          )}
          <h3 className={running ? 'gap' : undefined}>Unde se strâng banii</h3>
          <p className="note">Fondurile sunt în ordinea alfabetului. Nu îți spunem pe care să-l alegi.</p>
          <label className="ob-field">
            Fondul de pensii
            <select disabled={!!me && !online} value={fundId ?? ''} onChange={(e) => void pickFund(e.target.value)}>
              <option value="">Nu am ales încă</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.min_monthly_lei === null ? '' : t(`, de la ${f.min_monthly_lei} lei`)}
                </option>
              ))}
            </select>
          </label>
          {chosen && (
            <p className="note gap">
              {chosen.administrator}. {chosen.min_monthly_lei === null ? 'Nu știm încă suma minimă cerută.' : t(`Cere cel puțin ${chosen.min_monthly_lei} lei pe lună.`)}
              {chosen.status === 'DE-VERIFICAT' && (
                <>
                  {' '}
                  <Verify />
                </>
              )}
            </p>
          )}
          {!me && <p className="note gap">Fără cont, alegerea rămâne doar pe pagina asta.</p>}
          <ErrorLine>{fundErr}</ErrorLine>
        </section>
        <section className="card s12" id="grow">
          <div className="card-h">
            <h2>Dacă banii cresc mai încet sau mai repede</h2>
          </div>
          {sim && (
            <div className="chips" role="group" aria-label="Cât cresc banii pe an">
              {GROWTH.map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={k === growth} onClick={() => setGrowth(k)}>
                  {growthName[k]}
                </button>
              ))}
            </div>
          )}{' '}
          {sim && (
            <label className="ob-field pn-compare">
              Compară cu
              <select value={against} onChange={(e) => pickCompare(e.target.value)}>
                <option value="pilon3">Doar Pilonul III</option>
                <option value="contract">Casa de Pensii: contract</option>
                <option value="declaration">Casa de Pensii: Declarația Unică</option>
                <option value="cei">Cont de economii (CEI)</option>
              </select>
            </label>
          )}{' '}
          {sim && compareNote && (
            <p className="note" aria-live="polite">
              {compareNote}
            </p>
          )}
          {sim && <PensionChart path={pensionPath(age, monthly, P)} chosen={growth} names={growthName} compare={compare} />}
          <div>
            {sim ? (
              <>
                <ul className="sums">
                  {GROWTH.map((k) => (
                    <li key={k}>
                      <span>{k === growth ? <b>Dacă banii cresc cu {growthName[k]}</b> : `Dacă banii cresc cu ${growthName[k]}`}</span>
                      <b>{aboutLei(sim.atTarget[k])}</b>
                    </li>
                  ))}
                </ul>
                <p className="note">Sus am socotit cu {growthName.probable}. Nimeni nu știe dinainte cât cresc banii, așa că asta nu e o promisiune. Linia subțire arată cât pui tu.</p>
              </>
            ) : (
              <p className="note">Fără simulare, nu avem ce arăta aici.</p>
            )}
          </div>
        </section>
        <section className="card s12">
          <details className="fold pn-fold">
            <summary>
              De ce nu Casa de Pensii?
              {CHEVRON}
            </summary>
            <div>
              <ul className="sums">
                {row('Casa de Pensii', `Contract opțional, din ${date(st.contractFrom, true)}`, `de la ${lei(st.contractMonthly)} pe lună`)}
                {row(
                  'Casa de Pensii',
                  'Prin Declarația Unică',
                  <>
                    {lei(st.declarationYearly)} pe an
                    {!st.declarationVerified && (
                      <>
                        {' '}
                        <Verify />
                      </>
                    )}
                  </>,
                )}
                {row('Pilonul III', 'Merge de azi, cu sume mici', options.pilon3.lowestMonthly ? `de la ${lei(options.pilon3.lowestMonthly)} pe lună` : 'sume mici')}
                <li className="pn-funds">
                  <ul className="sums">
                    {options.pilon3.funds.map((f) =>
                      row(
                        f.name,
                        f.administrator ?? '',
                        f.minMonthly === null ? (
                          <>
                            suma nu se știe <Verify />
                          </>
                        ) : (
                          <>
                            de la {lei(f.minMonthly)} pe lună
                            {!f.verified && (
                              <>
                                {' '}
                                <Verify />
                              </>
                            )}
                          </>
                        ),
                      ),
                    )}
                  </ul>
                </li>
                {row(
                  'Cont de economii (CEI)',
                  `Din ${date(options.cei.availableFrom, true)}`,
                  options.cei.ceilingYearly ? (
                    `până la ${lei(options.cei.ceilingYearly)} pe an`
                  ) : (
                    <>
                      sumele nu se știu încă <Verify />
                    </>
                  ),
                )}
              </ul>
              <p className="note">
                Pensia minimă de stat e {lei(st.minimumPension)} pe lună, dar cere cel puțin {st.minimumYears} ani de plăți.{late}
              </p>
              <p className="note">De aceea socotim cu Pilonul III: există de azi și merge cu sume mici. Fondurile sunt în ordine alfabetică. Nu îți spunem ce să alegi.</p>
            </div>
          </details>
        </section>
      </div>
      {ask && <AskSheet ask={ask} onClose={() => setAsk(null)} />}
    </>
  );
}

/* Asking before money moves. One key per dialog: the yes button again after an error sends the same key,
   so a pension that did start (the answer got lost) isn't started twice. Opening it again makes a new one. */
function AskSheet({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  const saved = useSaved();
  const store = useStore()!;
  const online = useOnline();
  const [key] = useState(newIntentKey);
  const [busy, setBusy] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function yes() {
    setBusy(true);
    setErr(null);
    try {
      await saved(ask.done, () => store.send((tools) => ask.action(tools, key)));
      onClose();
    } catch (e) {
      setBusy(false);
      setStuck(!!(e as { unknownOutcome?: boolean } | null)?.unknownOutcome); // It may have happened: no second tap until the next load shows it.
      setErr(failText(e, online));
    }
  }
  return (
    <Sheet open onClose={onClose} className="h-sheet" label={ask.title} locked={busy}>
      <h2>{ask.title}</h2>
      <p className="note">{ask.text}</p>
      <ErrorLine>{err}</ErrorLine>
      <div className="ob-actions">
        <button type="button" className={`btn ${ask.danger ? 'btn-danger' : 'btn-dark'}`} disabled={busy || stuck} aria-busy={busy || undefined} onClick={() => void yes()}>
          {busy ? 'Așteaptă puțin…' : ask.yes}
        </button>
        <button type="button" className="btn btn-line" disabled={busy} onClick={onClose}>
          {stuck ? 'Închide' : 'Renunță'}
        </button>
      </div>
    </Sheet>
  );
}
