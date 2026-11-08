'use client';
/* "Subvenția ta": estimate_subsidy, get_subsidy_payments, list_schemes, explain_subsidy, check_scheme,
   what_if_subsidy (was web/legacy/subventii.js). Every figure comes from the shared engine, on the phone,
   so the page and the simulator work offline. Reading a payment decision and saving it need internet. */
import { useMemo, useRef, useState } from 'react';
import { computeSubsidies } from '../../../packages/shared/src/subsidies/index';
import { whatIfSubsidy } from '../../../packages/shared/src/functions/whatIf';
import { about, cents, date, daysLeft, exact, failText, ha, num, zile } from '../../lib/cc/format';
import { useFarm, useMoney, useOnline, useStore, useView } from '../../lib/cc/react';
import { Icon, Sheet, useHref, Verify } from '../app/bits';
import { useWidth } from '../app/FarmChart';
import { PageLink, SubNav } from '../app/Frame';
import { FutureNote } from '../app/PageNotes';
import { PaperButton, usePapers } from '../app/Papers';

const AREA = new Set(['total_ha', 'arable_ha', 'unproductive_ha']);
const AXIS_START = '2026-10-01';
const AXIS_END = '2027-07-01';
const AXIS_MONTHS = ['oct.', 'nov.', 'dec.', 'ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.'];
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

