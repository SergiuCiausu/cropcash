'use client';
/* Onboarding in three steps: who and where, what's grown (the APIA paper can fill it in), and the money
   there is now (was web/legacy/onboarding.js). What was gathered and what's sown are asked on Recolte,
   linked from the result. The sidebar lists the steps and fills in the farm as it's typed.
   Everything is calculated on the phone. Onboarding needs an account, and the farm goes to the
   server, so the last step needs internet. What's typed stays on the phone until it's saved, and the
   phone's Back moves between the steps. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { computeSubsidies, withApiaDecision } from '../../../packages/shared/src/subsidies/index';
import { isOwnCrop, OnboardingInputSchema } from '../../../packages/shared/src/farm/index';
import { MAX_LANDOWNERS } from '../../../packages/shared/src/arenda/contracts';
import { mergePaperHa } from '../../../packages/shared/src/documents/index';
import type { PaperReading } from '../../lib/cc/store';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import { isFallow } from '../../../packages/shared/src/data/schemas';
import { salaryBreakdown } from '../../../packages/shared/src/functions/explain';
import { about, date, exact, failText, group } from '../../lib/cc/format';
import { ionFarm } from '../../lib/cc/farm';
import type { FarmState } from '../../lib/cc/farm';
import { FarmProvider, useFarm, useMoney, useOnline, useStore, useView } from '../../lib/cc/react';
import * as Live from '../../lib/live/index';
import { onboardingHarvests } from '../../lib/live/farm';
import { appHref, storageKey } from '../../lib/paths';
import { monthName } from '../../lib/ui/chart';
import { nextMoneyIn } from '../../lib/ui/next-money';
import { AmountEcho, Icon } from '../app/bits';
import { newIntentKey } from '../../lib/live/intent';
import '../../styles/onboarding-mode.css';
import { FlowFrame } from '../app/FlowFrame';
import FlowSkeleton from '../skeleton/FlowSkeleton';
import { PaperButton, PapersProvider, usePapers } from '../app/Papers';
import { CropSearch } from '../app/CropSearch';
import type { CatalogueCrop } from '../../../packages/shared/src/data/catalogue';

const STEPS = [
  { label: 'Despre tine', short: 'Tu', icon: 'home' as const },
  { label: 'Culturile', short: 'Culturi', icon: 'sprout' as const },
  { label: 'Oamenii', short: 'Oameni', icon: 'people' as const },
  { label: 'Banii de acum', short: 'Bani', icon: 'sack' as const },
];
const CROPS = 1;
const PEOPLE = 2;
const MONEY = 3;
const RESULT = 4;
type Field = 'mode' | 'name' | 'age' | 'county' | 'crops' | 'leasedIn' | 'leasedOut' | 'owners' | 'people' | 'money' | 'form';
type FarmMode = 'own' | 'arendas';
/** „Cum lucrezi pământul?” (docs/employees-arenda-plan.md §2.1). Both answers have people who do the work. */
const MODES: [FarmMode, string, string][] = [
  ['own', 'Pământul e al meu', 'Am oameni care îl lucrează.'],
  ['arendas', 'Iau pământ în arendă', 'Am oameni care fac munca.'],
];
/** A person typed on the people step. `key` is the phone's id for them, so a retry can't add them twice. */
interface QuickPerson {
  key: string;
  name: string;
  cost: string;
}
/** The fields a cerere de plată can fill in, tagged "din cerere" until the farmer changes them. */
type PaperField = 'name' | 'age' | 'county';

const num = (v: string) => parseFloat(String(v).replace(',', '.'));
const roundHa = (v: number) => Math.round(Math.max(0, v) * 100) / 100;
const haText = (v: number) => String(v).replace('.', ',');
/** An optional hectares field: undefined when empty, null when it isn't a number. */
/** „De la câți proprietari?”: empty is undefined, a bad number is null. */
const ownerCount = (v: string): number | undefined | null => {
  const t = v.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= MAX_LANDOWNERS ? n : null;
};

