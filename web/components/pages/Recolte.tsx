'use client';
/* "Recolte": what was gathered, what's in the ground and what was noted, for the chosen project (was
   web/legacy/recolte.js). The harvest button at the top switches project. A closed project shows its
   result instead. On Ion's farm everything stays on the phone. On a real farm a sale or expense goes
   through the outbox, so it works offline; changing crops or closing a harvest needs internet.
   Nothing noted here moves money, it only records what already happened. */
import { useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isOwnCrop, linkOwnCrop, OwnCropSchema, ownCropMatches, type OwnCrop } from '../../../packages/shared/src/farm/index';
import type { CatalogueCrop } from '../../../packages/shared/src/data/catalogue';
import { CropSearch } from '../app/CropSearch';
import { isFallow } from '../../../packages/shared/src/data/schemas';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import { date, exact, failText, group, MONTHS } from '../../lib/cc/format';
import { harvestMonth, harvestName, projectClosed, type Harvest, type HarvestParcel, type HarvestState } from '../../lib/cc/harvests';
import { reopenProject } from '../../lib/cc/plan';
import { RECORD_BASIS_KEY, flipText, leiPerHaFrom, loadBasis, saveBasis, tPerHaFrom, tonnesFrom, totalBaniFrom, type Basis } from '../../lib/cc/basis';
import { browserStore, pageKeys, readJson, writeJson } from '../../lib/cc/storage';
import { storageKey } from '../../lib/paths';
import { useFarm, useMoney, useOnline, useStore, useView } from '../../lib/cc/react';
import { newIntentKey } from '../../lib/live/intent';
import { decimalText, gatheredHint, isSown, isUsualMonth, monthLabel, plantedHint, readGathered, sowingChoices, usualPlanting, usualTonnes, type Crop, type GatheredText } from '../../lib/ui/seasons';
import { AmountEcho, ErrorLine, OfflineNote, Sheet } from '../app/bits';
import { FrameContext } from '../app/context';
import { CostPerHa } from '../app/CostPerHa';
import { BasisEcho, BasisSwitch } from '../app/Basis';
import { useSaved } from '../app/useSaved';
import { CompareTable, FutureNote } from '../app/PageNotes';
import { PaperButton, usePapers } from '../app/Papers';
import { EXPENSE_LABELS, expenseLabel } from '../../lib/ui/categories';
import { SowingFields, readSowingDraft, sowingDraft, sowingSummary, type SowingDraft } from '../app/SowingFields';
import type { Sowing } from '../../../packages/shared/src/farm/index';
import { expenseCategory } from '../../../packages/shared/src/farm/plan-inputs';
import { EventSheet } from '../app/EventSheet';
import { litresToCl } from '../../../packages/shared/src/reports/fuel';
import { LossFields } from '../app/LossFields';
import { OwnCostCard } from '../app/OwnCostCard';
import { lossText, readLoss, type LossText } from '../../lib/ui/loss';
import { plotsForCrop } from '../../../packages/shared/src/plots/index';
import { usePlots } from '../plots/usePlots';
import { plotName } from '../plots/plot-text';
import { NEW_TREATMENT, TreatmentWork, treatmentInput, type TreatmentWorkValue } from '../plots/TreatmentWork';

const CATEGORIES: [string, string][] = EXPENSE_LABELS;
const APIA: [string, string][] = [
  ['apia_advance', 'Avansul APIA'],
  ['apia_balance', 'Restul de la APIA'],
];
const KINDS: ['sale' | 'expense', string][] = [
  ['sale', 'Vânzare'],
  ['expense', 'Cheltuială'],
];
const MONTH_WORDS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const LATEST = 5;
const MAX_OWN_CROPS = 20;

