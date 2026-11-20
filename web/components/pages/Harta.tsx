'use client';
/* „Harta”: the farm's parcels as a list beside the map (docs/harta-plan.md, step 8). A row or a parcel on
   the map opens its card; the map flies there. „Pe culturi” groups the same parcels by crop. Filters and
   the open card live in the address, so Back closes the card and a filtered view can be shared.
   Offline: the parcels come from the last copy on the phone, so the list, the filters and the cards work;
   the map draws the parcels on a plain background. Ion's farm shows his two real blocs. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Crop } from '../../../packages/shared/src/data/index';
import {
  buildPlotRows,
  cropKeyOf,
  filterPlots,
  loadPlotsParams,
  sortPlots,
  type PaperPlot,
  type PlotInput,
  type LpisBloc,
  type LpisTile,
  type PlotRow,
  type Position,
  type TodoItem,
} from '../../../packages/shared/src/plots/index';
import { farmTransactions } from '../../lib/cc/farm-plots';
import { date } from '../../lib/cc/format';
import { useFarm, useStore, useView } from '../../lib/cc/react';
import { publicConfig } from '../../lib/live/index';
import { newIntentKey } from '../../lib/live/intent';
import { Sheet } from '../app/bits';
import { EventSheet } from '../app/EventSheet';
import { NetButton } from '../app/bits';
import { usePapers } from '../app/Papers';
import { FarmMapLazy } from '../map/FarmMapLazy';
import type { FarmMapHandle } from '../map/FarmMap';
import { ShapeEditor, type ShapeEditorResult } from '../map/ShapeEditor';
import { Bone } from '../skeleton/Bone';
import { PlotCard, type CardWrites } from '../plots/PlotCard';
import { PlotExpenseSheet } from '../plots/PlotExpenseSheet';
import { PlotFilters } from '../plots/PlotFilters';
import { PlotList } from '../plots/PlotList';
import { NewPlotSheet, type NewPlotCrop } from '../plots/NewPlotSheet';
import { PlotsReview } from '../plots/PlotsReview';
import { plotName } from '../plots/plot-text';
import { useLocatedRows } from '../plots/useLocatedRows';
import { usePlotQuery } from '../plots/usePlotQuery';
import { usePlots } from '../plots/usePlots';
import { placeName, plotPlace } from '../../lib/cc/places';
import { blocsInTile } from '../../lib/cc/lpis';
import '../../styles/harta.css';

const PARAMS = loadPlotsParams();
const SOON_DAYS = PARAMS.todo_soon_days.value;
/** The address key of the open card. */
export const PLOT_KEY = 'parcela';
const CERERE_PAGES = 'Fă poze la paginile cu tabelul de parcele (II.A). De celelalte pagini nu avem nevoie.';
const WIDE = '(min-width: 900px)';


const readSelected = () => (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get(PLOT_KEY));

/** The address with the card's key set or removed; the other keys stay. */
export function withPlot(href: string, id: string | null): string {
  const url = new URL(href);
  if (id) url.searchParams.set(PLOT_KEY, id);
  else url.searchParams.delete(PLOT_KEY);
  return url.pathname + url.search.replace(/%2C/g, ',') + url.hash;
}

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = matchMedia?.(WIDE);
    if (!m) return;
    const on = () => setWide(m.matches);
    on();
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return wide;
}

