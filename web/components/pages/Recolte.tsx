'use client';
/* "Recolte": what was gathered, what's in the ground and what was noted, for the chosen project (was
   web/legacy/recolte.js). The harvest button at the top switches project. A closed project shows its
   result instead. On Ion's farm everything stays on the phone. On a real farm a sale or expense goes
   through the outbox, so it works offline; changing crops or closing a harvest needs internet.
   Nothing noted here moves money, it only records what already happened. */
import { useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isOwnCrop, OwnCropSchema, type OwnCrop } from '../../../packages/shared/src/farm/index';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import { date, exact, failText, group, MONTHS } from '../../lib/cc/format';
import { harvestMonth, harvestName, projectClosed, type Harvest, type HarvestParcel, type HarvestState } from '../../lib/cc/harvests';
import { reopenProject } from '../../lib/cc/plan';
import { useFarm, useMoney, useOnline, useStore, useView } from '../../lib/cc/react';
import { newIntentKey } from '../../lib/live/intent';
import { decimalText, gatheredHint, isSown, isUsualMonth, monthLabel, plantedHint, readGathered, sowingChoices, usualPlanting, usualTonnes, type Crop, type GatheredText } from '../../lib/ui/seasons';
import { AmountEcho, ErrorLine, OfflineNote, Sheet } from '../app/bits';
import { FrameContext } from '../app/context';
import { useSaved } from '../app/useSaved';
import { CompareTable, FutureNote } from '../app/PageNotes';
import { PaperButton, usePapers } from '../app/Papers';