interface Failed {
  field: string;
  op: string;
  expected: unknown;
  actual: unknown;
}
function reasonText(c: Failed) {
  const fmt = (v: unknown) => (AREA.has(c.field) ? num(v as number) : String(v));
  const e = fmt(c.expected);
  const a = fmt(c.actual);
  const texts: Record<string, string> = {
    'age:<': `Doar pentru fermierii sub ${e} de ani. Tu ai ${a}.`,
    'total_ha:<=': `Doar pentru fermele de cel mult ${e} ha. Tu ai ${a} ha.`,
    'total_ha:>=': `Trebuie cel puțin ${e} ha. Tu ai ${a} ha.`,
    'arable_ha:>=': `Trebuie cel puțin ${e} ha de teren arabil. Tu ai ${a} ha.`,
    'arable_ha:>': 'Nu ai teren arabil declarat.',
    'distinct_crops:>=': `Trebuie cel puțin ${e} culturi diferite. Tu ai ${a}.`,
    'unproductive_ha:>': 'Doar dacă lași zone necultivate, ca fâșii sau margini de câmp. Suma pentru 2026 nu e anunțată încă.',
  };
  return texts[`${c.field}:${c.op}`] ?? 'Nu se potrivește cu ferma ta.';
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

export default function Subventii() {
  const view = useView('picked')!;
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const papers = usePapers();
  const href = useHref();
  const { text: t } = useMoney();
  const FARM = view.farm;
  const TODAY = view.today;
  const crop = view.crop;
  const me = farm.me;
  const data = view.data();
  const plan = view.farmPlan();
  const base = plan.subsidies;
  const { totals } = base;
  const part = crop ? crop.share : (bani: number) => bani;
  const decided = !!base.decision;
  const rate = base.rates.FEGA;
  const drop = Math.round((1 - (base.schemes.find((s) => s.code === 'PD-01')?.factors.min ?? 1)) * 100);
  const campaign = data.subsidies.meta.campaign_year;
  const schemeData = (code: string) => data.subsidies.schemes.find((s) => s.code === code);
  const rulesUnverified = (code: string) => (schemeData(code)?.eligibility?.rules ?? []).some((r: { status?: string }) => r.status === 'DE-VERIFICAT');

  const [payKey, setPayKey] = useState<'adv' | 'bal' | null>(null);

  /* ---- The real total, from the farmer's payment decision ---- */
  async function sendDecision(name: string, input: Record<string, unknown>) {
    try {
      await store.send(({ write }) => write(name, input));
    } catch (e) {
      void papers.tell('Nu am putut salva', failText(e, online));
    }
  }
  /* What the farmer is about to accept, worked out on the phone with the same plan the server uses. */
  const salaryWith = (bani: number) => {
    const salary = (f: unknown) => view.farmPlan(f as Parameters<typeof view.farmPlan>[0]).salary.salary;
    const before = salary(me);
    const after = salary({ ...me, apia_decision: { campaignYear: campaign, totalBani: bani } });
    return t(after === before ? `Salariul tău rămâne ${exact(after)} lei pe lună.` : `Salariul tău trece de la ${exact(before)} lei la ${exact(after)} lei pe lună.`);
  };
  async function readDecision() {
    const reading = await papers.pick({ accepts: ['apia_decizie'], pages: true });
    if (!reading) return;
    /* Not on a farm the server knows yet: nothing to save it on, so the plan can't use it. */
    if (!me) return void papers.tell('Nu am unde salva suma', 'Fă-ți mai întâi ferma, apoi pune decizia.');
    const totalBani = await papers.confirmDecision(reading, salaryWith);
    if (totalBani) await sendDecision('save_apia_decision', { campaignYear: campaign, totalBani });
  }

  /* ---- Payments: the plan always counts on the last day of each window ---- */
  const adv = data.calendar.events.find((e) => e.id === 'apia-avans')!;
  const bal = data.calendar.events.find((e) => e.id === 'apia-sold')!;
  const window = (e: typeof adv) => e as typeof adv & { start: string; end: string; source_url?: string };
  /* The plan's own flag, so a date still to be checked is marked as it is in Calendar. */
  const entries = plan.timelines.medium.months.flatMap((m) => m.entries);
  const unverified = (kind: string) => !!entries.find((e) => e.kind === kind)?.unverified;
  /* Only a farm on the server knows whether the advance came. */
  const advanceIn = (me?.transactions ?? []).some((x) => x.kind === 'apia_advance');
  const pending = me && !advanceIn ? ['Încă n-a intrat la tine'] : [];
  const crumb = crop ? `, partea pentru ${crop.name.toLowerCase()}` : '';
  const between = (e: { start: string; end: string }) => `Între ${date(e.start)} și ${date(e.end, e.end.slice(0, 4) !== TODAY.slice(0, 4))}`;
  const min = part(totals.balanceLei.min);
  const max = part(totals.balanceLei.max);
  const A = window(adv);
  const B = window(bal);
  const payments = {
    adv: {
      title: 'Avansul de la APIA',
      event: A,
      value: part(totals.advanceLei),
      range: null as [number, number] | null,
      unverified: unverified('apia_advance'),
      lines: [between(A), ...pending],
      text: [`Plățile se fac între ${date(A.start)} și ${date(A.end, true)}. Planul socotește cu ultima zi, ca să fii acoperit dacă banii vin târziu.`, ...pending],
    },
    bal: {
      title: 'Restul de la APIA',
      event: B,
      value: part(totals.balanceLei.probable),
      range: decided ? null : ([min, max] as [number, number]),
      unverified: unverified('apia_balance'),
      lines: decided ? [between(B)] : [between(B), `Între ${about(min)} și ${about(max)} lei`],
      text: [`Vine între ${date(B.start)} și ${date(B.end, true)}. Nu știm exact luna. Noi am socotit că vine abia pe ${date(B.end)}, ca să fii acoperit.`],
    },
  };
  const span = daysLeft(AXIS_END, TODAY) - daysLeft(AXIS_START, TODAY);
  const at = (iso: string) => ((daysLeft(iso, TODAY) - daysLeft(AXIS_START, TODAY)) / span) * 100;
  const bar = (cls: string, from: string, to: string) => <i className={cls} style={{ left: `${at(from).toFixed(2)}%`, width: `${(at(to) - at(from)).toFixed(2)}%` }} />;

  const needsVerify = (s: (typeof base.schemes)[number]) => s.schemeStatus === 'DE-VERIFICAT' || s.unverified.length > 0;
  const reasons = [
    ...base.notEligible.map((n) => ({ tag: 'Nu primești', tone: 'd', name: n.nameRo, code: n.code, why: n.failed.map((f) => reasonText(f as Failed)) })),
    ...base.excluded.map((x) => ({ tag: 'Nu știm încă', tone: 'n', name: x.nameRo, code: x.code, why: ['Suma pentru anul ăsta nu e anunțată încă.'] })),
  ];
  const pay = payKey ? payments[payKey] : null;
  const payDays = pay ? daysLeft(pay.event.end, TODAY) : 0;

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Subvenția ta</h1>
          <p className="lead">{crop ? `Partea pentru ${crop.name.toLowerCase()} din subvenția fermei.` : 'Cât primești de la APIA pentru 2026 și când vin banii.'}</p>
        </div>
      </header>
      <FutureNote />
      <SubNav page="/subventii" href={href} />
      <div className="bento">
        <section className="chart-card field hero-card s6">
          <p className="eyebrow">{crop ? `Pentru ${crop.name.toLowerCase()} primești` : 'De la APIA primești'}</p>
          <p className="amount">{t(`${about(part(totals.lei.probable))} lei`)}</p>
          <p className="range">{decided ? 'din decizia ta de plată' : t(`între ${about(part(totals.lei.min))} lei și ${about(part(totals.lei.max))} lei`)}</p>
          <p className="why">
            {crop
              ? t(`APIA plătește o singură sumă pentru toată ferma, de ${about(totals.lei.probable)} lei. Aici vezi partea după hectare: ${ha(crop.ari)} din ${ha(crop.totalAri)} ha.`)
              : decided
                ? 'Planul și salariul tău socotesc cu această sumă, nu cu estimarea noastră.'
                : `Suma exactă depinde de câți fermieri cer bani anul ăsta. În ultimii ani, sprijinul de bază a ieșit și cu ${drop}% mai mic decât era plănuit.`}
          </p>
          <div className="sum">
            <p>
              Avansul<b>{t(`${exact(part(totals.advanceLei))} lei`)}</b>
            </p>
            <p>
              Restul<b>{t(`${exact(part(totals.balanceLei.probable))} lei`)}</b>
            </p>
          </div>
          {!crop && (
            <div className="hero-paper">
              {decided ? (
                <button type="button" className="h-quiet on-hero" onClick={() => void sendDecision('clear_apia_decision', {})}>
                  Scoate suma din decizie
                </button>
              ) : (
                <PaperButton label="Ai decizia de plată? Pune suma reală" onClick={() => void readDecision()} />
              )}
            </div>
          )}
        </section>
        <section className="card s6">
          <div className="card-h">
            <h2>Când vin banii</h2>
          </div>
          <div className="pay">
            {(Object.keys(payments) as ('adv' | 'bal')[]).map((key) => {
              const p = payments[key];
              return (
                <button key={key} type="button" className="crow" onClick={() => setPayKey(key)}>
                  <span className="ti">
                    <Icon name="down" />
                  </span>
                  <span className="r-main">
                    <b>
                      {p.title}
                      {p.unverified ? (
                        <>
                          {' '}
                          <Verify />
                        </>
                      ) : null}
                    </b>
                    {p.lines.map((l) => (
                      <small key={l}>{t(l)}</small>
                    ))}
                  </span>
                  <span className="c-amt pos">{t(`+${exact(p.value)} lei`)}</span>
                </button>
              );
            })}
          </div>
          <div className="axis" aria-hidden="true">
            <div className="axis-track">
              {bar('adv', A.start, A.end)}
              {bar('bal', B.start, B.end)}
              <i className="now" style={{ left: `${at(TODAY).toFixed(2)}%` }} />
            </div>
            <div className="axis-m">
              {AXIS_MONTHS.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </div>
          <p className="note gap">Planul tău socotește cu ultima zi, ca să fii acoperit dacă banii vin târziu.</p>
          <p className="note gap pay-link">
            <PageLink path="/calendar" href={href('/calendar')}>
              Vezi tot calendarul
            </PageLink>
          </p>
        </section>
        {!crop && (
          <section className="card s7">
            <div className="card-h">
              <h2>Ce primești</h2>
              <span>Apasă ca să vezi calculul</span>
            </div>
            <div>
              {base.schemes.map((s) => {
                const src = (schemeData(s.code) as { source_url?: string } | undefined)?.source_url;
                const notes = s.unverified.map((u: { note?: string }) => u.note).filter(Boolean);
                return (
                  <details className="scheme" key={s.code}>
                    <summary>
                      <b>
                        {s.nameRo} {needsVerify(s) ? <Verify /> : null}
                      </b>
                      <span className="amt">{t(`${about(s.leiIndicative.probable)} lei`)}</span>
                      <Icon name="arrow" />
                    </summary>
                    <dl className="facts">
                      <dt>Calculul</dt>
                      <dd>
                        {ha(s.units)} ha × {num(s.amountEurPerUnit)} € = {cents(s.eur.probable)} €
                      </dd>
                      <dt>În lei</dt>
                      <dd>{t(`${about(s.leiIndicative.probable)} lei`)}, la {num(rate.value)} lei pentru un euro</dd>
                      <dt>Avans</dt>
                      <dd>{cents(s.advanceEur)} €</dd>
                      <dt>Stare</dt>
                      <dd>
                        {s.schemeStatus === 'DE-VERIFICAT' ? 'Suma e de verificat.' : 'Suma e confirmată pentru 2026.'}
                        {s.unverified.length ? ' O condiție e de verificat.' : ''}
                      </dd>
                      {notes.length > 0 && (
                        <>
                          <dt>De verificat</dt>
                          <dd>{notes.join(' ')}</dd>
                        </>
                      )}
                      <dt>Sursa</dt>
                      <dd>
                        {src ? (
                          <a href={src} rel="noopener" target="_blank">
                            {host(src)}
                          </a>
                        ) : (
                          'Lipsește'
                        )}
                      </dd>
                    </dl>
                  </details>
                );
              })}
            </div>
            {decided && <p className="note gap">Pe rânduri rămâne calculul nostru. Totalul de sus vine din decizia ta de plată.</p>}
          </section>
        )}
        {!crop && (
          <section className="card s5">
            <h2>Ce nu primești și de ce</h2>
            <div>
              {reasons.length ? (
                reasons.map((r) => (
                  <div className="reason" key={r.code}>
                    <div className="r-top">
                      <b>
                        {r.name}
                        {rulesUnverified(r.code) ? (
                          <>
                            {' '}
                            <Verify />
                          </>
                        ) : null}
                      </b>
                      <span className={`tag ${r.tone}`}>{r.tag}</span>
                    </div>
                    {[...new Set(r.why)].map((w) => (
                      <small key={w}>{w}</small>
                    ))}
                  </div>
                ))
              ) : (
                <p className="note">Primești tot ce se potrivește fermei tale.</p>
              )}
            </div>
          </section>
        )}
        <Simulator key={`${view.selected.id}:${view.selectedCrop}`} />
      </div>
      <p className="note gap">
        Calculat la {num(rate.value)} lei pentru un euro.{' '}
        {rate.confirmed ? 'E cursul BCE din 30 septembrie 2026. Anunțul APIA pentru curs e încă de verificat, așa că sumele în lei se pot schimba puțin.' : 'Cursul oficial pentru 2026 nu e verificat încă, așa că sumele în lei se pot schimba puțin.'}
      </p>{' '}
      <PageLink path="/calendar" href={href('/calendar')} className="btn btn-dark next-step">
        Mai departe: când vin banii
      </PageLink>
      <Sheet open={!!pay} onClose={() => setPayKey(null)} className="detail" label={pay ? pay.title : 'Plata'}>
        {pay && (
          <>
            <div className="top">
              <div>
                <h2 tabIndex={-1} autoFocus>
                  {pay.title + crumb}
                </h2>
              </div>
              <button type="button" className="x" aria-label="Închide" onClick={() => setPayKey(null)}>
                ×
              </button>
            </div>
            <div className="key-facts">
              <Tile label="Când" value={date(pay.event.end, true)} sub={payDays >= 0 ? `mai sunt ${zile(payDays)}` : ''} />
              <Tile label="Suma" value={t(`${exact(pay.value)} lei`)} sub={pay.range ? t(`între ${about(pay.range[0])} și ${about(pay.range[1])} lei`) : ''} />
            </div>
            {pay.unverified && (
              <p className="note gap">
                <Verify /> Verifică la instituție înainte să te bazezi pe această dată.
              </p>
            )}
            {pay.text.map((x) => (
              <p className="d-text" key={x}>
                {x}
              </p>
            ))}
            {pay.event.source_url && (
              <p className="note gap">
                <a href={pay.event.source_url} rel="noopener" target="_blank">
                  Vezi sursa
                </a>
              </p>
            )}
            <div className="acts">
              <PageLink path="/calendar" href={href('/calendar')} className="btn btn-line">
                Vezi în calendar
              </PageLink>
              <button type="button" className="btn btn-line" onClick={() => setPayKey(null)}>
                Închide
              </button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}

/* Whole farm: total hectares and which crops. One crop: only that crop's hectares change, and the rest stays put. */
function Simulator() {
  const view = useView('picked')!;
  const { text: t } = useMoney();
  const FARM = view.farm;
  const crop = view.crop;
  const data = view.data();
  const plan = view.farmPlan();
  const CROPS = data.crops.crops;
  const focus = crop ? crop.id : null;
  const cropWord = crop ? crop.name.toLowerCase() : '';
  const part = crop ? crop.share : (bani: number) => bani;
  const toAri = (p: { areaHa: number }) => Math.round(p.areaHa * 100);
  const farmParcels = FARM.parcels.map((p) => ({ cropId: p.cropId, areaHa: p.areaHa }));
  const otherParcels = focus ? farmParcels.filter((p) => p.cropId !== focus) : [];
  const OTHER_ARI = otherParcels.reduce((s, p) => s + toAri(p), 0);
  const FARM_ARI = farmParcels.reduce((s, p) => s + toAri(p), 0);
  const START_ARI = FARM_ARI - OTHER_ARI;
  const START_PICK = new Set(farmParcels.map((p) => p.cropId));
  const MAX_ARI = Math.ceil((Math.max(6000, Math.ceil(FARM_ARI / 100) * 100) - OTHER_ARI) / 100) * 100;
  /* The rules change at these farm sizes, seen from the hectares the slider moves. */
  const LIMITS = [1000, 5000].map((a) => a - OTHER_ARI).filter((a) => a >= 100);

  const [ari, setAri] = useState(START_ARI);
  const [picked, setPicked] = useState(() => new Set(START_PICK));
  const [numText, setNumText] = useState<string | null>(null);
  const { ref, w: W } = useWidth();

  const stored = { birth_year: +view.today.slice(0, 4) - FARM.age, parcels: FARM.parcels.map((p) => ({ crop_id: p.cropId, area_ari: Math.round(p.areaHa * 100), is_arable: true })) };
  const farmFor = (a: number, set: Set<string>) => {
    if (focus) return { age: FARM.age, parcels: [...otherParcels, { cropId: focus, areaHa: a / 100 }] };
    const ids = CROPS.map((c) => c.id).filter((id) => set.has(id));
    const share = Math.floor(a / ids.length);
    return { age: FARM.age, parcels: ids.map((cropId, i) => ({ cropId, areaHa: (i === 0 ? a - share * (ids.length - 1) : share) / 100 })) };
  };
  /* A crop's part goes by hectares, the way the rest of the app splits APIA money. */
  const partOf = (bani: number, a: number) => (focus ? Math.round((bani * a) / (a + OTHER_ARI)) : bani);

  /* The curve is kept per set of crops. The two extra points make each threshold a clean drop. */
  const curves = useRef(new Map<string, { ari: number; min: number; max: number; probable: number }[]>());
  const pickedKey = [...picked].sort().join();
  const pts = useMemo(() => {
    const had = curves.current.get(pickedKey);
    if (had) return had;
    const points = new Set(LIMITS.flatMap((a) => [a, a + 1]));
    for (let a = 100; a <= MAX_ARI; a += Math.ceil(MAX_ARI / 120 / 50) * 50) points.add(a);
    const made = [...points]
      .filter((a) => a <= MAX_ARI)
      .sort((a, b) => a - b)
      .map((a) => {
        const { min, max, probable } = computeSubsidies(farmFor(a, picked), data).totals.lei;
        return { ari: a, min: partOf(min, a), max: partOf(max, a), probable: partOf(probable, a) };
      });
    curves.current.set(pickedKey, made);
    return made;
  }, [pickedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const same = ari === START_ARI && picked.size === START_PICK.size && [...picked].every((id) => START_PICK.has(id));
  const w = whatIfSubsidy(plan, stored as never, data, { parcels: same ? farmParcels : farmFor(ari, picked).parcels })!;
  const { lost, gained } = w;
  const shown = !focus ? w.after.probable : same ? crop!.share(w.after.probable) : partOf(w.after.probable, ari);
  const delta = shown - part(w.before.probable);
  const sign = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
  /* Swapping one crop for another changes nothing, and that needs saying or the chips look broken. */
  const swapped = !focus && !same && ari === START_ARI && w.difference === 0;
  const schemeData = (code: string) => data.subsidies.schemes.find((s) => s.code === code);
  const flagged = (code: string) => (schemeData(code)?.eligibility?.rules ?? []).some((r: { status?: string }) => r.status === 'DE-VERIFICAT') || schemeData(code)?.status === 'DE-VERIFICAT';
  const nameOf = (code: string) => schemeData(code)?.name_ro ?? code;

  /* Drawn at real pixel size so labels stay legible on a phone. */
  const H = 240;
  const L = 2;
  const R = 8;
  const T = 22;
  const B = 28;
  const top = Math.max(...pts.map((p) => p.max));
  const x = (a: number) => L + ((a - 100) / (MAX_ARI - 100)) * (W - L - R);
  const y = (bani: number) => T + (1 - bani / top) * (H - T - B);
  const path = (key: 'min' | 'max' | 'probable') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.ari).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
  /* The first label gives way when a limit sits right beside it. */
  const crowded = LIMITS.some((a) => a !== 100 && a - 100 < MAX_ARI * 0.08);
  const ticks = [...new Set([...(crowded ? [] : [100]), ...LIMITS, ...(focus ? [] : [3000]), MAX_ARI])].sort((a, b) => a - b);
  const chartText = focus ? `Partea pentru ${cropWord}, de la 1 la ${MAX_ARI / 100} de hectare. Scade brusc când ferma trece de 10 ha și de 50 ha.` : `Subvenția estimată de la 1 la ${MAX_ARI / 100} de hectare. Scade brusc peste 10 ha și peste 50 ha.`;

  const PRESETS = [...new Set([...LIMITS.flatMap((a) => [a, a + 1]), START_ARI])].sort((a, b) => a - b);
  const toggle = (id: string) => {
    if (picked.has(id) && picked.size === 1) return; /* At least one crop has to stay. */
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  };

  return (
    <section className="card s12">
      <div className="card-h">
        <h2>Ce s-ar schimba dacă...</h2>
        <span>Doar o simulare</span>
      </div>
      <p className="note">{focus ? `Celelalte culturi rămân la fel. APIA plătește o singură sumă pentru toată ferma, așa că aici vezi partea pentru ${cropWord}, după hectare.` : 'Unele schimbări mici pot costa mult, pentru că regulile se schimbă la anumite praguri.'}</p>
      <div className="sim">
        <div>
          <label htmlFor="ha-num">{focus ? `Câte hectare de ${cropWord} ai lucra` : 'Câte hectare ai lucra'}</label>{' '}
          <div className="ha-row">
            <input
              type="range"
              min="1"
              max={MAX_ARI / 100}
              step="1"
              aria-label="Hectare"
              value={Math.round(ari / 100)}
              onChange={(e) => {
                setAri(+e.target.value * 100);
                setNumText(null);
              }}
            />{' '}
            <input
              type="number"
              id="ha-num"
              min="1"
              max={MAX_ARI / 100}
              step="0.01"
              inputMode="decimal"
              value={numText ?? ari / 100}
              onBlur={() => setNumText(null)}
              onChange={(e) => {
                setNumText(e.target.value);
                const v = Math.round(parseFloat(e.target.value.replace(',', '.')) * 100);
                if (v >= 100 && v <= MAX_ARI) setAri(v);
              }}
            />
          </div>
          <div className="chips">
            {PRESETS.map((a) => (
              <button
                key={a}
                type="button"
                className="chip"
                aria-pressed={a === ari}
                onClick={() => {
                  setAri(a);
                  setNumText(null);
                }}
              >
                {ha(a)} ha{a === START_ARI ? ', azi' : ''}
              </button>
            ))}
          </div>
          {!focus && (
            <>
              <p className="lab">Ce culturi ai pune</p>
              <div className="chips">
                {CROPS.map((c) => (
                  <button key={c.id} type="button" className="chip" aria-pressed={picked.has(c.id)} aria-disabled={picked.has(c.id) && picked.size === 1} onClick={() => toggle(c.id)}>
                    {c.name_ro}
                    {START_PICK.has(c.id) ? ', azi' : ''}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="res" aria-live="polite">
            <p className="big">{t(`${about(shown)} lei`)}</p>
            <p className={`delta ${sign}`}>{same ? (focus ? `Asta e partea pentru ${cropWord} de azi` : 'Asta e ferma ta de azi') : delta === 0 ? 'La fel ca azi' : t(`${delta > 0 ? '+' : '−'}${about(Math.abs(delta))} lei față de azi`)}</p>
            {focus && <p className="note">{t(`Toată ferma: ${about(w.after.probable)} lei`)}</p>}
            {swapped && <p className="note">Aceeași sumă. APIA plătește la fel pe hectar pentru aceste culturi.</p>}
            {(lost.length > 0 || gained.length > 0) && (
              <ul>
                {lost.map((s) => (
                  <li key={`l${s}`}>
                    Pierzi: {nameOf(s)}
                    {flagged(s) ? (
                      <>
                        {' '}
                        <Verify />
                      </>
                    ) : null}
                  </li>
                ))}
                {gained.map((s) => (
                  <li key={`g${s}`}>
                    Câștigi: {nameOf(s)}
                    {flagged(s) ? (
                      <>
                        {' '}
                        <Verify />
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="step-chart" ref={ref}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t(`${chartText} Pentru ${ha(ari)} ha sunt ${about(shown)} lei.`)}>
            <text className="c-lab" x={L} y="12">
              {t(`${focus ? `Partea pentru ${cropWord}` : 'Subvenția'}, ${about(top)} lei în vârf`)}
            </text>
            <line className="c-base" x1={L} x2={W - R} y1={H - B} y2={H - B} />
            <path className="c-alt" d={path('max')} />
            <path className="c-alt" d={path('min')} />
            <path className="c-line" d={path('probable')} />
            <circle className="c-dot" r="6" cx={x(ari).toFixed(1)} cy={y(shown).toFixed(1)} />
            {ticks.map((a) => (
              <text key={a} className={`c-lab${LIMITS.includes(a) ? ' on' : ''}`} x={x(a).toFixed(1)} y={H - 8} textAnchor={a === ticks[0] ? 'start' : a === MAX_ARI ? 'end' : 'middle'}>
                {ha(a)} ha
              </text>
            ))}
          </svg>
        </div>
      </div>
    </section>
  );
}