const haText = (v: number) => String(v).replace('.', ',');
const totalHa = (parcels: { areaHa: number }[]) => parcels.reduce((s, p) => s + Math.round(p.areaHa * 100), 0) / 100;
const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} și ${names[names.length - 1]}`);
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const decimalOrNull = (text: string) => {
  const t = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};
const leiOrNull = (text: string) => (text.trim() === '' ? 0 : parseWholeLei(text));
/** Litres as typed ("120,5"): empty is null, anything that isn't a sensible amount is undefined. */
function litresFrom(text: string): number | null | undefined {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  const n = Number(t);
  return n > 0 && n <= 100_000 ? n : undefined;
}

function newOwnId(name: string) {
  const slug = plain(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'cultura';
  return `own-${slug}-${Date.now().toString(36)}`;
}

/** Writes what the farmer said about a crop's lost hectares on a draft. Unknown takes the answer away. */
function writeLoss(h: Harvest, cropId: string, lost: ReturnType<typeof readLoss>) {
  const p = h.parcels.find((x) => x.cropId === cropId);
  if (!p || lost.kind === 'error') return;
  if (lost.kind === 'ok') p.lost = lost.lost;
  else delete p.lost;
}

/** Reads one loss field per crop; the first wrong one stops the save. */
function readLosses(rows: { cropId: string; name: string; areaHa: number; text: LossText; month?: string }[]) {
  const out: { cropId: string; lost: ReturnType<typeof readLoss> }[] = [];
  for (const r of rows) {
    const lost = readLoss(r.text, r.areaHa, r.name, r.month);
    if (lost.kind === 'error') return { error: lost.text };
    out.push({ cropId: r.cropId, lost });
  }
  return { rows: out };
}

function CropRow({ name, detail, tag, tone }: { name: string; detail: string; tag: string; tone: string }) {
  return (
    <div className="h-crop">
      <b>{name}</b>
      <small>{detail}</small>
      <span className={`tag ${tone}`}>{tag}</span>
    </div>
  );
}

/**
 * A crop the farmer typed in before the APIA list was in the app, now found on it (docs/crops-catalog-plan.md,
 * step 11). Asked once per crop: linking keeps the id and the farmer's figures and takes APIA's name and code;
 * „Nu” is remembered on the phone. One crop at a time.
 */
function OwnMatchCard({ save }: { save: Saver }) {
  const view = useView('picked')!;
  const { mode } = useContext(FrameContext);
  const key = pageKeys(mode).ownMatchSeen;
  const [seen, setSeen] = useState<string[]>(() => readJson<string[]>(browserStore(), key) ?? []);
  const [err, setErr] = useState<string | null>(null);
  const own = view.harvests.ownCrops;
  const catalogue = view.data().catalogue;
  const linked = own.flatMap((o) => (o.apiaCode ? [catalogue.find((l) => l.code === o.apiaCode)?.id ?? ''] : []));
  const onFarm = view.harvests.items.flatMap((h) => h.parcels.map((p) => p.cropId));
  const offer = own
    .filter((o) => !seen.includes(o.id))
    .map((o) => ({ crop: o, lines: ownCropMatches(o, catalogue, [...onFarm, ...linked]) }))
    .find((x) => x.lines.length > 0);
  if (!offer) return null;
  const { crop, lines } = offer;
  const no = () => {
    const next = [...seen, crop.id];
    setSeen(next);
    writeJson(browserStore(), key, next);
  };
  const link = (line: (typeof lines)[number]) =>
    void save(
      (d) => {
        d.ownCrops = d.ownCrops.map((o) => (o.id === crop.id ? linkOwnCrop(o, line) : o));
      },
      setErr,
      undefined,
      'Am legat cultura',
    );
  return (
    <section className="card s12 own-match">
      <h2>{crop.name} e în lista APIA</h2>
      <p className="note">
        {lines.length === 1 ? 'E cultura de mai jos?' : 'E una dintre culturile de mai jos?'} Păstrăm cifrele tale. Doar numele devine cel din cererea de plată, ca să
        se vadă la fel peste tot.
      </p>
      <div className="own-match-lines">
        {lines.map((l) => (
          <button key={l.code} type="button" className="chipb" onClick={() => link(l)}>
            {l.name_ro}, cod {l.code}
          </button>
        ))}
        <button type="button" className="btn btn-line" onClick={no}>
          {lines.length === 1 ? 'Nu, las-o așa' : 'Niciuna'}
        </button>
      </div>
      <ErrorLine>{err}</ErrorLine>
    </section>
  );
}

/** The page starts over for another harvest or crop, as it did when the picker reloaded it. */
export default function Recolte() {
  const view = useView('picked')!;
  return <RecoltePage key={`${view.selected.id}:${view.selectedCrop}`} />;
}

type Saver = (change: (draft: HarvestState) => void, onError: (text: string) => void, onDone?: () => void, title?: string) => Promise<void>;
type Ask = { title: string; text: string; yes: string; run: (onError: (t: string) => void) => Promise<void> };

function RecoltePage() {
  const view = useView('picked')!;
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const papers = usePapers();
  const { text: t } = useMoney();
  const TODAY = view.today;
  const onServer = !!farm.me;
  const h = view.selected;
  const state = view.harvests;
  const cropId = view.crop?.id ?? null;
  const cropName = view.cropName;
  /* „Adaugă în calendar”: the same form as Calendar, started on this crop (docs/calendar-events-plan.md). */
  const [planning, setPlanning] = useState(false);
  const ownParcels = cropId ? h.parcels.filter((p) => p.cropId === cropId) : h.parcels;
  const shownRecords = cropId ? h.records.filter((r) => r.cropId === cropId) : h.records;
  const project = view.projectName(h, cropId);
  const isOpen = !projectClosed(h, cropId);
  const firstDay = `${harvestMonth(h.year)}-01`;
  const started = firstDay <= TODAY;
  const seasons = isOpen && h.year === view.baseYear;
  const NOW = TODAY.slice(0, 7);
  const cropOf = (id: string) => view.baseData().crops.crops.find((c) => c.id === id) as Crop;

  /* A second tap while a save runs is ignored, on the phone-only path too (IDEM-15). */
  const sending = useRef(false);
  const failedText = useCallback((e: unknown) => failText(e, online), [online]);
  const saved = useSaved();
  const { notify, mode } = useContext(FrameContext);
  const save: Saver = async (change, onError, onDone, title = 'Am salvat') => {
    if (sending.current) return;
    sending.current = true;
    try {
      await saved(title, () => store.updateHarvests(change));
      onDone?.();
    } catch (e) {
      onError(failedText(e));
    } finally {
      sending.current = false;
    }
  };

  /* ---- Noting a sale or an expense ---- */
  const [kind, setKind] = useState<'sale' | 'expense'>('sale');
  const whatOptions = (k: 'sale' | 'expense'): [string, string][] => (k === 'sale' ? ownParcels.map((p) => [p.cropId, cropName(p.cropId)]) : CATEGORIES);
  const [what, setWhat] = useState(() => whatOptions('sale')[0]?.[0] ?? '');
  const [forCrop, setForCrop] = useState(cropId ?? '');
  const [amount, setAmount] = useState('');
  /* Total or per hectare (docs/per-ha-total-plan.md). The last unit the farmer picked is kept; until then
     rent opens per hectare, the way it's agreed. A paper's amount is a total, just for that record. */
  const recordKey = storageKey(RECORD_BASIS_KEY, mode);
  const [keptBasis, setKeptBasis] = useState<Basis | null>(() => loadBasis(browserStore(), recordKey));
  const [paperBasis, setPaperBasis] = useState<Basis | null>(null);
  const [day, setDay] = useState(TODAY);
  /* For the accountant and the diesel refund (migration 027): all optional, under "Mai multe detalii". */
  const [docNo, setDocNo] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [litres, setLitres] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [paperNote, setPaperNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [allRecords, setAllRecords] = useState(false);
  /* The parcel it was for (docs/harta-plan.md step 10). Only a farm on the server has parcels to pick;
     none means the whole crop. A treatment on a parcel can also note the work itself. */
  const farmPlots = usePlots(h.year, { fetch: onServer }).plots;
  const [plotPick, setPlotPick] = useState('');
  const [treatment, setTreatment] = useState<TreatmentWorkValue>(NEW_TREATMENT);
  const plotChoices = onServer && farmPlots ? plotsForCrop(farmPlots.plots, farmPlots.seasons, h.year, kind === 'sale' ? what || null : forCrop || null) : [];
  const plotId = plotChoices.some((p) => p.id === plotPick) ? plotPick : '';
  const work = kind === 'expense' && what === 'treatments' && plotId ? treatmentInput(treatment, plotId, h.year, day) : null;
  /* The hectares the amount is split by: the sold crop, the crop the expense is for, or the whole harvest.
     Without hectares there's nothing to split by, so the amount is a total. */
  const recordAri = kind === 'sale' ? view.areaAri(what, h) : view.areaAri(forCrop || null, h);
  const recordBasis: Basis = recordAri > 0 ? (paperBasis ?? keptBasis ?? (kind === 'expense' && what === 'rent' ? 'ha' : 'total')) : 'total';
  const flipRecord = (b: Basis) => {
    setAmount((text) => flipText(text, 'lei', recordBasis, recordAri));
    setKeptBasis(b);
    setPaperBasis(null);
    saveBasis(browserStore(), recordKey, b);
  };
  const changeKind = (k: 'sale' | 'expense') => {
    setKind(k);
    setWhat(whatOptions(k)[0]?.[0] ?? '');
  };

  /* A photo of a paper fills the form. "Salvează" stays the farmer's confirmation. */
  async function readPaper() {
    const r = await papers.pick({ accepts: ['invoice', 'sale_paper'] });
    if (!r) return;
    const k = r.kind === 'sale_paper' ? 'sale' : 'expense';
    setKind(k);
    setErr(null);
    const unread: string[] = [];
    setAmount(r.amountBani ? group(Math.round(r.amountBani / 100)) : '');
    setDocNo(r.docNo ?? '');
    if (r.docNo) setMoreOpen(true);
    setPaperBasis('total');
    if (!r.amountBani) unread.push('suma');
    if (r.date && r.date >= firstDay && r.date <= TODAY) setDay(r.date);
    else unread.push('data');
    const options = whatOptions(k);
    const pick = k === 'sale' ? r.cropId : expenseCategory(r.category);
    if (pick && options.some(([v]) => v === pick)) setWhat(pick);
    else {
      setWhat(options[0]?.[0] ?? '');
      unread.push(k === 'sale' ? 'cultura' : 'pe ce s-a cheltuit');
    }
    /* A plant protection invoice: the parcel picked below also gets the treatment noted. */
    const treat = k === 'expense' && pick === 'treatments' && onServer ? ' Alege parcela pe care ai dat tratamentul și îl notăm și pe ea.' : '';
    setPaperNote((unread.length ? `Am completat ce am putut. Verifică ${unread.join(', ')}, apoi apasă Salvează.` : 'Am completat de pe hârtie. Verifică și apasă Salvează.') + treat);
  }

  /* One id per record the farmer means to save. "Salvează" again after an error sends the same record
     with the same id, so the server keeps it once even if the first try got through. A changed amount,
     date or crop is another record and gets a new id. */
  const intent = useRef<{ sig: string | null; key: string | null; workKey?: string }>({ sig: null, key: null });
  const intentKeyFor = (name: string, input: unknown) => {
    const sig = JSON.stringify([name, input]);
    if (intent.current.sig !== sig) intent.current = { sig, key: newIntentKey(), workKey: newIntentKey() };
    return intent.current.key!;
  };
  /** The server already has the whole document, so only this one change needs sending. */
  async function sendRecord(name: string, input: Record<string, unknown>, onDone: () => void, title: string, work?: Record<string, unknown>) {
    if (sending.current) return;
    sending.current = true;
    let workFailed: unknown = null;
    try {
      await saved(title, () =>
        store.send(async ({ write }) => {
          const r = (await write(name, input)) as { id?: string } | undefined;
          if (!work) return;
          /* The money is saved by now, so a failed work note doesn't take it back: it's said below. */
          try {
            await write('add_operation', { ...work, transactionId: r?.id ?? null });
          } catch (e) {
            workFailed = e;
          }
        }),
      );
      onDone?.();
      if (workFailed) setErr(`Cheltuiala e notată, dar tratamentul nu. ${failedText(workFailed)} Îl poți nota de pe Harta.`);
    } catch (e) {
      setErr(failedText(e));
    } finally {
      sending.current = false;
    }
  }
  const resetForm = () => {
    setAmount('');
    setDay(TODAY);
    setPaperNote('');
    setPaperBasis(null);
    setErr(null);
    setDocNo('');
    setCounterparty('');
    setLitres('');
    setMoreOpen(false);
    setPlotPick('');
    setTreatment(NEW_TREATMENT);
    changeKind('sale');
    intent.current = { sig: null, key: null };
  };
  function submitRecord(e: FormEvent) {
    e.preventDefault();
    /* Typed per hectare, it's saved as the total for those hectares, to the whole leu. */
    const typed = totalBaniFrom(amount, recordBasis, recordAri);
    const lei = typed === null ? null : Math.round(typed / 100);
    if (lei === null || lei <= 0) return setErr(recordBasis === 'ha' ? `Scrie suma pe hectar în lei întregi, de exemplu ${group(800)}.` : `Scrie suma în lei întregi, de exemplu ${group(12500)}.`);
    if (!day || day < firstDay || day > TODAY) return setErr(`Alege o zi între ${date(firstDay, true)} și azi.`);
    const target = forCrop && kind === 'expense' ? { cropId: forCrop } : {};
    const diesel = kind === 'expense' && what === 'diesel';
    const l = diesel ? litresFrom(litres) : null;
    if (l === undefined) return setErr('Scrie litrii ca număr, de exemplu 250 sau 120,5.');
    const docs = {
      ...(docNo.trim() ? { docNo: docNo.trim().slice(0, 60) } : {}),
      ...(counterparty.trim() ? { counterparty: counterparty.trim().slice(0, 120) } : {}),
      ...(l ? { fuelLiters: l } : {}),
    };
    const noted = kind === 'sale' ? 'Am notat vânzarea' : work ? 'Am notat cheltuiala și tratamentul' : 'Am notat cheltuiala';
    const onPlot = plotId ? { plotId } : {};
    setErr(null);
    if (onServer) {
      const [name, input]: [string, Record<string, unknown>] =
        kind === 'sale' ? ['record_sale', { cropId: what, date: day, totalLei: lei, harvestYear: h.year, ...onPlot, ...docs }] : ['add_expense', { category: what, amountLei: lei, date: day, harvestYear: h.year, ...target, ...onPlot, ...docs }];
      const clientId = intentKeyFor(name, { ...input, work });
      return void sendRecord(name, { ...input, clientId }, resetForm, noted, work ? { ...work, clientId: intent.current.workKey } : undefined);
    }
    const base = { id: `n${Date.now()}`, date: day, ...(docs.docNo ? { docNo: docs.docNo } : {}), ...(docs.counterparty ? { counterparty: docs.counterparty } : {}) };
    void save(
      (draft) => {
        const hd = draft.items.find((x) => x.id === h.id)!;
        if (kind === 'sale') hd.records.push({ ...base, kind: 'sale', cropId: what, amountBani: lei * 100 } as Harvest['records'][number]);
        else hd.records.push({ ...base, kind: 'expense', category: what, amountBani: -lei * 100, ...target, ...(docs.fuelLiters ? { fuelLitersCl: litresToCl(docs.fuelLiters) } : {}) } as Harvest['records'][number]);
      },
      setErr,
      resetForm,
      noted,
    );
  }

  /* ---- Deleting: the row goes at once, and the delete itself waits until "Anulează" can't be tapped. ---- */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const waitingDeletes = useRef(new Map<string, () => void>());
  const deleting = useRef<Promise<void>>(Promise.resolve());
  const showAgain = (id: string) =>
    setHidden((was) => {
      const next = new Set(was);
      next.delete(id);
      return next;
    });
  /* One after another: two rows deleted close together mustn't overwrite each other. */
  const sendDelete = (id: string) => {
    deleting.current = deleting.current.then(async () => {
      try {
        if (onServer) await store.send(({ write }) => write('undo_transaction', { id }));
        else
          await store.updateHarvests((draft) => {
            const hd = draft.items.find((x) => x.id === h.id)!;
            hd.records = hd.records.filter((r) => r.id !== id);
          });
      } catch (e) {
        showAgain(id);
        setErr(failedText(e));
      }
    });
  };
  function undo(r: Harvest['records'][number]) {
    const { id } = r;
    if (waitingDeletes.current.has(id)) return;
    const commit = () => {
      if (waitingDeletes.current.delete(id)) sendDelete(id);
    };
    waitingDeletes.current.set(id, commit);
    setHidden((was) => new Set(was).add(id));
    notify({
      tone: 'info',
      title: `Am șters: ${label(r)}`,
      action: {
        label: 'Anulează',
        run: () => {
          waitingDeletes.current.delete(id);
          showAgain(id);
        },
      },
      onExpire: commit,
    });
  }
  /* Leaving the page counts as not wanting it back. */
  useEffect(
    () => () => {
      for (const commit of [...waitingDeletes.current.values()]) commit();
    },
    [],
  );

  const label = (r: Harvest['records'][number]) => (r.kind === 'sale' ? `Vânzare: ${cropName(r.cropId!)}` : r.kind === 'expense' ? `${expenseLabel(r.category) ?? 'Cheltuială'}${r.who ? `: ${r.who}` : ''}` : APIA.find(([k]) => k === r.kind)?.[1]);
  const sorted = shownRecords.filter((r) => !hidden.has(r.id)).sort((a, b) => b.date.localeCompare(a.date));
  const shown = allRecords ? sorted : sorted.slice(0, LATEST);

  /* ---- The sheets ---- */
  const [sheet, setSheet] = useState<null | 'gathered' | 'planted' | 'lost' | 'close'>(null);
  const [edit, setEdit] = useState<{ target: Harvest | null } | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const openEdit = useCallback((target: Harvest | null) => setEdit({ target }), []);

  /* The picker links here, and on this page a link only changes the hash. */
  useEffect(() => {
    const route = () => {
      const hash = location.hash;
      if (hash === '#strans') {
        history.replaceState(null, '', location.pathname);
        if (seasons) setSheet('gathered');
        return;
      }
      if (hash !== '#nou' && hash !== '#cultura') return;
      history.replaceState(null, '', location.pathname);
      openEdit(hash === '#nou' ? null : h);
    };
    route();
    addEventListener('hashchange', route);
    return () => removeEventListener('hashchange', route);
  }, [h, seasons, openEdit]);

  const orAverage = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? 'media' : `${String(v).replace('.', ',')} ${unit}`);
  const ownGathered = cropId ? state.gathered.filter((g) => g.cropId === cropId) : state.gathered;
  /* Closing is when the history gets filled: a crop without an answer is asked about first. */
  const unanswered = h.parcels.filter((p) => (!cropId || p.cropId === cropId) && !isFallow(p.cropId) && !p.lost && !projectClosed(h, p.cropId));
  const closeHarvest = () =>
    unanswered.length ? setSheet('close') : setAsk({
      title: `Încheie ${project}?`,
      text: 'Păstrăm planul și ce ai notat. Poți redeschide oricând.',
      yes: 'Încheie',
      run: (onError) => save((d) => view.closeProject(d.items.find((x) => x.id === h.id)!, cropId), onError, () => setAsk(null)),
    });
  const reopen = () =>
    setAsk({
      title: `Redeschide ${project}?`,
      text: 'Vei putea nota din nou.',
      yes: 'Redeschide',
      run: (onError) => save((d) => reopenProject(d.items.find((x) => x.id === h.id)!, cropId), onError, () => setAsk(null)),
    });

  return (
    <>
      <header className="page-h">
        <div>
          <h1>{project}</h1>
          <p className="lead">{isOpen ? 'Ce ai strâns, ce ai în pământ și ce ai notat.' : 'E încheiată. Aici vezi planul și ce s-a întâmplat.'}</p>
        </div>
      </header>
      <FutureNote />
      <OfflineNote>Nu ai internet. Ce notezi se trimite când ai internet.</OfflineNote>
      <div className="bento">
        {isOpen && !cropId && <OwnCostCard />}
        {isOpen && !cropId && <OwnMatchCard save={save} />}
        {!isOpen && (
          <section className="card s12">
            <div className="card-h">
              <h2>Plan și realitate</h2>
            </div>
            <CompareTable view={view} harvestId={h.id} cropId={cropId} realLabel="Real" />
            <div className="ob-actions">
              {h.year >= view.baseYear && (
                <button type="button" className="btn btn-line" onClick={reopen}>
                  Redeschide
                </button>
              )}
            </div>
          </section>
        )}
        {isOpen && (
          <section className="card s12">
            <h2>{seasons ? 'Culturile tale' : 'Ce vei semăna'}</h2>
            <div>
              {seasons ? (
                <>
                  {ownParcels.map((p) => {
                    const crop = cropOf(p.cropId);
                    const sown = isSown(crop, p.plantedMonth, NOW);
                    return <CropRow key={p.cropId} name={`${cropName(p.cropId)}, ${haText(p.areaHa)} ha`} detail={[plantedHint(crop, p.plantedMonth, NOW), sowingSummary(p.sowing)].filter(Boolean).join(' ')} tag={sown ? 'În pământ' : 'De semănat'} tone={sown ? 'ok' : 'n'} />;
                  })}
                  {ownGathered.length ? (
                    ownGathered.map((g) => (
                      <CropRow
                        key={g.cropId}
                        name={cropName(g.cropId)}
                        detail={`Semănat în ${monthLabel(g.sown!)}, strâns în ${monthLabel(g.harvested!)}. ${orAverage(g.tonnes, 't')} la ${orAverage(g.priceLeiPerKg, 'lei/kg')}${g.storedTonnes ? `, ${String(g.storedTonnes).replace('.', ',')} t în hambar` : ''}.`}
                        tag="Strâns"
                        tone="d"
                      />
                    ))
                  ) : (
                    <p className="h-none">Nimic strâns încă. Folosim mediile.</p>
                  )}
                </>
              ) : (
                /* A later harvest isn't sown yet, so there are no dates to change. */
                ownParcels.map((p) => <CropRow key={p.cropId} name={`${cropName(p.cropId)}, ${haText(p.areaHa)} ha`} detail={`se strânge în ${MONTHS[(view.baseData().crops.crops.find((c) => c.id === p.cropId)?.harvest_month ?? 1) - 1]}`} tag="De semănat" tone="n" />)
              )}
            </div>
            <div className="h-links">
              {seasons && (
                <button type="button" className="h-quiet" onClick={() => setSheet('gathered')}>
                  Notează recolta
                </button>
              )}{' '}
              {seasons && (
                <button type="button" className="h-quiet" onClick={() => setSheet('planted')}>
                  Schimbă semănatul
                </button>
              )}{' '}
              {seasons && ownParcels.some((p) => !isFallow(p.cropId) && isSown(cropOf(p.cropId), p.plantedMonth, NOW)) && (
                <button type="button" className="h-quiet" onClick={() => setSheet('lost')}>
                  Am pierdut o parte din cultură
                </button>
              )}{' '}
              <button type="button" className="h-quiet" onClick={() => setPlanning(true)}>
                Adaugă în calendar
              </button>{' '}
              {/* Crops and hectares belong to the whole year. */}
              {!cropId && (
                <button type="button" className="h-quiet" onClick={() => openEdit(h)}>
                  Schimbă culturile
                </button>
              )}
            </div>
          </section>
        )}
        <section className="card s12">
          {isOpen && started && (
            <div>
              <div className="h-log-h">
                <h2>Notează</h2>
                <div className="vtabs" role="group" aria-label="Ce notezi">
                  {KINDS.map(([k, l]) => (
                    <button key={k} type="button" className="chip" aria-pressed={k === kind} onClick={() => changeKind(k)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-paper">
                <PaperButton label="Fă o poză la factură" onClick={() => void readPaper()} />
              </div>
              {paperNote && (
                <p className="note h-paper-note" role="status">
                  {paperNote}
                </p>
              )}
              <form className="h-record" noValidate onSubmit={submitRecord}>
                {/* A crop's own sale can't be for anything else. */}
                {!(kind === 'sale' && cropId) && (
                  <label>
                    <span>{kind === 'sale' ? 'Cultura' : 'Pe ce'}</span>
                    <select value={what} onChange={(e) => setWhat(e.target.value)}>
                      {whatOptions(kind).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                )}{' '}
                {kind === 'expense' && (
                  <label>
                    Pentru
                    <select value={forCrop} onChange={(e) => setForCrop(e.target.value)}>
                      <option value="">Toată ferma</option>
                      {h.parcels.filter((p) => !isFallow(p.cropId)).map((p) => (
                        <option key={p.cropId} value={p.cropId}>
                          {cropName(p.cropId)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}{' '}
                {plotChoices.length > 0 && (
                  <label>
                    Pe ce parcelă?
                    <select value={plotId} onChange={(e) => setPlotPick(e.target.value)}>
                      <option value="">{kind === 'sale' || forCrop ? 'Toată cultura' : 'Toată ferma'}</option>
                      {plotChoices.map((p) => (
                        <option key={p.id} value={p.id}>
                          {plotName(p, cropName)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}{' '}
                {kind === 'expense' && what === 'treatments' && plotId && <TreatmentWork value={treatment} onChange={setTreatment} />}{' '}
                <BasisSwitch basis={recordBasis} onChange={flipRecord} label="Suma: total sau pe hectar" why={recordAri > 0 ? null : 'Cultura nu are hectare în recolta asta, așa că suma e totală.'} />{' '}
                <label>
                  {recordBasis === 'ha' ? 'Suma pe hectar, în lei' : 'Suma, în lei'}
                  <input inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  {recordAri > 0 ? <BasisEcho text={amount} basis={recordBasis} ari={recordAri} saved="total" /> : <AmountEcho text={amount} />}
                </label>{' '}
                <label>
                  Data
                  <input type="date" min={firstDay} max={TODAY} value={day} onChange={(e) => setDay(e.target.value)} />
                </label>{' '}
                <details className="h-more" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
                  <summary>Mai multe detalii</summary>
                  <p className="note">Pentru contabil. Nu sunt obligatorii.</p>
                  <label>
                    Numărul facturii sau al bonului
                    <input autoComplete="off" maxLength={60} value={docNo} onChange={(e) => setDocNo(e.target.value)} />
                  </label>{' '}
                  <label>
                    {kind === 'sale' ? 'Cui ai vândut' : 'De la cine ai cumpărat'}
                    <input autoComplete="off" maxLength={120} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
                  </label>
                  {kind === 'expense' && what === 'diesel' && (
                    <label>
                      Litri de motorină
                      <input inputMode="decimal" autoComplete="off" value={litres} onChange={(e) => setLitres(e.target.value)} />
                      <span className="note">Cu ei socotim cât poți primi înapoi din acciză.</span>
                    </label>
                  )}
                </details>{' '}
                <ErrorLine>{err}</ErrorLine>{' '}
                <button type="submit" className="btn btn-dark">
                  Salvează
                </button>
              </form>
            </div>
          )}
          {isOpen && !started && <p className="note">Poți nota pentru {project} din {date(firstDay, true)}. Până atunci e doar un plan.</p>}
          {!(isOpen && started) && <ErrorLine>{err}</ErrorLine>}
          {/* With the form on show the notes sit right under it, so only a page without it needs the heading. */}
          {!(isOpen && started) && <h2>Ce s-a notat</h2>}
          <div>
            {sorted.length ? (
              <>
                {shown.map((r) => (
                  <div className="h-rec" key={r.id}>
                    <span>
                      {label(r)}
                      <small>
                        {date(r.date, true)}
                        {r.kind === 'expense' && r.cropId && !cropId ? `, ${cropName(r.cropId)}` : ''}
                      </small>
                    </span>
                    <b>{t(`${r.amountBani < 0 ? '−' : '+'}${exact(Math.abs(r.amountBani))} lei`)}</b>
                    {isOpen && !r.fixed ? (
                      <button type="button" aria-label={`Șterge ${label(r)}`} onClick={() => undo(r)}>
                        Șterge
                      </button>
                    ) : (
                      <i />
                    )}
                  </div>
                ))}
                {sorted.length > shown.length && (
                  <button type="button" className="h-quiet" onClick={() => setAllRecords(true)}>
                    Arată toate ({sorted.length})
                  </button>
                )}
              </>
            ) : (
              <p className="h-none">Nimic notat încă.</p>
            )}
          </div>
        </section>
        {(started || h.records.length > 0) && <CostPerHa view={view} harvest={h} records={h.records.filter((r) => !hidden.has(r.id))} cropId={cropId} categories={CATEGORIES} />}
      </div>
      {/* Closing comes last on the page, as the last thing done with a project. */}
      {isOpen && (
        <p className="h-end">
          <span>Ai terminat cu {project}?</span>
          <button type="button" className="h-quiet" onClick={closeHarvest}>
            {cropId ? 'Încheie cultura' : 'Încheie recolta'}
          </button>
        </p>
      )}
      {seasons && sheet === 'gathered' && <GatheredSheet save={save} onClose={() => setSheet(null)} />}
      {seasons && sheet === 'planted' && <PlantedSheet save={save} onClose={() => setSheet(null)} />}
      {seasons && sheet === 'lost' && <LostSheet save={save} onClose={() => setSheet(null)} />}
      {sheet === 'close' && <CloseSheet title={`Încheie ${project}?`} parcels={unanswered} save={save} onClose={() => setSheet(null)} />}
      {edit && <EditSheet target={edit.target} save={save} onClose={() => setEdit(null)} />}
      {ask && <ConfirmSheet ask={ask} onClose={() => setAsk(null)} />}
      <EventSheet open={planning} cropId={cropId ?? (ownParcels.length === 1 ? ownParcels[0].cropId : null)} onClose={() => setPlanning(false)} />
    </>
  );
}

/* ---- What was gathered ---- */
function GatheredSheet({ save, onClose }: { save: Saver; onClose: () => void }) {
  const view = useView('picked')!;
  const h = view.selected;
  const state = view.harvests;
  const cropId = view.crop?.id ?? null;
  const NOW = view.today.slice(0, 7);
  const crops = (cropId ? [cropId] : [...new Set([...h.parcels.map((p) => p.cropId), ...state.gathered.map((g) => g.cropId)])]).filter((id) => !isFallow(id)).map((id) => view.baseData().crops.crops.find((c) => c.id === id) as Crop);
  const [texts, setTexts] = useState<Record<string, GatheredText>>(() =>
    Object.fromEntries(
      crops.map((c) => {
        const g = state.gathered.find((x) => x.cropId === c.id);
        const area = g?.areaHa ?? h.parcels.find((p) => p.cropId === c.id)?.areaHa ?? null;
        return [c.id, { areaHa: decimalText(area), tonnes: decimalText(g?.tonnes), priceLeiPerKg: decimalText(g?.priceLeiPerKg), storedTonnes: decimalText(g?.storedTonnes) }];
      }),
    ),
  );
  const sown = (id: string) => h.parcels.find((p) => p.cropId === id);
  const [losses, setLosses] = useState<Record<string, LossText>>(() => Object.fromEntries(crops.map((c) => [c.id, lossText(sown(c.id)?.lost)])));
  const [err, setErr] = useState<string | null>(null);
  /* The scale gives a total, so tonnes open as tonnes; per hectare is counted on this sheet's hectares. */
  const [units, setUnits] = useState<Record<string, Basis>>({});
  const unitOf = (id: string) => units[id] ?? 'total';
  /* Tonnes per hectare are per harvested hectare: the lost ones gave nothing. */
  const lostAri = (id: string) => {
    const p = sown(id);
    const r = p ? readLoss(losses[id]!, p.areaHa, '') : null;
    return r?.kind === 'ok' ? Math.round(r.lost.ha * 100) : 0;
  };
  const ariOf = (id: string) => Math.max(0, Math.round((decimalOrNull(texts[id].areaHa) ?? 0) * 100) - lostAri(id));
  const set = (id: string, f: keyof GatheredText, v: string) => setTexts((x) => ({ ...x, [id]: { ...x[id], [f]: v } }));
  const flipTonnes = (id: string, b: Basis) => {
    set(id, 'tonnes', flipText(texts[id].tonnes, 'tonnes', unitOf(id), ariOf(id)));
    setUnits((u) => ({ ...u, [id]: b }));
  };
  /** What's saved is the total: tonnes typed per hectare are counted on the hectares above them. */
  const asTotal = (id: string): GatheredText => {
    const x = texts[id];
    if (unitOf(id) === 'total' || x.tonnes.trim() === '') return x;
    const t = tonnesFrom(x.tonnes, 'ha', ariOf(id));
    return { ...x, tonnes: t === null ? x.tonnes : String(t) };
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const out = readGathered(crops.map((crop) => ({ crop, text: asTotal(crop.id) })), NOW);
    if ('error' in out) return setErr(out.error);
    const lost = readLosses(crops.flatMap((c) => (sown(c.id) ? [{ cropId: c.id, name: c.name_ro, areaHa: sown(c.id)!.areaHa, text: losses[c.id]! }] : [])));
    if ('error' in lost) return setErr(lost.error ?? null);
    setErr(null);
    void save(
      (d) => {
        d.gathered = [...d.gathered.filter((g) => !out.rows.some((r) => r.cropId === g.cropId)), ...out.filled] as HarvestState['gathered'];
        const draft = d.items.find((x) => x.id === h.id);
        if (draft) for (const r of lost.rows) writeLoss(draft, r.cropId, r.lost);
      },
      setErr,
      onClose,
    );
  };
  return (
    <Sheet open onClose={onClose} className="h-sheet" label="Ce ai strâns anul ăsta" keepOnBackdrop>
      <form noValidate onSubmit={submit}>
        <h2>Ce ai strâns anul ăsta</h2>
        <div>
          {crops.map((c) => {
            const x = texts[c.id];
            const field = (f: keyof GatheredText, labelText: string, placeholder?: string) => (
              <label>
                {labelText}
                <input inputMode="decimal" autoComplete="off" placeholder={placeholder} value={x[f]} onChange={(e) => set(c.id, f, e.target.value)} />
              </label>
            );
            return (
              <fieldset className="ob-season" key={c.id}>
                <legend>{c.name_ro}</legend>
                <p className="hint">{gatheredHint(c, NOW)}</p>
                <div className="basis-row">
                  <p className="note">Recolta</p>
                  <BasisSwitch kind="tonnes" basis={unitOf(c.id)} onChange={(b) => flipTonnes(c.id, b)} label={`Recolta de ${c.name_ro.toLowerCase()}: tone sau tone la hectar`} why={ariOf(c.id) > 0 ? null : 'Scrie întâi hectarele.'} />
                </div>
                <div className="ob-grid">
                  {field('areaHa', 'Hectare')}
                  {unitOf(c.id) === 'ha'
                    ? field('tonnes', 'Câte tone ai strâns la hectarul recoltat?', decimalText(c.yield_t_per_ha.mean))
                    : field('tonnes', 'Câte tone ai strâns de pe hectarele recoltate?', usualTonnes(c, ariOf(c.id) / 100))}
                  {field('priceLeiPerKg', 'Cu cât ai vândut, în lei/kg?', `media: ${decimalText(c.price_lei_per_kg.mean)}`)}
                  {field('storedTonnes', 'Câte tone mai ai în hambar?', '0')}
                </div>
                {unitOf(c.id) === 'ha' && <BasisEcho text={x.tonnes} kind="tonnes" basis="ha" ari={ariOf(c.id)} saved="total" />}
                {sown(c.id) && <LossFields cropName={c.name_ro} areaHa={sown(c.id)!.areaHa} value={losses[c.id]!} onChange={(v) => setLosses((l) => ({ ...l, [c.id]: v }))} />}
              </fieldset>
            );
          })}
        </div>
        <ErrorLine>{err}</ErrorLine>
        <div className="ob-actions">
          <button type="submit" className="btn btn-dark">
            Salvează
          </button>
          <button type="button" className="btn btn-line" onClick={onClose}>
            Renunță
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/* ---- Part of a crop still in the ground is lost: it shows in the plan before the harvest ---- */
function LostSheet({ save, onClose }: { save: Saver; onClose: () => void }) {
  const view = useView('picked')!;
  const h = view.selected;
  const cropId = view.crop?.id ?? null;
  const NOW = view.today.slice(0, 7);
  const parcels = h.parcels.filter((p) => (!cropId || p.cropId === cropId) && !isFallow(p.cropId) && isSown(view.baseData().crops.crops.find((c) => c.id === p.cropId) as Crop, p.plantedMonth, NOW));
  const [texts, setTexts] = useState<Record<string, LossText>>(() => Object.fromEntries(parcels.map((p) => [p.cropId, lossText(p.lost)])));
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const out = readLosses(parcels.map((p) => ({ cropId: p.cropId, name: view.cropName(p.cropId), areaHa: p.areaHa, text: texts[p.cropId]!, month: p.lost?.month ?? NOW })));
    if ('error' in out) return setErr(out.error ?? null);
    setErr(null);
    void save(
      (d) => {
        const draft = d.items.find((x) => x.id === h.id);
        if (draft) for (const r of out.rows) writeLoss(draft, r.cropId, r.lost);
      },
      setErr,
      onClose,
    );
  };
  return (
    <Sheet open onClose={onClose} className="h-sheet" label="Ce ai pierdut din cultură" keepOnBackdrop>
      <form noValidate onSubmit={submit}>
        <h2>Ce ai pierdut din cultură</h2>
        <p className="note">Scrie hectarele pe care nu le mai poți strânge. Planul vinde doar ce rămâne, iar cheltuielile rămân la fel.</p>
        {parcels.map((p) => (
          <fieldset className="ob-season" key={p.cropId}>
            <legend>
              {view.cropName(p.cropId)}, {haText(p.areaHa)} ha
            </legend>
            <LossFields cropName={view.cropName(p.cropId)} areaHa={p.areaHa} value={texts[p.cropId]!} label="Câte hectare ai pierdut?" onChange={(v) => setTexts((t) => ({ ...t, [p.cropId]: v }))} />
          </fieldset>
        ))}
        <ErrorLine>{err}</ErrorLine>
        <div className="ob-actions">
          <button type="submit" className="btn btn-dark">
            Salvează
          </button>
          <button type="button" className="btn btn-line" onClick={onClose}>
            Renunță
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/* ---- Closing asks what was lost from each crop not answered yet. „Nimic” saves 0; no answer stays unknown ---- */
function CloseSheet({ title, parcels, save, onClose }: { title: string; parcels: HarvestParcel[]; save: Saver; onClose: () => void }) {
  const view = useView('picked')!;
  const h = view.selected;
  const cropId = view.crop?.id ?? null;
  const [answers, setAnswers] = useState<Record<string, 'none' | 'some' | null>>({});
  const [texts, setTexts] = useState<Record<string, LossText>>(() => Object.fromEntries(parcels.map((p) => [p.cropId, lossText(undefined)])));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    const some = parcels.filter((p) => answers[p.cropId] === 'some');
    const out = readLosses(some.map((p) => ({ cropId: p.cropId, name: view.cropName(p.cropId), areaHa: p.areaHa, text: texts[p.cropId]! })));
    if ('error' in out) return setErr(out.error ?? null);
    setErr(null);
    setBusy(true);
    await save(
      (d) => {
        const draft = d.items.find((x) => x.id === h.id)!;
        for (const p of parcels) if (answers[p.cropId] === 'none') writeLoss(draft, p.cropId, { kind: 'ok', lost: { ha: 0 } });
        for (const r of out.rows) writeLoss(draft, r.cropId, r.lost);
        view.closeProject(draft, cropId);
      },
      setErr,
      onClose,
    );
    setBusy(false);
  };
  return (
    <Sheet open onClose={onClose} className="h-sheet" label={title} locked={busy}>
      <h2>{title}</h2>
      <p className="note">Păstrăm planul și ce ai notat. Poți redeschide oricând. Spune-ne și ce n-ai putut strânge, ca prognoza să țină cont de anii tăi.</p>
      {parcels.map((p) => {
        const name = view.cropName(p.cropId);
        const answer = answers[p.cropId] ?? null;
        const pick = (a: 'none' | 'some') => setAnswers((x) => ({ ...x, [p.cropId]: answer === a ? null : a }));
        return (
          <fieldset className="ob-season" key={p.cropId}>
            <legend>Ai pierdut ceva din {name.toLowerCase()}?</legend>
            <div className="loss-ask">
              <button type="button" className="chipb" aria-pressed={answer === 'none'} onClick={() => pick('none')}>
                Nimic
              </button>
              <button type="button" className="chipb" aria-pressed={answer === 'some'} onClick={() => pick('some')}>
                Da, o parte
              </button>
            </div>
            {answer === 'some' && <LossFields cropName={name} areaHa={p.areaHa} value={texts[p.cropId]!} onChange={(v) => setTexts((t) => ({ ...t, [p.cropId]: v }))} />}
          </fieldset>
        );
      })}
      <ErrorLine>{err}</ErrorLine>
      <div className="ob-actions">
        <button type="button" className="btn btn-dark" disabled={busy} aria-busy={busy || undefined} onClick={() => void confirm()}>
          Încheie
        </button>
        <button type="button" className="btn btn-line" disabled={busy} onClick={onClose}>
          Renunță
        </button>
      </div>
    </Sheet>
  );
}

/* ---- What's in the ground ---- */
function PlantedSheet({ save, onClose }: { save: Saver; onClose: () => void }) {
  const view = useView('picked')!;
  const h = view.selected;
  const cropId = view.crop?.id ?? null;
  const NOW = view.today.slice(0, 7);
  /* Nothing is sown on fallow land. */
  const parcels = (cropId ? h.parcels.filter((p) => p.cropId === cropId) : h.parcels).filter((p) => !isFallow(p.cropId));
  const cropOf = (id: string) => view.baseData().crops.crops.find((c) => c.id === id) as Crop;
  const [picked, setPicked] = useState<Record<string, string>>(() => Object.fromEntries(parcels.map((p) => [p.cropId, p.plantedMonth || usualPlanting(cropOf(p.cropId), NOW)])));
  const [drafts, setDrafts] = useState<Record<string, SowingDraft>>(() => Object.fromEntries(parcels.map((p) => [p.cropId, sowingDraft(p.sowing)])));
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const sowing: Record<string, Sowing | undefined> = {};
    for (const p of parcels) {
      const read = readSowingDraft(drafts[p.cropId], cropOf(p.cropId).name_ro);
      if ('error' in read) return setErr(read.error);
      sowing[p.cropId] = read.sowing;
    }
    setErr(null);
    void save(
      (d) => {
        const hd = d.items.find((x) => x.id === h.id)!;
        hd.parcels = hd.parcels.map((x) => {
          if (!(x.cropId in picked)) return x;
          const { plantedMonth: _old, sowing: _was, ...p } = x;
          const s = sowing[p.cropId];
          return { ...p, ...(picked[p.cropId] ? { plantedMonth: picked[p.cropId] } : {}), ...(s ? { sowing: s } : {}) };
        });
      },
      setErr,
      onClose,
    );
  };
  return (
    <Sheet open onClose={onClose} className="h-sheet" label="Ce ai acum în pământ" keepOnBackdrop>
      <form noValidate onSubmit={submit}>
        <ErrorLine>{err}</ErrorLine>
        <h2>Ce ai acum în pământ</h2>
        <div>
          {parcels.map((p) => {
            const crop = cropOf(p.cropId);
            return (
              <fieldset className="ob-season" key={p.cropId}>
                <legend>{crop.name_ro}</legend>
                <label>
                  Când l-ai semănat sau când îl semeni?
                  <select value={picked[p.cropId]} onChange={(e) => setPicked((x) => ({ ...x, [p.cropId]: e.target.value }))}>
                    {sowingChoices(crop, NOW).map((m) => (
                      <option key={m} value={m}>
                        {monthLabel(m)}
                        {isUsualMonth(crop, m) ? ', de obicei' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="hint" aria-live="polite">
                  {plantedHint(crop, picked[p.cropId], NOW)}
                </p>
                <SowingFields crop={p.cropId} draft={drafts[p.cropId]} onChange={(d) => setDrafts((x) => ({ ...x, [p.cropId]: d }))} />
              </fieldset>
            );
          })}
        </div>
        <div className="ob-actions">
          <button type="submit" className="btn btn-dark">
            Salvează
          </button>
          <button type="button" className="btn btn-line" onClick={onClose}>
            Renunță
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/* ---- Starting a harvest, or changing its crops ---- */
function EditSheet({ target, save, onClose }: { target: Harvest | null; save: Saver; onClose: () => void }) {
  const view = useView('picked')!;
  const state = view.harvests;
  const crops = view.data().crops.crops;
  const latest = [...state.items].sort((a, b) => b.year - a.year)[0];
  const from = target ?? latest;
  const [ownCrops, setOwnCrops] = useState<OwnCrop[]>(state.ownCrops);
  const [hectares, setHectares] = useState<Record<string, string>>(() => Object.fromEntries(from.parcels.map((p) => [p.cropId, haText(p.areaHa)])));
  const [opening, setOpening] = useState(group(Math.round((target ? target.openingBani : view.harvestEnd(latest)) / 100)));
  const [err, setErr] = useState<string | null>(null);
  const [own, setOwn] = useState<{ crop: OwnCrop | null; line?: CatalogueCrop } | null>(null);
  /* APIA lines picked here. The main crops always show; another one once it has hectares or is picked. */
  const [added, setAdded] = useState<string[]>([]);
  const shown = (c: { id: string; family?: string }) => !c.family || added.includes(c.id) || from.parcels.some((p) => p.cropId === c.id);
  /* A crop described in this visit isn't in the page's data yet, so its name comes from the form. */
  const ownOf = (id: string) => ownCrops.find((c) => c.id === id);
  const nameOf = (id: string) => ownOf(id)?.name || view.cropName(id) || '';
  const rows = [...crops.filter(shown).map((c) => ({ id: c.id })), ...ownCrops.filter((o) => !crops.some((c) => c.id === o.id)).map((o) => ({ id: o.id }))];
  const summary = (parcels: { cropId: string; areaHa: number }[]) => `${haText(totalHa(parcels))} ha, ${list(parcels.map((p) => nameOf(p.cropId).toLowerCase()))}`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parcels = rows
      .map(({ id }) => ({ ...target?.parcels.find((p) => p.cropId === id), cropId: id, areaHa: Math.round(parseFloat((hectares[id] ?? '0').replace(',', '.')) * 100) / 100 }))
      .filter((p) => p.areaHa > 0) as HarvestParcel[];
    const bani = parseWholeLei(opening);
    if (!parcels.length) return setErr('Scrie hectarele pentru cel puțin o cultură.');
    if (bani === null) return setErr('Scrie banii în lei întregi.');
    const lost = target?.parcels.find((p) => !parcels.some((q) => q.cropId === p.cropId) && target.records.some((r) => r.cropId === p.cropId));
    if (lost) return setErr(`${view.cropName(lost.cropId)} are lucruri notate. Șterge-le mai întâi.`);
    setErr(null);
    void save(
      (d) => {
        d.ownCrops = ownCrops;
        if (target) Object.assign(d.items.find((x) => x.id === target.id)!, { parcels, openingBani: bani * 100, summary: summary(parcels) });
        else {
          const year = latest.year + 1;
          const id = `r${year}`;
          d.items.push({ id, year, status: 'open', parcels, openingBani: bani * 100, summary: summary(parcels), records: [] });
          d.selected = id;
          d.crop = null;
        }
      },
      setErr,
      onClose,
    );
  };
  const title = target ? `Culturile din ${harvestName(target)}` : `Începe Recolta ${latest.year + 1}`;

  return (
    <>
      <Sheet open onClose={onClose} className="h-sheet" label={title} keepOnBackdrop>
        <form noValidate onSubmit={submit}>
          <h2>{title}</h2>
          <div>
            {rows.map(({ id }) => {
              const name = nameOf(id);
              const row = (
                <label className="ob-crop" key={id}>
                  <b>{name}</b>
                  <span className="ob-step">
                    <input inputMode="decimal" value={hectares[id] ?? '0'} aria-label={`Hectare ${name}`} onChange={(e) => setHectares((x) => ({ ...x, [id]: e.target.value }))} />
                  </span>
                </label>
              );
              return isOwnCrop(id) ? (
                <div className="own-row" key={id}>
                  {row}
                  <button type="button" className="h-quiet" onClick={() => setOwn({ crop: ownOf(id) ?? null })}>
                    Schimbă cifrele
                  </button>
                </div>
              ) : (
                row
              );
            })}
            <CropSearch
              catalogue={view.data().catalogue}
              label="Caută cultura pe lista APIA"
              exclude={[...rows.map((r) => r.id), ...ownCrops.flatMap((o) => (o.apiaCode ? [view.data().catalogue.find((l) => l.code === o.apiaCode)?.id ?? ''] : []))]}
              onPick={(line) => (line.priced ? setAdded((a) => [...a, line.id]) : setOwn({ crop: null, line }))}
            />
            <button type="button" className="btn btn-line own-add" onClick={() => setOwn({ crop: null })}>
              Altă cultură
            </button>
          </div>{' '}
          <label className="ob-field">
            Bani la început, în lei
            <input inputMode="numeric" autoComplete="off" value={opening} onChange={(e) => setOpening(e.target.value)} />
            <AmountEcho text={opening} />
          </label>{' '}
          <ErrorLine>{err}</ErrorLine>
          <div className="ob-actions">
            <button type="submit" className="btn btn-dark">
              Salvează
            </button>
            <button type="button" className="btn btn-line" onClick={onClose}>
              Renunță
            </button>
          </div>
        </form>
      </Sheet>
      {own && (
        <OwnSheet
          crop={own.crop}
          line={own.line}
          known={[...crops.map((c) => c.name_ro), ...ownCrops.filter((c) => c.id !== own.crop?.id).map((c) => c.name)]}
          count={ownCrops.length}
          areaHa={own.crop ? decimalOrNull(hectares[own.crop.id] ?? '') : null}
          onClose={() => setOwn(null)}
          onDone={(crop, ha) => {
            setOwnCrops((l) => [...l.filter((c) => c.id !== crop.id), crop]);
            if (ha !== null) setHectares((x) => ({ ...x, [crop.id]: haText(ha) }));
            setOwn(null);
          }}
        />
      )}
    </>
  );
}

/* ---- A crop of the farmer's own (P30) ---- */
function OwnSheet({ crop: c, line, known, count, areaHa, onClose, onDone }: { crop: OwnCrop | null; line?: CatalogueCrop; known: string[]; count: number; areaHa: number | null; onClose: () => void; onDone: (crop: OwnCrop, ha: number | null) => void }) {
  /* Picked from the APIA list: named as APIA names it, and the code is kept. */
  const apiaCode = c?.apiaCode ?? line?.code;
  const [f, setF] = useState({
    name: c?.name ?? line?.name_ro ?? '',
    ha: '',
    sow: c ? String(c.sowingMonth) : '',
    harvest: c ? String(c.harvestMonth) : '',
    yieldT: decimalText(c?.yieldTPerHa),
    bad: decimalText(c?.badYieldTPerHa),
    price: decimalText(c?.priceLeiPerKg),
    cSow: c ? group(c.costs.sowingLeiPerHa) : '',
    cCare: c ? group(c.costs.careLeiPerHa) : '',
    cHarvest: c ? group(c.costs.harvestLeiPerHa) : '',
  });
  const [err, setErr] = useState<string | null>(null);
  /* Yields and costs are kept per hectare and open that way; typed for the whole crop, they're split by its hectares. */
  const [units, setUnits] = useState<{ y: Basis; c: Basis }>({ y: 'ha', c: 'ha' });
  const ari = Math.round(((c ? areaHa : decimalOrNull(f.ha)) ?? 0) * 100);
  const noArea = ari > 0 ? null : c ? 'Cultura nu are hectare în recolta asta.' : 'Scrie întâi hectarele.';
  const flipGroup = (which: 'y' | 'c', to: Basis) => {
    const keys = which === 'y' ? (['yieldT', 'bad'] as const) : (['cSow', 'cCare', 'cHarvest'] as const);
    setF((x) => ({ ...x, ...Object.fromEntries(keys.map((k) => [k, flipText(x[k], which === 'y' ? 'tonnes' : 'lei', units[which], ari)])) }));
    setUnits((u) => ({ ...u, [which]: to }));
  };
  /* Typed for the whole crop and then the hectares cleared, a figure reads as unusable, never as per hectare. */
  const { y: yUnit, c: cUnit } = units;
  const costOf = (text: string) => (text.trim() === '' ? 0 : leiPerHaFrom(text, cUnit, ari));
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value })) });
  const months = (
    <>
      <option value="">Alege luna</option>
      {MONTH_WORDS.map((m, i) => (
        <option key={m} value={i + 1}>
          {m}
        </option>
      ))}
    </>
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const name = f.name.trim().replace(/\s+/g, ' ');
    const ha = Math.round((decimalOrNull(f.ha) ?? 0) * 100) / 100;
    const sow = +f.sow;
    const harvest = +f.harvest;
    const yieldT = tPerHaFrom(f.yieldT, yUnit, ari);
    const badText = f.bad.trim();
    const bad = badText === '' ? null : tPerHaFrom(badText, yUnit, ari);
    const price = decimalOrNull(f.price);
    const costs = { sowingLeiPerHa: costOf(f.cSow), careLeiPerHa: costOf(f.cCare), harvestLeiPerHa: costOf(f.cHarvest) };
    if (!name) return setErr('Scrie numele culturii.');
    if (known.some((n) => plain(n) === plain(name))) return setErr(`${name} e deja în listă.`);
    if (!c && !(ha > 0)) return setErr('Scrie câte hectare are.');
    if (!sow || !harvest) return setErr('Alege luna semănatului și luna recoltei.');
    if (sow === harvest) return setErr('Recolta trebuie să fie în altă lună decât semănatul.');
    if (!(yieldT !== null && yieldT > 0)) return setErr('Scrie câte tone scoți la hectar într-un an normal, de exemplu 4,5.');
    if (badText !== '' && !(bad !== null && bad > 0 && bad <= yieldT)) return setErr('Anul slab dă cel mult cât anul normal. Lasă gol dacă nu știi.');
    if (!(price !== null && price > 0)) return setErr('Scrie prețul pe kilogram, de exemplu 0,9.');
    if (Object.values(costs).some((v) => v === null)) return setErr('Scrie cheltuielile în lei întregi, sau 0.');
    if (!c && count >= MAX_OWN_CROPS) return setErr('Poți adăuga cel mult 20 de culturi.');
    const crop = { id: c?.id ?? newOwnId(name), name, ...(apiaCode ? { apiaCode } : {}), yieldTPerHa: yieldT, badYieldTPerHa: bad, priceLeiPerKg: price, costs, sowingMonth: sow, harvestMonth: harvest };
    if (!OwnCropSchema.safeParse(crop).success) return setErr('Verifică cifrele.');
    onDone(crop as OwnCrop, c ? null : ha);
  };
  const field = (labelText: string, k: keyof typeof f, extra: Record<string, unknown> = {}): ReactNode => (
    <label className="ob-field">
      {labelText}
      <input autoComplete="off" {...extra} {...bind(k)} />
    </label>
  );
  return (
    <Sheet open onClose={onClose} className="h-sheet" label={c ? c.name : (line?.name_ro ?? 'Altă cultură')} keepOnBackdrop>
      <form noValidate onSubmit={submit}>
        <h2>{c ? c.name : (line?.name_ro ?? 'Altă cultură')}</h2>
        {apiaCode !== undefined && <p className="note">Cod APIA {apiaCode}. Pentru ea nu avem încă costuri și prețuri.</p>}
        <p className="note">Scrie cifrele tale pentru un an normal. Le folosim pentru salariu și prognoză. La APIA o socotim teren arabil.</p>
        {field('Numele culturii', 'name', { maxLength: 120 })}
        {!c && field('Hectare', 'ha', { inputMode: 'decimal' })}
        <div className="own-pair">
          <label className="ob-field">
            Luna semănatului
            <select {...bind('sow')}>{months}</select>
          </label>{' '}
          <label className="ob-field">
            Luna recoltei
            <select {...bind('harvest')}>{months}</select>
          </label>
        </div>
        <div className="basis-row">
          <p className="own-h">Producția</p>
          <BasisSwitch kind="tonnes" basis={yUnit} onChange={(b) => flipGroup('y', b)} label="Producția: tone sau tone la hectar" why={noArea} />
        </div>
        <div className="own-pair">
          {field(yUnit === 'ha' ? 'Tone/ha, an normal' : 'Tone, an normal', 'yieldT', { inputMode: 'decimal' })}
          {field(yUnit === 'ha' ? 'Tone/ha, an slab' : 'Tone, an slab', 'bad', { inputMode: 'decimal', placeholder: 'Nu știu' })}
        </div>
        {yUnit === 'total' && <BasisEcho text={f.yieldT} kind="tonnes" basis="total" ari={ari} saved="ha" />}
        {field('Preț, lei/kg', 'price', { inputMode: 'decimal' })}
        <div className="basis-row">
          <p className="own-h">{cUnit === 'ha' ? 'Cheltuieli pe hectar, în lei' : 'Cheltuieli pe toată cultura, în lei'}</p>
          <BasisSwitch basis={cUnit} onChange={(b) => flipGroup('c', b)} label="Cheltuielile: total sau pe hectar" why={noArea} />
        </div>
        <div className="own-three">
          {field('La semănat', 'cSow', { inputMode: 'numeric', placeholder: '0' })}
          {field('Până la recoltă', 'cCare', { inputMode: 'numeric', placeholder: '0' })}
          {field('La recoltat', 'cHarvest', { inputMode: 'numeric', placeholder: '0' })}
        </div>
        <ErrorLine>{err}</ErrorLine>
        <div className="ob-actions">
          <button type="submit" className="btn btn-dark">
            Gata
          </button>
          <button type="button" className="btn btn-line" onClick={onClose}>
            Renunță
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function ConfirmSheet({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  const [text, setText] = useState(ask.text);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    await ask.run(setText);
    setBusy(false);
  };
  return (
    <Sheet open onClose={onClose} className="h-sheet" label={ask.title} locked={busy}>
      <h2>{ask.title}</h2>
      <p className="note">{text}</p>
      <div className="ob-actions">
        <button type="button" className="btn btn-dark" disabled={busy} aria-busy={busy || undefined} onClick={() => void confirm()}>
          {ask.yes}
        </button>
        <button type="button" className="btn btn-line" disabled={busy} onClick={onClose}>
          Renunță
        </button>
      </div>
    </Sheet>
  );
}
