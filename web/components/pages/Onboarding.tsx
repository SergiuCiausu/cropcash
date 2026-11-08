'use client';
/* Onboarding in three steps: who and where, what's grown (the APIA paper can fill it in), and the money
   there is now (was web/legacy/onboarding.js). What was gathered and what's sown are asked on Recolte,
   linked from the result. The sidebar lists the steps and fills in the farm as it's typed.
   Everything is calculated on the phone. Onboarding needs an account, and the farm goes to the
   server, so the last step needs internet. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { computeSubsidies, withApiaDecision } from '../../../packages/shared/src/subsidies/index';
import { isOwnCrop, OnboardingInputSchema } from '../../../packages/shared/src/farm/index';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import { about, exact, failText, group } from '../../lib/cc/format';
import { ionFarm } from '../../lib/cc/farm';
import { FarmProvider, useFarm, useOnline, useStore } from '../../lib/cc/react';
import * as Live from '../../lib/live/index';
import { onboardingHarvests } from '../../lib/live/farm';
import { AmountEcho, Icon } from '../app/bits';
import { FlowFrame } from '../app/FlowFrame';
import FlowSkeleton from '../skeleton/FlowSkeleton';
import { PaperButton, PapersProvider, usePapers } from '../app/Papers';

const STEPS = [
  { label: 'Despre tine', short: 'Tu', icon: 'home' as const },
  { label: 'Culturile', short: 'Culturi', icon: 'sprout' as const },
  { label: 'Banii de acum', short: 'Bani', icon: 'sack' as const },
];
const CROPS = 1;
const MONEY = 2;
const RESULT = 3;
type Field = 'name' | 'age' | 'county' | 'crops' | 'money' | 'form';

const num = (v: string) => parseFloat(String(v).replace(',', '.'));
const roundHa = (v: number) => Math.round(Math.max(0, v) * 100) / 100;
const haText = (v: number) => String(v).replace('.', ',');

export default function Onboarding() {
  return (
    <FarmProvider mode="farm">
      <PapersProvider>
        <OnboardingFlow />
      </PapersProvider>
    </FarmProvider>
  );
}

export function OnboardingFlow() {
  const farm = useFarm();
  /* Needs an account: guardTarget sends a visitor with no session to /login. */
  useEffect(() => {
    const g = Live.guardTarget({ pathname: location.pathname, hash: location.hash, hasSession: farm ? farm.signedIn : true, hasFarmCopy: !!farm?.me, online: navigator.onLine });
    if (g.action === 'redirect') location.replace(g.to);
  }, [farm]);
  if (!farm?.signedIn) return <FlowSkeleton />;
  return <Steps />;
}