const CATEGORIES: [string, string][] = [
  ['seeds', 'Sămânță'],
  ['fertilizer', 'Îngrășăminte'],
  ['treatments', 'Tratamente'],
  ['diesel', 'Motorină'],
  ['field_work', 'Lucrări'],
  ['repairs', 'Reparații'],
  ['rent', 'Arendă'],
  ['other', 'Altele'],
];
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
function newOwnId(name: string) {
  const slug = plain(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'cultura';
  return `own-${slug}-${Date.now().toString(36)}`;
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
  const { notify } = useContext(FrameContext);
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
  const [day, setDay] = useState(TODAY);
  const [paperNote, setPaperNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [allRecords, setAllRecords] = useState(false);
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
    if (!r.amountBani) unread.push('suma');
    if (r.date && r.date >= firstDay && r.date <= TODAY) setDay(r.date);
    else unread.push('data');
    const options = whatOptions(k);
    const pick = k === 'sale' ? r.cropId : r.category;
    if (pick && options.some(([v]) => v === pick)) setWhat(pick);
    else {
      setWhat(options[0]?.[0] ?? '');
      unread.push(k === 'sale' ? 'cultura' : 'pe ce s-a cheltuit');
    }
    setPaperNote(unread.length ? `Am completat ce am putut. Verifică ${unread.join(', ')}, apoi apasă Salvează.` : 'Am completat de pe hârtie. Verifică și apasă Salvează.');
  }

  /* One id per record the farmer means to save. "Salvează" again after an error sends the same record
     with the same id, so the server keeps it once even if the first try got through. A changed amount,
     date or crop is another record and gets a new id. */
  const intent = useRef<{ sig: string | null; key: string | null }>({ sig: null, key: null });
  const intentKeyFor = (name: string, input: unknown) => {
    const sig = JSON.stringify([name, input]);
    if (intent.current.sig !== sig) intent.current = { sig, key: newIntentKey() };
    return intent.current.key!;
  };
  /** The server already has the whole document, so only this one change needs sending. */
  async function sendRecord(name: string, input: Record<string, unknown>, onDone: () => void, title: string) {
    if (sending.current) return;
    sending.current = true;
    try {
      await saved(title, () => store.send(({ write }) => write(name, input)));
      onDone?.();
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
    setErr(null);
    changeKind('sale');
    intent.current = { sig: null, key: null };
  };
  function submitRecord(e: FormEvent) {
    e.preventDefault();
    const lei = parseWholeLei(amount);
    if (lei === null || lei <= 0) return setErr(`Scrie suma în lei întregi, de exemplu ${group(12500)}.`);
    if (!day || day < firstDay || day > TODAY) return setErr(`Alege o zi între ${date(firstDay, true)} și azi.`);
    const target = forCrop && kind === 'expense' ? { cropId: forCrop } : {};
    const noted = kind === 'sale' ? 'Am notat vânzarea' : 'Am notat cheltuiala';
    setErr(null);
    if (onServer) {
      const [name, input]: [string, Record<string, unknown>] =
        kind === 'sale' ? ['record_sale', { cropId: what, date: day, totalLei: lei, harvestYear: h.year }] : ['add_expense', { category: what, amountLei: lei, date: day, harvestYear: h.year, ...target }];
      return void sendRecord(name, { ...input, clientId: intentKeyFor(name, input) }, resetForm, noted);
    }
    const base = { id: `n${Date.now()}`, date: day };
    void save(
      (draft) => {
        const hd = draft.items.find((x) => x.id === h.id)!;
        if (kind === 'sale') hd.records.push({ ...base, kind: 'sale', cropId: what, amountBani: lei * 100 } as Harvest['records'][number]);
        else hd.records.push({ ...base, kind: 'expense', category: what, amountBani: -lei * 100, ...target } as Harvest['records'][number]);
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

  const label = (r: Harvest['records'][number]) => (r.kind === 'sale' ? `Vânzare: ${cropName(r.cropId!)}` : r.kind === 'expense' ? (CATEGORIES.find(([k]) => k === r.category)?.[1] ?? 'Cheltuială') : APIA.find(([k]) => k === r.kind)?.[1]);
  const sorted = shownRecords.filter((r) => !hidden.has(r.id)).sort((a, b) => b.date.localeCompare(a.date));
  const shown = allRecords ? sorted : sorted.slice(0, LATEST);

  /* ---- The sheets ---- */
  const [sheet, setSheet] = useState<null | 'gathered' | 'planted'>(null);
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
  const closeHarvest = () =>
    setAsk({
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
                    return <CropRow key={p.cropId} name={`${cropName(p.cropId)}, ${haText(p.areaHa)} ha`} detail={plantedHint(crop, p.plantedMonth, NOW)} tag={sown ? 'În pământ' : 'De semănat'} tone={sown ? 'ok' : 'n'} />;
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
                      {h.parcels.map((p) => (
                        <option key={p.cropId} value={p.cropId}>
                          {cropName(p.cropId)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}{' '}
                <label>
                  Suma, în lei
                  <input inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <AmountEcho text={amount} />
                </label>{' '}
                <label>
                  Data
                  <input type="date" min={firstDay} max={TODAY} value={day} onChange={(e) => setDay(e.target.value)} />
                </label>{' '}
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
      {edit && <EditSheet target={edit.target} save={save} onClose={() => setEdit(null)} />}
      {ask && <ConfirmSheet ask={ask} onClose={() => setAsk(null)} />}
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
  const crops = (cropId ? [cropId] : [...new Set([...h.parcels.map((p) => p.cropId), ...state.gathered.map((g) => g.cropId)])]).map((id) => view.baseData().crops.crops.find((c) => c.id === id) as Crop);
  const [texts, setTexts] = useState<Record<string, GatheredText>>(() =>
    Object.fromEntries(
      crops.map((c) => {
        const g = state.gathered.find((x) => x.cropId === c.id);
        const area = g?.areaHa ?? h.parcels.find((p) => p.cropId === c.id)?.areaHa ?? null;
        return [c.id, { areaHa: decimalText(area), tonnes: decimalText(g?.tonnes), priceLeiPerKg: decimalText(g?.priceLeiPerKg), storedTonnes: decimalText(g?.storedTonnes) }];
      }),
    ),
  );
  const [err, setErr] = useState<string | null>(null);
  const set = (id: string, f: keyof GatheredText, v: string) => setTexts((x) => ({ ...x, [id]: { ...x[id], [f]: v } }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const out = readGathered(crops.map((crop) => ({ crop, text: texts[crop.id] })), NOW);
    if ('error' in out) return setErr(out.error);
    setErr(null);
    void save((d) => void (d.gathered = [...d.gathered.filter((g) => !out.rows.some((r) => r.cropId === g.cropId)), ...out.filled] as HarvestState['gathered']), setErr, onClose);
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
                <div className="ob-grid">
                  {field('areaHa', 'Hectare')}
                  {field('tonnes', 'Câte tone ai strâns?', usualTonnes(c, decimalOrNull(x.areaHa)))}
                  {field('priceLeiPerKg', 'Cu cât ai vândut, în lei/kg?', `media: ${decimalText(c.price_lei_per_kg.mean)}`)}
                  {field('storedTonnes', 'Câte tone mai ai în hambar?', '0')}
                </div>
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

/* ---- What's in the ground ---- */
function PlantedSheet({ save, onClose }: { save: Saver; onClose: () => void }) {
  const view = useView('picked')!;
  const h = view.selected;
  const cropId = view.crop?.id ?? null;
  const NOW = view.today.slice(0, 7);
  const parcels = cropId ? h.parcels.filter((p) => p.cropId === cropId) : h.parcels;
  const cropOf = (id: string) => view.baseData().crops.crops.find((c) => c.id === id) as Crop;
  const [picked, setPicked] = useState<Record<string, string>>(() => Object.fromEntries(parcels.map((p) => [p.cropId, p.plantedMonth || usualPlanting(cropOf(p.cropId), NOW)])));
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save(
      (d) => {
        const hd = d.items.find((x) => x.id === h.id)!;
        hd.parcels = hd.parcels.map((x) => {
          if (!(x.cropId in picked)) return x;
          const { plantedMonth: _old, ...p } = x;
          return picked[p.cropId] ? { ...p, plantedMonth: picked[p.cropId] } : p;
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
  const [own, setOwn] = useState<{ crop: OwnCrop | null } | null>(null);
  /* A crop described in this visit isn't in the page's data yet, so its name comes from the form. */
  const ownOf = (id: string) => ownCrops.find((c) => c.id === id);
  const nameOf = (id: string) => ownOf(id)?.name || view.cropName(id) || '';
  const rows = [...crops.map((c) => ({ id: c.id })), ...ownCrops.filter((o) => !crops.some((c) => c.id === o.id)).map((o) => ({ id: o.id }))];
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
          known={[...crops.map((c) => c.name_ro), ...ownCrops.filter((c) => c.id !== own.crop?.id).map((c) => c.name)]}
          count={ownCrops.length}
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
function OwnSheet({ crop: c, known, count, onClose, onDone }: { crop: OwnCrop | null; known: string[]; count: number; onClose: () => void; onDone: (crop: OwnCrop, ha: number | null) => void }) {
  const [f, setF] = useState({
    name: c?.name ?? '',
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
    const yieldT = decimalOrNull(f.yieldT);
    const badText = f.bad.trim();
    const bad = badText === '' ? null : decimalOrNull(badText);
    const price = decimalOrNull(f.price);
    const costs = { sowingLeiPerHa: leiOrNull(f.cSow), careLeiPerHa: leiOrNull(f.cCare), harvestLeiPerHa: leiOrNull(f.cHarvest) };
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
    const crop = { id: c?.id ?? newOwnId(name), name, yieldTPerHa: yieldT, badYieldTPerHa: bad, priceLeiPerKg: price, costs, sowingMonth: sow, harvestMonth: harvest };
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
    <Sheet open onClose={onClose} className="h-sheet" label={c ? c.name : 'Altă cultură'} keepOnBackdrop>
      <form noValidate onSubmit={submit}>
        <h2>{c ? c.name : 'Altă cultură'}</h2>
        <p className="note">Scrie cifrele tale pentru un an normal. Le folosim pentru salariu și prognoză. La APIA o socotim teren arabil.</p>
        {field('Numele culturii', 'name', { maxLength: 40 })}
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
        <div className="own-pair">
          {field('Tone/ha, an normal', 'yieldT', { inputMode: 'decimal' })}
          {field('Tone/ha, an slab', 'bad', { inputMode: 'decimal', placeholder: 'Nu știu' })}
        </div>
        {field('Preț, lei/kg', 'price', { inputMode: 'decimal' })}
        <p className="own-h">Cheltuieli pe hectar, în lei</p>
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