const optionalHa = (v: string): number | undefined | null => {
  if (!v.trim()) return undefined;
  const n = num(v);
  return Number.isFinite(n) && n >= 0 ? roundHa(n) : null;
};
/** ["a", "b", "c"] -> "a, b și c". */
const andList = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} și ${items.at(-1)}`);
const CERERE_PAGES = 'Cel mai bine e PDF-ul cererii, descărcat din contul tău APIA: are toate parcelele. Dacă faci poze, fă la prima pagină, cea cu numele, și la paginile cu tabelul de parcele (II.A).';

const HOME = '/acasa';
const DRAFT = storageKey('cropcash-onboarding-draft', 'farm');
interface Form {
  i: number;
  name: string;
  age: string;
  county: string;
  ha: Record<string, number>;
  money: string;
  decisionBani: number | null;
  fromPaper: PaperField[];
  /** The names on the cerere, for the farmer to pick from. */
  names: string[];
  paperNote: string;
  farmMode: FarmMode | '';
  leasedIn: string;
  leasedOut: string;
  /** „De la câți proprietari?” (migration 033). */
  owners: string;
  people: QuickPerson[];
  fieldWork: boolean | null;
}

/** What the form opens with: the saved farm when there is one, otherwise nothing. */
function savedForm(farm: FarmState, cropIds: string[]): Form {
  const me = farm.me;
  const area = new Map((me?.parcels ?? []).map((p) => [p.crop_id, p.area_ari / 100]));
  return {
    i: 0,
    name: me?.name ?? '',
    age: me && farm.baseFarm ? String(farm.baseFarm.age) : '',
    county: me?.county ?? '',
    ha: Object.fromEntries(cropIds.map((id) => [id, area.get(id) ?? 0])),
    money: me ? group(Math.round(me.start_balance_bani / 100)) : '',
    decisionBani: null,
    fromPaper: [],
    names: [],
    paperNote: '',
    /* A saved farm is 'own' until the farmer says otherwise (migration 032); a new one picks. */
    farmMode: me ? (me.farm_mode ?? 'own') : '',
    leasedIn: me?.leased_in_ari != null ? haText(me.leased_in_ari / 100) : '',
    leasedOut: me?.leased_out_ari != null ? haText(me.leased_out_ari / 100) : '',
    owners: me?.landowner_count ? String(me.landowner_count) : '',
    people: [],
    fieldWork: me?.own_field_work ?? null,
  };
}

/** Typing left unfinished, as long as the farm it started from hasn't changed since. */
function readDraft(seed: string): Form | null {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT) ?? 'null') as { seed: string; form: Form } | null;
    return draft?.seed === seed ? draft.form : null;
  } catch {
    return null;
  }
}
function writeDraft(seed: string, form: Form) {
  try {
    localStorage.setItem(DRAFT, JSON.stringify({ seed, form }));
  } catch {
    /* Blocked storage: the form still works, it just won't survive a reload. */
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT);
  } catch {
    /* Nothing was saved. */
  }
}

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
  const money_ = useMoney();
  const view = useView('farm');
  const [editing] = useState(!!me);
  const [opening] = useState(() => {
    const saved = savedForm(farm, crops.map((c) => c.id));
    const seed = JSON.stringify(saved);
    return { seed, form: readDraft(seed) ?? saved };
  });
  const [i, setI] = useState(() => {
    const onThisEntry = (history.state as { ccStep?: unknown } | null)?.ccStep;
    return Math.min(MONEY, typeof onThisEntry === 'number' ? onThisEntry : opening.form.i);
  });
  const [name, setName] = useState(opening.form.name);
  const [age, setAge] = useState(opening.form.age);
  const [county, setCounty] = useState(opening.form.county);
  const [ha, setHa] = useState<Record<string, number>>(opening.form.ha);
  const [haText_, setHaText] = useState<Record<string, string>>({});
  const [money, setMoney] = useState(opening.form.money);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [paperNote, setPaperNote] = useState(opening.form.paperNote ?? '');
  const [fromPaper, setFromPaper] = useState<PaperField[]>(opening.form.fromPaper ?? []);
  const [names, setNames] = useState<string[]>(opening.form.names ?? []);
  const [decisionBani, setDecisionBani] = useState<number | null>(opening.form.decisionBani);
  const [farmMode, setFarmMode] = useState<FarmMode | ''>(opening.form.farmMode ?? '');
  const [leasedIn, setLeasedIn] = useState(opening.form.leasedIn ?? '');
  const [leasedOut, setLeasedOut] = useState(opening.form.leasedOut ?? '');
  const [owners, setOwners] = useState(opening.form.owners ?? '');
  const [people, setPeople] = useState<QuickPerson[]>(opening.form.people ?? []);
  const [fieldWork, setFieldWork] = useState<boolean | null>(opening.form.fieldWork ?? null);
  const [saving, setSaving] = useState(false);
  /* Crops picked from the APIA list. The main crops always show; another one shows once picked or given hectares. */
  const [added, setAdded] = useState<string[]>(() => Object.keys(opening.form.ha).filter((id) => opening.form.ha[id] > 0));
  const [unpriced, setUnpriced] = useState<CatalogueCrop | null>(null);
  const h1 = useRef<HTMLHeadingElement>(null);
  const firstError = useRef<Field | null>(null);
  const finished = useRef(false);

  const sown = useMemo(() => new Map((me?.parcels ?? []).filter((p) => p.planted_month).map((p) => [p.crop_id, p.planted_month!])), [me]);
  /* The farmer's own crops are edited on Recolte, and an edit here keeps them. */
  const ownParcels = (me?.parcels ?? []).filter((p) => isOwnCrop(p.crop_id)).map((p) => ({ cropId: p.crop_id, areaHa: p.area_ari / 100, ...(sown.has(p.crop_id) ? { plantedMonth: sown.get(p.crop_id)! } : {}) }));
  const nameOf = (id: string) => app.crops.crops.find((c) => c.id === id)?.name_ro ?? id;
  const parcels = [...crops.filter((c) => ha[c.id] > 0).map((c) => ({ cropId: c.id, areaHa: ha[c.id], ...(sown.has(c.id) ? { plantedMonth: sown.get(c.id)! } : {}) })), ...ownParcels];
  const totalHa = parcels.reduce((s, p) => s + Math.round(p.areaHa * 100), 0) / 100;
  const cropNames = parcels.map((p) => nameOf(p.cropId).toLowerCase());
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

  /* What's typed outlives a reload or a closed tab, until the save. */
  useEffect(() => {
    if (!finished.current) writeDraft(opening.seed, { i, name, age, county, ha, money, decisionBani, fromPaper, names, paperNote, farmMode, leasedIn, leasedOut, owners, people, fieldWork });
  }, [opening.seed, i, name, age, county, ha, money, decisionBani, fromPaper, names, paperNote, farmMode, leasedIn, leasedOut, owners, people, fieldWork]);

  const show = (n: number) => {
    setI(n);
    setErrors({});
    scrollTo(0, 0);
  };
  /* One history entry per step, so the phone's Back goes one step back and doesn't leave the form. */
  useEffect(() => {
    const state = history.state as { ccStep?: number; ccFrom?: number } | null;
    /* A reload of the last page: the farm is saved, so there's nothing left to fill in. */
    if (state?.ccStep === RESULT) return location.replace(HOME);
    history.replaceState({ ...state, ccStep: i, ccFrom: state?.ccFrom ?? i }, '');
    const onPop = () => {
      if (finished.current) return location.replace(HOME);
      const step = (history.state as { ccStep?: unknown } | null)?.ccStep;
      if (typeof step === 'number') show(step);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (n: number) => {
    if (n > i) history.pushState({ ...history.state, ccStep: n }, '');
    else if (n < i) {
      const first = (history.state as { ccFrom?: number } | null)?.ccFrom ?? 0;
      if (n >= first) history.go(n - i);
      else history.replaceState({ ...history.state, ccStep: n, ccFrom: n }, '');
    }
    show(n);
  };
  const fail = (e: Partial<Record<Field, string>>) => {
    firstError.current = Object.keys(e)[0] as Field;
    setErrors(e);
  };
  const clearError = (f: Field) => errors[f] && setErrors(({ [f]: _, ...rest }) => rest);

  const CHECK = [
    () => {
      const e: Partial<Record<Field, string>> = {};
      if (!farmMode) e.mode = 'Alege cum lucrezi pământul.';
      if (!name.trim()) e.name = 'Scrie-ți numele.';
      const a = +age;
      if (!(age !== '' && Number.isInteger(a) && a >= 16 && a <= 100)) e.age = 'Scrie vârsta ca număr, de la 16 la 100.';
      if (!county) e.county = 'Alege județul din listă.';
      return Object.keys(e).length ? e : null;
    },
    () => {
      if (!parcels.length) return { crops: 'Scrie hectarele pentru cel puțin o cultură.' };
      const e: Partial<Record<Field, string>> = {};
      const inHa = optionalHa(leasedIn);
      if (inHa === null) e.leasedIn = 'Scrie hectarele ca număr, de exemplu 120 sau 12,5.';
      else if (inHa !== undefined && inHa > totalHa) e.leasedIn = `Ai ${haText(totalHa)} ha în total, deci în arendă pot fi cel mult atât.`;
      if (optionalHa(leasedOut) === null) e.leasedOut = 'Scrie hectarele ca număr, de exemplu 30.';
      if (ownerCount(owners) === null) e.owners = 'Scrie câți proprietari ai, ca număr întreg, de exemplu 40.';
      return Object.keys(e).length ? e : null;
    },
    () => {
      const typed = people.filter((p) => p.name.trim() || p.cost.trim());
      const bad = typed.find((p) => !p.name.trim() || !(parseWholeLei(p.cost) ?? 0));
      if (!bad) return null;
      return { people: bad.name.trim() ? `Scrie cât te costă ${bad.name.trim()} pe lună, în lei întregi.` : 'Scrie numele fiecărui om.' };
    },
    () => {
      const v = money.trim() === '' && !editing ? 0 : parseWholeLei(money);
      return v !== null && v <= 100000000 ? null : { money: `Scrie suma ca număr, de exemplu ${group(ionFarm(app).startBalanceBani / 100)}.` };
    },
  ];

  /* A farm that already exists is edited. What Recolte already holds (gathered grain, other years) is kept. */
  async function save(m: string): Promise<string | null> {
    const inHa = optionalHa(leasedIn);
    const outHa = optionalHa(leasedOut);
    const parsed = OnboardingInputSchema.safeParse({
      name,
      county,
      age: +age,
      startBalanceLei: m.trim() === '' ? 0 : parseWholeLei(m),
      parcels,
      ...(farmMode ? { farmMode } : {}),
      ...(inHa != null ? { leasedInHa: inHa } : {}),
      ...(outHa != null ? { leasedOutHa: outHa } : {}),
    });
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
        /* The people, each with the phone's id, so saving again after a lost answer doesn't add them twice. */
        for (const p of people.filter((x) => x.name.trim())) {
          await write('add_employee', { name: p.name.trim(), kind: 'permanent', costLei: parseWholeLei(p.cost)!, payBasis: 'month', startsOn: farm.today, clientId: p.key });
        }
        if (fieldWork !== null && fieldWork !== (me?.own_field_work ?? null)) await write('set_own_field_work', { ownFieldWork: fieldWork });
        const count = ownerCount(owners);
        if (count !== null && count !== undefined && count !== (me?.landowner_count ?? null)) await write('set_landowner_count', { count });
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
      finished.current = true;
      clearDraft();
    }
    go(i + 1);
  }

  /* A cerere fills in everything it can, and the farmer checks it on the steps. The name the farmer already
     typed stays: the names on the paper are offered next to it. The hectares are merged: what the paper
     lists wins, what it doesn't list stays, and the note says every change. */
  function applyCerere(r: PaperReading) {
    const a = r.applicant;
    const filled: PaperField[] = [];
    const choices = [...new Set([a?.firstName, a?.fullName].filter((n): n is string => !!n))];
    setNames(choices);
    if (choices[0] && !name.trim()) {
      setName(choices[0]);
      filled.push('name');
    }
    if (a?.age) {
      setAge(String(a.age));
      filled.push('age');
    }
    if (a?.county) {
      setCounty(a.county);
      filled.push('county');
    }
    setFromPaper(filled);
    setErrors({});

    const merge = mergePaperHa(Object.fromEntries(crops.map((c) => [c.id, Math.round(ha[c.id] * 100)])), r.parcels);
    setHa(Object.fromEntries(Object.entries(merge.next).map(([id, ari]) => [id, ari / 100])));
    setAdded((a) => [...new Set([...a, ...Object.keys(merge.next).filter((id) => merge.next[id] > 0)])]);
    setHaText({});
    if (merge.added.length || merge.changed.length) clearError('crops');

    const crop = (id: string) => nameOf(id).toLowerCase();
    const notes: string[] = [];
    const missing = [!a?.firstName && !name.trim() && 'numele', !a?.age && 'vârsta', !a?.county && 'județul'].filter((m): m is string => !!m);
    notes.push(filled.length || r.parcels.length ? 'Am completat de pe cerere. Verifică ce e scris.' : 'Nu am găsit date pe cerere. Completează tu mai jos.');
    if (missing.length && (filled.length || r.parcels.length)) notes.push(`Nu am găsit ${andList(missing)}. Scrie tu.`);
    if (r.year && r.year !== year) notes.push(`E cererea din ${r.year}. Dacă anul ăsta ai alte culturi, schimbă hectarele la pasul 2.`);
    if (merge.added.length) notes.push(`Am adăugat ${andList(merge.added.map((p) => `${crop(p.cropId)} (${haText(p.areaAri / 100)} ha)`))}.`);
    for (const p of merge.changed) notes.push(`Am schimbat ${crop(p.cropId)}: ${haText(p.fromAri / 100)} → ${haText(p.toAri / 100)} ha.`);
    if (merge.kept.length) notes.push(`Nu apar pe cerere, așa că nu le-am schimbat: ${andList(merge.kept.map((id) => `${crop(id)} (${haText((merge.next[id] ?? 0) / 100)} ha)`))}.`);
    if (r.unknownCrops.length) notes.push(`Nu am recunoscut: ${r.unknownCrops.join(', ')}.`);
    /* Unknown crops explain a smaller sum, so only a sum over the total or a gap with nothing unknown is suspicious. */
    const sum = r.parcels.reduce((s, p) => s + p.areaAri, 0);
    if (r.totalAri && sum && (sum > r.totalAri || (sum < r.totalAri && !r.unknownCrops.length)))
      notes.push(`Pe cerere scrie ${haText(r.totalAri / 100)} ha în total, iar noi am găsit ${haText(sum / 100)} ha. Poate lipsește o pagină.`);
    setPaperNote(notes.join(' '));
  }

  async function readCerere() {
    const r = await papers.pick({
      accepts: ['apia_cerere'],
      pages: true,
      hint: CERERE_PAGES,
      seen: { apia_decizie: 'Asta e decizia de plată. Aici ne trebuie cererea. Decizia o poți pune la pasul 2.' },
    });
    if (r) applyCerere(r);
  }

  /* The crops step takes either paper: the cerere as on step 1, the decision for the exact amount. */
  async function readPaper() {
    const r = await papers.pick({ accepts: ['apia_cerere', 'apia_decizie'], pages: true, hint: CERERE_PAGES });
    if (!r) return;
    if (r.kind === 'apia_cerere') return applyCerere(r);
    setPaperNote('Decizia nu are hectarele. Scrie-le tu mai jos.');
    setDecisionBani((await papers.confirmDecision(r)) ?? null);
  }

  /* A field the farmer changes is theirs, not the paper's. */
  const untag = (f: PaperField) => fromPaper.includes(f) && setFromPaper((p) => p.filter((x) => x !== f));
  const tag = (f: PaperField) => (fromPaper.includes(f) ? <span className="tag ok">din cerere</span> : null);

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
        {editing ? heading('Schimbă datele fermei', 'Verifică ce e scris și schimbă ce nu mai e bine.') : heading('Hai să-ți vedem banii', 'Îți arătăm cât primești, când vin banii și cât poți cheltui pe lună, după ce îi plătești pe oameni. Sunt patru pași.')}
        <section className="card ob-mode-card">
          <fieldset className="ob-mode">
            <legend>
              <h2>Cum lucrezi pământul?</h2>
            </legend>
            <div className="ob-modes">
              {MODES.map(([m, title, sub], n) => (
                <button
                  type="button"
                  key={m}
                  id={n === 0 ? 'mode' : undefined}
                  className="ob-mode-opt"
                  aria-pressed={farmMode === m}
                  {...(errors.mode ? { 'aria-describedby': 'err-mode' } : {})}
                  onClick={() => (setFarmMode(m), clearError('mode'))}
                >
                  <b>{title}</b>
                  <small>{sub}</small>
                </button>
              ))}
            </div>
            <p className="note">Dacă ai din amândouă, alege ce e mai mult. Poți schimba oricând.</p>
            {err('mode')}
          </fieldset>
        </section>
        <section className="card ob-paper-card gap">
          <div className="card-h">
            <h2>Ai cererea de plată de la APIA?</h2>
          </div>
          <p className="note" aria-live="polite">
            {paperNote || 'O citim și completăm noi numele, vârsta, județul și hectarele. Tu doar verifici.'}
          </p>
          <div className="ob-paper">
            <PaperButton label="Încarcă cererea" onClick={() => void readCerere()} />
          </div>
        </section>
        <section className="card gap">
          <h2>Despre tine</h2>
          <label className="ob-field">
            Cum te cheamă? {tag('name')}
            <input id="name" value={name} autoComplete="given-name" {...invalid('name')} onChange={(e) => (setName(e.target.value), clearError('name'), untag('name'))} />
          </label>
          {names.length > 0 && (names.length > 1 || names[0] !== name) && (
            <div className="ob-names" role="group" aria-label="Numele de pe cerere">
              {names.map((n) => (
                <button type="button" className="chipb" key={n} aria-pressed={n === name} onClick={() => (setName(n), clearError('name'), setFromPaper((p) => (p.includes('name') ? p : [...p, 'name'])))}>
                  {n}
                </button>
              ))}
            </div>
          )}
          {err('name')}
          <label className="ob-field">
            Câți ani ai? {tag('age')}
            <input id="age" value={age} inputMode="numeric" {...invalid('age')} onChange={(e) => (setAge(e.target.value.trim()), clearError('age'), untag('age'))} />
          </label>
          {err('age')}
          <label className="ob-field">
            În ce județ e ferma? {tag('county')}
            <select id="county" value={county} {...invalid('county')} onChange={(e) => (setCounty(e.target.value), clearError('county'), untag('county'))}>
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
          {crops.filter((c) => !c.family || added.includes(c.id)).map((c) => (
            <div className="ob-crop" key={c.id}>
              <b>
                {c.name_ro}
                {c.apia_codes?.[0] !== undefined && <small>cod APIA {c.apia_codes[0]}</small>}
              </b>
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
          <CropSearch
            catalogue={app.catalogue}
            exclude={crops.filter((c) => !c.family || added.includes(c.id)).map((c) => c.id)}
            onPick={(c) => {
              if (c.priced) {
                setAdded((a) => [...a, c.id]);
                setUnpriced(null);
              } else setUnpriced(c);
            }}
          />
          {unpriced && (
            <p className="note gap" role="status">
              Pentru {unpriced.name_ro} (cod APIA {unpriced.code}) nu avem încă costuri și prețuri. După ce salvezi ferma, o adaugi în Recolte cu cifrele tale.
            </p>
          )}
          {err('crops')}
          {crops.some((c) => isFallow(c)) && <p className="note gap">Teren necultivat e pământul lăsat nesemănat anul ăsta, la odihnă. Și pe el primești subvenție.</p>}
          {ownParcels.length > 0 && <p className="note gap">Păstrăm și {ownParcels.map((p) => `${nameOf(p.cropId)} (${haText(p.areaHa)} ha)`).join(', ')}. Le schimbi din Recolte.</p>}
        </section>
        <section className="card gap">
          <h2>Pământ în arendă</h2>
          <p className="note">Cererea APIA nu spune ce pământ e în arendă, așa că te întrebăm. Dacă nu știi exact, scrie cât crezi.</p>
          <label className="ob-field">
            Din hectarele de mai sus, câte sunt luate în arendă?
            <input id="leasedIn" value={leasedIn} inputMode="decimal" {...invalid('leasedIn')} onChange={(e) => (setLeasedIn(e.target.value), clearError('leasedIn'))} />
          </label>
          {err('leasedIn')}
          <label className="ob-field">
            Ai pământ al tău dat în arendă altcuiva? Câte hectare?
            <input id="leasedOut" value={leasedOut} inputMode="decimal" placeholder="0" {...invalid('leasedOut')} onChange={(e) => (setLeasedOut(e.target.value), clearError('leasedOut'))} />
          </label>
          {err('leasedOut')}
          {(farmMode === 'arendas' || (optionalHa(leasedIn) ?? 0) > 0) && (
            <>
              <label className="ob-field">
                De la câți proprietari? <small>(cam câți)</small>
                <input id="owners" value={owners} inputMode="numeric" {...invalid('owners')} onChange={(e) => (setOwners(e.target.value), clearError('owners'))} />
              </label>
              {err('owners')}
            </>
          )}
          <p className="note">Proprietarii, contractele și parcelele le treci apoi în Arendă.</p>
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
  else if (i === PEOPLE) {
    const saved = (me?.employees ?? []).filter((e) => !e.archived_at);
    const setPerson = (key: string, patch: Partial<QuickPerson>) => (setPeople((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p))), clearError('people'));
    body = (
      <>
        {heading('Cine lucrează la fermă?', 'Scrie oamenii pe care îi plătești și cât te costă fiecare pe lună, tot cu taxe. Salariile lor intră în plan înaintea salariului tău.')}
        <section className="card">
          <h2>Oamenii tăi</h2>
          {saved.length > 0 && (
            <p className="note">
              Ai deja {saved.length === 1 ? 'un om' : `${saved.length} oameni`} în listă: {andList(saved.map((e) => e.name))}. Îi schimbi din Oameni. Aici poți adăuga alții.
            </p>
          )}
          {people.map((p, n) => (
            <div className="ob-person" key={p.key}>
              <label className="ob-field">
                Numele
                <input id={n === 0 ? 'people' : undefined} value={p.name} maxLength={80} autoComplete="off" {...(n === 0 ? invalid('people') : {})} onChange={(e) => setPerson(p.key, { name: e.target.value })} />
              </label>
              <label className="ob-field">
                Cât te costă pe lună, în lei
                <input value={p.cost} inputMode="numeric" autoComplete="off" onChange={(e) => setPerson(p.key, { cost: e.target.value })} />
                <AmountEcho text={p.cost} />
              </label>
              <button type="button" className="btn btn-line ob-person-x" aria-label={`Scoate ${p.name.trim() || 'rândul'}`} onClick={() => setPeople((ps) => ps.filter((x) => x.key !== p.key))}>
                Scoate
              </button>
            </div>
          ))}
          {err('people')}
          <div className="ob-actions">
            <button type="button" className="btn btn-line" onClick={() => setPeople((ps) => [...ps, { key: newIntentKey(), name: '', cost: '' }])}>
              <Icon name="plus" /> {people.length || saved.length ? 'Mai adaug un om' : 'Adaugă un om'}
            </button>
          </div>
          <p className="note">Zilierii și sezonierii, cu zilele și lunile lor, îi adaugi din Oameni. Contabilul face actele; aici e doar cât te costă.</p>
        </section>
        <section className="card gap">
          <fieldset className="ob-mode">
            <legend>
              <h2>Lucrările pe câmp le fac oamenii tăi?</h2>
            </legend>
            <p className="note">Arat, semănat, recoltat. Dacă da, costul pe hectar îl scrii pe al tău, ca munca lor să nu fie socotită de două ori.</p>
            <div className="chips">
              {(
                [
                  [true, 'Da'],
                  [false, 'Nu, plătesc pe altcineva'],
                ] as const
              ).map(([v, label]) => (
                <button key={label} type="button" className="chip" aria-pressed={fieldWork === v} onClick={() => setFieldWork(fieldWork === v ? null : v)}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </section>
        {actions(
          <>
            {back}
            <button type="submit" className="btn btn-dark">
              {people.some((p) => p.name.trim()) || fieldWork !== null ? 'Mai departe' : 'Sar peste'}
            </button>
          </>,
        )}
      </>
    );
  } else if (i === MONEY)
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
            {!editing && (
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
            )}
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
    /* The salary is the promise of the app, so it comes first. It waits for the farm saved a moment ago. */
    const lei = (bani: number) => money_.text(`${exact(bani)} lei`);
    let result: { salary: number; line: string; short: boolean } | null = null;
    try {
      if (view && !view.closed) {
        const plan = view.farmPlan();
        const { deficit, limitingMonth } = salaryBreakdown(plan, 'medium', view.data());
        const coming = nextMoneyIn(view);
        const line = deficit ? `În ${monthName(limitingMonth!)} banii nu ajung.` : coming ? `Următorii bani: ${lei(coming.value)}, pe ${date(coming.date).replace(/[.]$/, '')}.` : '';
        result = { salary: plan.monthlySalary, line, short: !!deficit };
      }
    } catch {
      result = null;
    }
    body = (
      <>
        {heading(editing ? 'Am salvat ferma' : 'Ferma ta e gata', `${editing ? 'Recolta' : 'Am creat Recolta'} ${farm.baseYear}${editing ? ' are acum' : ' cu'} ${haText(totalHa)} ha de ${cropNames.join(' și ')}.`)}
        {result && (
          <section className="chart-card field hero-card">
            <p className="eyebrow">Salariul tău</p>
            <p className="amount">{lei(result.salary)} pe lună</p>
            {result.line && <p className="range">{result.line}</p>}
            {result.short && (
              <p className="range">
                <a href={appHref('/prognoza', 'farm')}>Vezi ce poți face</a>
              </p>
            )}
          </section>
        )}
        <section className={result ? 'card gap' : 'chart-card field hero-card'}>
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
        <div className="ob-actions">
          <a className="btn btn-dark" href={HOME}>
            Mergi la ferma ta
          </a>
        </div>
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