function Steps() {
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const papers = usePapers();
  const app = farm.farmData;
  const crops = useMemo(() => app.crops.crops.filter((c) => !isOwnCrop(c.id)), [app]);
  const counties = app.counties.counties;
  const year = app.subsidies.meta.campaign_year;
  /* A repeat run (a second tap, or "Schimbă ferma") edits the saved farm and keeps its sowing months. */
  const me = farm.me;
  const [i, setI] = useState(0);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [county, setCounty] = useState('');
  const [ha, setHa] = useState<Record<string, number>>(() => Object.fromEntries(crops.map((c) => [c.id, 0])));
  const [haText_, setHaText] = useState<Record<string, string>>({});
  const [money, setMoney] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [paperNote, setPaperNote] = useState('');
  const [decisionBani, setDecisionBani] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const h1 = useRef<HTMLHeadingElement>(null);
  const firstError = useRef<Field | null>(null);

  const sown = useMemo(() => new Map((me?.parcels ?? []).filter((p) => p.planted_month).map((p) => [p.crop_id, p.planted_month!])), [me]);
  const parcels = crops.filter((c) => ha[c.id] > 0).map((c) => ({ cropId: c.id, areaHa: ha[c.id], ...(sown.has(c.id) ? { plantedMonth: sown.get(c.id)! } : {}) }));
  const totalHa = parcels.reduce((s, p) => s + Math.round(p.areaHa * 100), 0) / 100;
  const cropNames = parcels.map((p) => crops.find((c) => c.id === p.cropId)!.name_ro.toLowerCase());
  /* Age is asked first, so the figure already counts the young farmer scheme. A payment decision replaces the estimate. */
  const estimate = () => {
    const r = computeSubsidies({ age: +age, parcels }, app);
    return decisionBani ? withApiaDecision(r, { campaignYear: year, totalBani: decisionBani }, year) : r;
  };

  /* After a step changes, the heading (or the first wrong field) gets the cursor. */
  useEffect(() => {
    const f = firstError.current;
    const el = f && f !== 'form' && f !== 'crops' ? document.getElementById(f) : null;
    (el ?? h1.current)?.focus();
    firstError.current = null;
  }, [i, errors]);

  const go = (n: number) => {
    setI(n);
    setErrors({});
    scrollTo(0, 0);
  };
  const fail = (e: Partial<Record<Field, string>>) => {
    firstError.current = Object.keys(e)[0] as Field;
    setErrors(e);
  };
  const clearError = (f: Field) => errors[f] && setErrors(({ [f]: _, ...rest }) => rest);

  const CHECK = [
    () => {
      const e: Partial<Record<Field, string>> = {};
      if (!name.trim()) e.name = 'Scrie-ți numele.';
      const a = +age;
      if (!(age !== '' && Number.isInteger(a) && a >= 16 && a <= 100)) e.age = 'Scrie vârsta ca număr, de la 16 la 100.';
      if (!county) e.county = 'Alege județul din listă.';
      return Object.keys(e).length ? e : null;
    },
    () => (parcels.length ? null : { crops: 'Scrie hectarele pentru cel puțin o cultură.' }),
    () => {
      if (money.trim() === '') return null;
      const v = parseWholeLei(money);
      return v !== null && v <= 100000000 ? null : { money: `Scrie suma ca număr, de exemplu ${group(ionFarm(app).startBalanceBani / 100)}.` };
    },
  ];

  /* A farm that already exists is edited. What Recolte already holds (gathered grain, other years) is kept. */
  async function save(m: string): Promise<string | null> {
    const parsed = OnboardingInputSchema.safeParse({ name, county, age: +age, startBalanceLei: m.trim() === '' ? 0 : parseWholeLei(m), parcels });
    if (!parsed.success) return 'Verifică datele de la pașii de dinainte.';
    const input = parsed.data;
    try {
      await store.send(async ({ write, api }) => {
        const update = () => write('update_farm', input);
        if (me) await update();
        else
          await api('/api/farmers', { method: 'POST', body: JSON.stringify(input) }).catch((e: { status?: number }) => {
            if (e.status === 409) return update();
            throw e;
          });
        const before = me?.harvests;
        await write('save_harvests', onboardingHarvests({ year: farm.baseYear, openingBani: input.startBalanceLei * 100, parcels: input.parcels, gathered: before?.gathered ?? [], before }));
        if (decisionBani) await write('save_apia_decision', { campaignYear: year, totalBani: decisionBani });
      });
      return null;
    } catch (e) {
      return failText(e, online);
    }
  }

  async function next(m = money) {
    if (saving) return;
    const problems = CHECK[i]();
    if (problems) return fail(problems);
    if (i === MONEY) {
      setSaving(true);
      const failed = await save(m);
      setSaving(false);
      if (failed) return fail({ form: failed });
    }
    go(i + 1);
  }

  /* The crops step is where the farmer checks and fixes what the paper said. */
  async function readPaper() {
    const r = await papers.pick({ accepts: ['apia_cerere', 'apia_decizie'], pages: true });
    if (!r) return;
    setHa((h) => ({ ...h, ...Object.fromEntries(r.parcels.map((p) => [p.cropId, p.areaAri / 100])) }));
    setHaText({});
    const none = r.kind === 'apia_decizie' ? 'Decizia nu are hectarele. Scrie-le tu mai jos.' : 'Nu am găsit hectare pe hârtie. Scrie-le tu mai jos.';
    const found = r.parcels.length ? 'Am completat de pe hârtie. Verifică hectarele mai jos.' : none;
    setPaperNote(r.unknownCrops.length ? `${found} Nu am recunoscut: ${r.unknownCrops.join(', ')}.` : found);
    if (r.kind === 'apia_decizie') setDecisionBani((await papers.confirmDecision(r)) ?? null);
    go(CROPS);
  }

  const setCropHa = (id: string, v: number, text?: string) => {
    setHa((h) => ({ ...h, [id]: v }));
    setHaText((t) => ({ ...t, [id]: text ?? haText(v) }));
    if (v > 0) clearError('crops');
  };

  const err = (f: Field) =>
    errors[f] ? (
      <p className="ob-err" id={`err-${f}`} role="alert">
        {errors[f]}
      </p>
    ) : null;
  const invalid = (f: Field) => (errors[f] ? { 'aria-invalid': true, 'aria-describedby': `err-${f}` } : {});
  const heading = (title: string, lead?: string) => (
    <header className="page-h">
      <div>
        <p className="eyebrow">{i < RESULT ? `Pasul ${i + 1} din ${STEPS.length}` : 'Gata'}</p>
        <h1 tabIndex={-1} ref={h1}>
          {title}
        </h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
    </header>
  );
  const actions = (children: React.ReactNode) => (
    <>
      {err('form')}
      <div className="ob-actions">{children}</div>
    </>
  );
  const back = (
    <button type="button" className="btn btn-line" onClick={() => go(i - 1)}>
      Înapoi
    </button>
  );

  /* The farm in the sidebar, as it's typed. */
  const countyName = counties.find((c) => c.code === county)?.name_ro;
  const who = [name.trim(), countyName].filter(Boolean).join(', ');
  const what = parcels.length ? `${haText(totalHa)} ha, ${cropNames.join(' și ')}` : '';
  const farmBox = (
    <div className="farm glass" aria-live="polite">
      {!who && !what ? (
        <>
          <b>Ferma ta</b>Apare aici pe măsură ce scrii.
        </>
      ) : (
        <>
          <b>{who || 'Ferma ta'}</b>
          {what || 'Culturile apar la pasul 2.'}
          {parcels.length > 0 && (
            <div className="ob-amt">
              <span>De la APIA</span>
              <span>{decisionBani ? exact(decisionBani) : about(estimate().totals.lei.probable)} lei</span>
            </div>
          )}
        </>
      )}
    </div>
  );

  const stepState = (n: number) => (n === i ? 'now' : n < i ? 'done' : 'next');

  let body: React.ReactNode;
  if (i === 0)
    body = (
      <>
        {heading('Hai să-ți vedem banii', 'Îți arătăm cât primești, când vin banii și cât poți cheltui pe lună. Sunt doar trei pași.')}
        <section className="card">
          <h2>Despre tine</h2>
          <label className="ob-field">
            Cum te cheamă?
            <input id="name" value={name} autoComplete="given-name" {...invalid('name')} onChange={(e) => (setName(e.target.value), clearError('name'))} />
          </label>
          {err('name')}
          <label className="ob-field">
            Câți ani ai?
            <input id="age" value={age} inputMode="numeric" {...invalid('age')} onChange={(e) => (setAge(e.target.value.trim()), clearError('age'))} />
          </label>
          {err('age')}
          <label className="ob-field">
            În ce județ e ferma?
            <select id="county" value={county} {...invalid('county')} onChange={(e) => (setCounty(e.target.value), clearError('county'))}>
              <option value="">Alege județul</option>
              {counties.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name_ro}
                </option>
              ))}
            </select>
          </label>
          {err('county')}
        </section>
        {actions(
          <button type="submit" className="btn btn-dark">
            Mai departe
          </button>,
        )}
      </>
    );
  else if (i === CROPS)
    body = (
      <>
        {heading('Ce cultivi anul ăsta?', 'Scrie câte hectare ai din fiecare cultură.')}
        <section className="card ob-paper-card">
          <div className="card-h">
            <h2>Ai o hârtie de la APIA?</h2>
          </div>
          <p className="note">{paperNote || 'Cererea sau decizia de plată. O citim și completăm noi hectarele.'}</p>
          <div className="ob-paper">
            <PaperButton label="Încarcă hârtia de la APIA" onClick={() => void readPaper()} />
          </div>
        </section>
        <section className="card gap">
          <div className="card-h">
            <h2>Culturile tale</h2>
            <span>în hectare</span>
          </div>
          {crops.map((c) => (
            <div className="ob-crop" key={c.id}>
              <b>{c.name_ro}</b>
              <span className="ob-step">
                <button type="button" aria-label={`Mai puțin ${c.name_ro}`} onClick={() => setCropHa(c.id, roundHa(ha[c.id] - 1))}>
                  −
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  value={haText_[c.id] ?? haText(ha[c.id])}
                  aria-label={`Hectare ${c.name_ro}`}
                  {...invalid('crops')}
                  onChange={(e) => {
                    const v = num(e.target.value);
                    setCropHa(c.id, Number.isFinite(v) ? roundHa(v) : 0, e.target.value);
                  }}
                />
                <button type="button" aria-label={`Mai mult ${c.name_ro}`} onClick={() => setCropHa(c.id, roundHa(ha[c.id] + 1))}>
                  +
                </button>
              </span>
            </div>
          ))}
          {err('crops')}
        </section>
        <section className="chart-card field hero-card ob-live gap" aria-live="polite">
          <p className="eyebrow">De la APIA primești</p>
          {parcels.length ? (
            <>
              <p className="amount">{about(estimate().totals.lei.probable)} lei</p>
              <p className="range">pentru {haText(totalHa)} ha</p>
            </>
          ) : (
            <p className="range">Scrie hectarele și vezi suma aici.</p>
          )}
        </section>
        {actions(
          <>
            {back}
            <button type="submit" className="btn btn-dark">
              Mai departe
            </button>
          </>,
        )}
      </>
    );
  else if (i === MONEY)
    body = (
      <>
        {heading('Câți bani ai acum?', 'Ne trebuie ca să-ți spunem dacă îți ajung până vin banii de pe recoltă.')}
        <section className="card">
          <h2>Banii de acum</h2>
          <label className="ob-field">
            Suma, în lei
            <input id="money" value={money} inputMode="numeric" {...invalid('money')} onChange={(e) => (setMoney(e.target.value), clearError('money'))} />
            <AmountEcho text={money} />
          </label>
          {err('money')}
          <p className="note">Poți schimba suma oricând, din Datele planului.</p>
        </section>
        {actions(
          <>
            {back}
            <button type="submit" className="btn btn-dark" disabled={saving}>
              Arată-mi banii
            </button>
            <button
              type="button"
              className="btn btn-line"
              disabled={saving}
              onClick={() => {
                setMoney('');
                void next('');
              }}
            >
              Nu știu, sar peste
            </button>
          </>,
        )}
      </>
    );
  else {
    const { totals } = estimate();
    const decided = !!decisionBani;
    const nextRow = (href: string, title: string, sub: string) => (
      <a href={href}>
        <span>
          <b>{title}</b>
          <small>{sub}</small>
        </span>
        <Icon name="arrow" />
      </a>
    );
    body = (
      <>
        {heading('Ferma ta e gata', `Am creat Recolta ${farm.baseYear} cu ${haText(totalHa)} ha de ${cropNames.join(' și ')}.`)}
        <section className="chart-card field hero-card">
          <p className="eyebrow">De la APIA primești</p>
          <p className="amount">{decided ? exact(totals.lei.probable) : about(totals.lei.probable)} lei</p>
          <p className="range">{decided ? 'din decizia ta de plată' : `între ${about(totals.lei.min)} lei și ${about(totals.lei.max)} lei`}</p>
          <div className="sum">
            <p>
              Avansul<b>{exact(totals.advanceLei)} lei</b>
            </p>
            <p>
              Restul<b>{exact(totals.balanceLei.probable)} lei</b>
            </p>
          </div>
        </section>
        <section className="card gap">
          <h2>Ce urmează</h2>
          <nav className="ob-next" aria-label="Ce urmează">
            {nextRow('/prognoza#ani', 'Vezi cât îți aduce ferma', 'Banii fermei, an de an')}
            {nextRow('/recolte#strans', 'Spune-ne ce ai strâns și ce ai semănat', 'Până atunci folosim mediile')}
            {nextRow('/subventii', 'Vezi cum am calculat', 'Fiecare schemă APIA și de ce o primești')}
          </nav>
        </section>
      </>
    );
  }

  return (
    <FlowFrame
      label="Pașii"
      aside={farmBox}
      onPick={(id) => +id < i && go(+id)}
      steps={STEPS.map((s, n) => ({ id: String(n), label: s.label, short: s.short, state: stepState(n), pill: stepState(n) === 'done' ? undefined : String(n + 1), icon: stepState(n) === 'done' ? 'check' : s.icon, current: n === i, disabled: stepState(n) === 'next' }))}
    >
      <form
        className="ob-main"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
      >
        {body}
      </form>
    </FlowFrame>
  );
}