export default function Harta() {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const store = useStore()!;
  const papers = usePapers();
  const query = usePlotQuery();
  const today = view.today;
  const baseYear = view.baseYear;
  const year = query.view.year ?? baseYear;
  const loaded = usePlots(year);
  const data = view.data();
  const cropList = data.crops.crops as Crop[];
  const crops = useMemo(() => new Map(cropList.map((c) => [c.id, c])), [cropList]);
  const cropName = view.cropName;
  const writes: CardWrites = farm.me ? 'yes' : farm.isIon ? 'ion' : 'phone';
  const wide = useWide();
  const map = useRef<FarmMapHandle>(null);

  /* ---- Rows: every parcel of the year, then the filtered and sorted list. ---- */
  const plannedMonths = useMemo(() => Object.fromEntries((farm.baseFarm?.parcels ?? []).map((p) => [p.cropId, p.plantedMonth ?? null])), [farm.baseFarm]);
  const transactions = useMemo(() => farmTransactions(farm.me, farm.harvests?.items), [farm.me, farm.harvests]);
  const rows = useMemo(() => {
    const p = loaded.plots;
    if (!p) return [];
    return buildPlotRows({ year, today, plots: p.plots, seasons: p.seasons, operations: p.operations, transactions, crops: cropList, plannedMonths });
  }, [loaded.plots, year, today, transactions, cropList, plannedMonths]);
  const years = useMemo(() => [...new Set([baseYear, ...(loaded.plots?.seasons ?? []).map((s) => s.harvest_year)])].sort((a, b) => b - a), [loaded.plots, baseYear]);
  const shown = useMemo(() => sortPlots(filterPlots(rows, query.filters, today, SOON_DAYS), query.view.sort, query.view.dir), [rows, query.filters, query.view.sort, query.view.dir, today]);
  const shownIds = useMemo(() => new Set(shown.map((r) => r.plot.id)), [shown]);
  const dimmedIds = useMemo(() => rows.filter((r) => !shownIds.has(r.plot.id)).map((r) => r.plot.id), [rows, shownIds]);

  /* ---- The open card, kept in the address. Opening adds a history step, so Back closes it. ---- */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cropId, setCropId] = useState<string | null>(null);
  const pushed = useRef(false);
  /* The parcel the map last flew to, so a card opened from the address flies there once the parcels are in. */
  const flownFor = useRef<string | null>(null);
  useEffect(() => {
    setSelectedId(readSelected());
    const back = () => {
      setSelectedId(readSelected());
      pushed.current = false;
    };
    addEventListener('popstate', back);
    return () => removeEventListener('popstate', back);
  }, []);
  const selected = rows.find((r) => r.plot.id === selectedId) ?? null;
  const flyTo = useCallback((row: PlotRow | undefined) => {
    if (row && (row.plot.geometry || row.plot.centroid_lat !== null)) map.current?.flyToPlot(row.plot.id);
  }, []);
  const select = useCallback(
    (id: string | null) => {
      if (id === null) {
        if (pushed.current) history.back();
        else history.replaceState(history.state, '', withPlot(location.href, null));
        pushed.current = false;
        setSelectedId(null);
        return;
      }
      const next = withPlot(location.href, id);
      if (readSelected()) history.replaceState(history.state, '', next);
      else {
        history.pushState({ ccPlot: id }, '', next);
        pushed.current = true;
      }
      setSelectedId(id);
      setCropId(null);
    },
    [],
  );
  /* Fly once the card is drawn, so the map already leaves room for it; also for a card opened from the address. */
  useEffect(() => {
    if (!selected) {
      // Closed: the same parcel picked again flies again.
      if (!selectedId) flownFor.current = null;
      return;
    }
    if (flownFor.current === selected.plot.id) return;
    flownFor.current = selected.plot.id;
    flyTo(selected);
  }, [selected, selectedId, flyTo]);
  /* The card's heading takes the focus, so a screen reader starts there. */
  useEffect(() => {
    if (selectedId) document.getElementById('pc-title')?.focus({ preventScroll: !wide });
  }, [selectedId, wide]);

  const pickCrop = (id: string | null) => {
    setCropId(id);
    if (!id) return map.current?.fitPlots([...shownIds]);
    map.current?.fitPlots(shown.filter((r) => r.season && cropKeyOf(r) === id).map((r) => r.plot.id));
  };
  /* New filters: the map shows what's left. */
  const filterSig = JSON.stringify(query.filters);
  const lastSig = useRef(filterSig);
  useEffect(() => {
    if (lastSig.current === filterSig) return;
    lastSig.current = filterSig;
    if (!selectedId) map.current?.fitPlots([...shownIds]);
  }, [filterSig, selectedId, shownIds]);

  /* ---- Writes from the card. ---- */
  const [sheet, setSheet] = useState<'work' | 'expense' | 'draw' | null>(null);
  async function markDone(item: TodoItem) {
    if (!selected) return;
    await store.send(({ write }) =>
      item.operationId
        ? write('update_operation', { id: item.operationId, status: 'done', onDate: today })
        : write('add_operation', { plotId: selected.plot.id, harvestYear: year, kind: item.kind, status: 'done', onDate: today, templateId: item.templateId, clientId: newIntentKey() }),
    );
    loaded.reload();
  }
  const [drawErr, setDrawErr] = useState<string | null>(null);
  async function saveDrawing(r: ShapeEditorResult) {
    if (!selected) return;
    setDrawErr(null);
    try {
      await store.send(({ write }) => write('update_plot', { id: selected.plot.id, harvestYear: year, plot: { shape: r.shape, geometry: r.geometry, geometrySource: 'drawn' } }));
      setSheet(null);
      loaded.reload();
    } catch {
      setDrawErr('Nu am putut salva desenul. Încearcă din nou.');
    }
  }

  /* ---- Parcels from the cerere de plată (step 2's review sheet). ---- */
  const [review, setReview] = useState<{ year: number; plots: PaperPlot[]; totalAri: number | null } | null>(null);
  const [paperNote, setPaperNote] = useState<string | null>(null);
  const located = useLocatedRows(review?.plots ?? null);
  async function readCerere() {
    setPaperNote(null);
    const r = await papers.pick({ accepts: ['apia_cerere'], pages: true, hint: CERERE_PAGES, seen: { apia_decizie: 'Asta e decizia de plată. Aici ne trebuie cererea, cu tabelul de parcele.' } });
    if (!r) return;
    if (!r.plots?.length) return setPaperNote('Nu am găsit tabelul cu parcele (II.A) pe pozele astea. Fă poze și la paginile cu tabelul.');
    setReview({ year: r.year ?? year, plots: r.plots, totalAri: r.totalAri });
  }
  async function savePaper(harvestYear: number, inputs: PlotInput[]) {
    const key = newIntentKey();
    await store.send(({ write }) => write('save_plots', { harvestYear, plots: inputs }, { key }));
    loaded.reload();
  }

  /* ---- A new parcel drawn by hand. ---- */
  const [drawNew, setDrawNew] = useState<{ cropId: string | null; start: { centre: Position; zoom: number } | null; bloc: LpisBloc | null } | null>(null);
  /* „Blocuri APIA” as outlines to tap: only on a farm of one's own, since the API needs an account. */
  const live = store.live;
  const loadBlocTile = useCallback((t: LpisTile) => blocsInTile(live, t), [live]);
  const newPlotCrops = useMemo<NewPlotCrop[]>(() => {
    const unplaced = new Map<string, number>();
    const ids = new Set((farm.baseFarm?.parcels ?? []).map((p) => p.cropId));
    for (const r of rows) {
      const c = r.season?.crop_id;
      if (!c) continue;
      ids.add(c);
      if (r.plot.auto_crop_id) unplaced.set(c, (unplaced.get(c) ?? 0) + r.season!.area_ari);
    }
    return [...ids].map((id) => ({ id, name: cropName(id), unplacedAri: unplaced.get(id) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  }, [rows, farm.baseFarm, cropName]);
  const openDrawNew = (cropId: string | null, bloc: LpisBloc | null = null) => setDrawNew({ cropId, start: map.current?.view() ?? null, bloc });
  async function saveNewPlot(input: PlotInput): Promise<string | null> {
    let ids: string[] = [];
    const key = newIntentKey();
    await store.send(async ({ write }) => {
      ids = ((await write('save_plots', { harvestYear: year, plots: [input] }, { key })) as { ids?: string[] } | undefined)?.ids ?? [];
    });
    return ids[0] ?? null;
  }
  /* The sheet goes Back out of its own history step as it closes. Open the new parcel's card after that,
     or the step back would land on the card the sheet was opened from. */
  function openAfterSheet(id: string) {
    let done = false;
    const open = () => {
      if (done) return;
      done = true;
      removeEventListener('popstate', open);
      select(id);
    };
    addEventListener('popstate', open);
    setTimeout(open, 400);
  }

  const placed = rows.filter((r) => r.plot.geometry || r.plot.centroid_lat !== null).length;
  const cardOver = wide && !!selected;
  const [tall, setTall] = useState(false);

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Harta</h1>
          <p className="lead">Unde e fiecare parcelă, ce crește pe ea, ce lucrări mai ai de făcut și cât te-a costat.</p>
        </div>
        {writes === 'yes' && (
          <div className="hm-head-act">
            <NetButton className="btn btn-line" reason="Ca să citim cererea ai nevoie de internet." onClick={() => void readCerere()}>
              Adaugă parcele din cererea APIA
            </NetButton>
            <button type="button" className="btn btn-line" onClick={() => openDrawNew(null)}>
              Desenează o parcelă
            </button>
          </div>
        )}
      </header>
      {paperNote && <p className="note">{paperNote}</p>}
      {loaded.copyAt && <p className="note">Fără internet. Arătăm parcelele așa cum erau pe {date(loaded.copyAt.slice(0, 10), true)}.</p>}
      {farm.isIon && <p className="note">Blocurile fizice ale lui Ion sunt reale, din harta APIA (Măldăeni, Teleorman). Restul e un exemplu.</p>}

      {rows.length > 0 && (
        <PlotFilters
          rows={rows}
          filters={query.filters}
          view={query.view}
          onFilters={query.setFilters}
          onView={query.setView}
          names={{ cropName, placeName, soonDays: SOON_DAYS }}
          today={today}
          years={years}
          year={baseYear}
        />
      )}

      <div className={`hm${cardOver ? ' card-open' : ''}${tall ? ' tall' : ''}`}>
        <div className="hm-map">
          <FarmMapLazy
            ref={map}
            rows={rows}
            crops={cropList}
            selectedIds={selected ? [selected.plot.id] : cropId ? shown.filter((r) => r.season && cropKeyOf(r) === cropId).map((r) => r.plot.id) : []}
            dimmedIds={dimmedIds}
            onSelect={(id) => (id ? select(id) : selectedId && select(null))}
            mode="full"
            intro
            names={{ cropName, plotTitle: (r) => plotName(r.plot, cropName) }}
            today={today}
            soonDays={SOON_DAYS}
            satelliteKey={publicConfig().maptilerKey ?? null}
            padding={cardOver ? { top: 40, right: 40, bottom: 40, left: 420 } : undefined}
            onDrawNew={writes === 'yes' ? (bloc) => openDrawNew(null, bloc ?? null) : undefined}
            loadBlocTile={writes === 'yes' ? loadBlocTile : undefined}
          />
          {!loaded.loading && rows.length > 0 && placed === 0 && <p className="hm-empty">Nicio parcelă nu are încă loc pe hartă.</p>}
        </div>

        <aside className="hm-side" aria-label={selected ? 'Fișa parcelei' : 'Parcelele'}>
          <button type="button" className="hm-grip" aria-expanded={tall} onClick={() => setTall((t) => !t)}>
            <span aria-hidden="true" />
            {tall ? 'Arată mai mult din hartă' : 'Arată mai mult din listă'}
          </button>
          {selected ? (
            <PlotCard
              row={selected}
              history={(loaded.plots?.seasons ?? []).filter((s) => s.plot_id === selected.plot.id)}
              crops={crops}
              cropName={cropName}
              place={plotPlace(selected.plot)}
              today={today}
              writes={writes}
              onClose={() => select(null)}
              onAddWork={() => setSheet('work')}
              onExpense={() => setSheet('expense')}
              onDraw={() => setSheet('draw')}
              onDrawNew={() => openDrawNew(selected.plot.auto_crop_id ?? selected.season?.crop_id ?? null)}
              onMarkDone={markDone}
              onCerere={() => void readCerere()}
            />
          ) : loaded.loading ? (
            <div className="pl-list" aria-busy="true" aria-label="Se încarcă parcelele">
              {[0, 1, 2].map((i) => (
                <div key={i} className="pl-row sk">
                  <Bone w={40} h={40} r={12} />
                  <span className="pl-main">
                    <Bone w="60%" />
                    <Bone w="40%" h={11} />
                  </span>
                </div>
              ))}
            </div>
          ) : loaded.failed ? (
            <div className="hm-msg">
              <p>Nu am putut aduce parcelele acum.</p>
              <button type="button" className="btn btn-line" onClick={loaded.reload}>
                Încearcă din nou
              </button>
            </div>
          ) : !rows.length ? (
            <div className="hm-msg">
              <p>{loaded.plots ? 'Nu ai încă parcele.' : 'Parcelele se văd când ai internet prima dată.'}</p>
              {writes === 'yes' && loaded.plots && <p>Pune-le din cererea de plată APIA: citim tabelul cu parcele și găsim blocurile pe hartă.</p>}
            </div>
          ) : !shown.length ? (
            <div className="hm-msg">
              <p>Nicio parcelă nu se potrivește cu filtrele.</p>
              <button type="button" className="btn btn-line" onClick={() => query.setFilters({})}>
                Șterge filtrele
              </button>
            </div>
          ) : (
            <PlotList rows={shown} byCrop={query.view.byCrop} crops={crops} cropName={cropName} today={today} selectedId={selectedId} cropId={cropId} onSelect={select} onCrop={pickCrop} />
          )}
        </aside>
      </div>

      {selected && writes === 'yes' && (
        <>
          <EventSheet open={sheet === 'work'} onClose={() => setSheet(null)} plotId={selected.plot.id} onSaved={loaded.reload} />
          <PlotExpenseSheet
            open={sheet === 'expense'}
            onClose={() => setSheet(null)}
            plotId={selected.plot.id}
            plotTitle={plotName(selected.plot, cropName)}
            cropId={selected.season?.crop_id ?? null}
            harvestYear={year}
            today={today}
            onSaved={() => undefined}
          />
          <Sheet open={sheet === 'draw'} onClose={() => setSheet(null)} className="detail se-sheet" label="Desenează parcela" keepOnBackdrop>
            {sheet === 'draw' && (
              <>
                <ShapeEditor
                  title={plotName(selected.plot, cropName)}
                  bloc={selected.plot.geometry_source === 'lpis' ? selected.plot.geometry : null}
                  initial={selected.plot.shape ?? null}
                  declaredAri={selected.season?.area_ari ?? null}
                  onDone={(r) => void saveDrawing(r)}
                  onCancel={() => setSheet(null)}
                />
                {drawErr && (
                  <p className="ob-err" role="alert">
                    {drawErr}
                  </p>
                )}
              </>
            )}
          </Sheet>
        </>
      )}
      {writes === 'yes' && (
        <NewPlotSheet
          open={!!drawNew}
          onClose={() => setDrawNew(null)}
          crops={newPlotCrops}
          cropId={drawNew?.cropId ?? null}
          county={farm.me?.county ?? ''}
          harvestYear={year}
          planYear={year === baseYear}
          start={drawNew?.start ?? null}
          bloc={drawNew?.bloc ?? null}
          onSave={saveNewPlot}
          onSaved={(id) => {
            loaded.reload();
            if (id) openAfterSheet(id);
          }}
        />
      )}
      {review && (
        <PlotsReview
          open
          onClose={() => setReview(null)}
          year={review.year}
          plots={review.plots}
          totalAri={review.totalAri}
          existing={loaded.plots?.plots ?? []}
          minOverlap={PARAMS.match_overlap_min.value}
          located={located}
          county={farm.me?.county ?? ''}
          cropName={cropName}
          onSave={savePaper}
        />
      )}
    </>
  );
}
