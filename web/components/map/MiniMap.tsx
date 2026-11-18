'use client';
/* The corner map on every app page (docs/harta-plan.md, step 9). Closed, it's a round button at the bottom
   left of the page; open, a small window with the farm's parcels fitted, flat and still. MapLibre loads
   only when it is first opened, and the parcels are fetched only then; until then the copy on the phone
   says whether any parcel has a place. A tap on a parcel opens its card on /harta.
   A phone gets only the button, which goes to /harta: a map window would cover the page there. */
import { useEffect, useMemo, useState } from 'react';
import type { Crop } from '../../../packages/shared/src/data/index';
import { buildPlotRows, loadPlotsParams } from '../../../packages/shared/src/plots/index';
import { useFarm, useView } from '../../lib/cc/react';
import { appHref, storageKey, type Mode } from '../../lib/paths';
import { Icon } from '../app/bits';
import { PageLink } from '../app/Frame';
import { plotName } from '../plots/plot-text';
import { usePlots } from '../plots/usePlots';
import { FarmMapLazy } from './FarmMapLazy';
import '../../styles/map.css';

/** Pages without the corner map: the map page itself. Login, onboarding and the landing page have no frame. */
export const NO_MINIMAP: readonly string[] = ['/harta'];
const OPEN_KEY = 'cropcash-minimap';
const PHONE = '(max-width: 760px), (max-height: 500px)';
const SOON_DAYS = loadPlotsParams().todo_soon_days.value;

function readOpen(mode: Mode): boolean {
  try {
    return localStorage.getItem(storageKey(OPEN_KEY, mode)) === '1';
  } catch {
    return false;
  }
}
function saveOpen(mode: Mode, open: boolean) {
  try {
    if (open) localStorage.setItem(storageKey(OPEN_KEY, mode), '1');
    else localStorage.removeItem(storageKey(OPEN_KEY, mode));
  } catch {
    /* private window: it just starts closed next time */
  }
}

function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = typeof matchMedia === 'function' ? matchMedia(PHONE) : null;
    if (!m) return;
    const on = () => setPhone(m.matches);
    on();
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return phone;
}

export function MiniMap({ page, mode }: { page: string; mode: Mode }) {
  const farm = useFarm();
  const view = useView('farm');
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  /* Read after the first render: the static page doesn't know what the phone remembers. */
  useEffect(() => setOpen(readOpen(mode)), [mode]);
  const showMap = open && !phone;
  const year = view?.baseYear ?? 0;
  const loaded = usePlots(year, { fetch: showMap });
  const crops = (view?.data().crops.crops ?? []) as Crop[];
  const rows = useMemo(() => {
    const p = loaded.plots;
    if (!p || !view) return [];
    return buildPlotRows({ year, today: view.today, plots: p.plots, seasons: p.seasons, operations: p.operations, transactions: [], crops });
  }, [loaded.plots, view, year, crops]);

  if (!farm || !view || NO_MINIMAP.includes(page)) return null;
  const href = (path: string) => appHref(path, mode);
  const placed = rows.filter((r) => r.plot.geometry || r.plot.centroid_lat !== null).length;
  /* Known to have no parcel on the map: a chip that says what to do, instead of an empty map. */
  if (loaded.plots && placed === 0) {
    return (
      <div className="mm">
        <PageLink path="/harta" href={href('/harta')} className="mm-chip">
          <Icon name="map" />
          Pune parcelele pe hartă
        </PageLink>
      </div>
    );
  }
  if (!showMap) {
    return (
      <div className="mm">
        {phone ? (
          <PageLink path="/harta" href={href('/harta')} className="mm-btn" aria-label="Harta parcelelor">
            <Icon name="map" />
          </PageLink>
        ) : (
          <button
            type="button"
            className="mm-btn"
            aria-label="Arată harta parcelelor"
            aria-expanded="false"
            onClick={() => {
              setOpen(true);
              saveOpen(mode, true);
            }}
          >
            <Icon name="map" />
          </button>
        )}
      </div>
    );
  }
  const cropName = view.cropName;
  return (
    <div className="mm">
      <section className="mm-win" aria-label="Harta parcelelor">
        <FarmMapLazy
          rows={rows}
          crops={crops}
          mode="mini"
          names={{ cropName, plotTitle: (r) => plotName(r.plot, cropName) }}
          today={view.today}
          soonDays={SOON_DAYS}
          onSelect={(id) => id && location.assign(href(`/harta?parcela=${encodeURIComponent(id)}`))}
        />
        <div className="mm-bar">
          <PageLink path="/harta" href={href('/harta')} className="mm-icon" aria-label="Deschide harta mare">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
            </svg>
          </PageLink>
          <button
            type="button"
            className="mm-icon"
            aria-label="Ascunde harta"
            aria-expanded="true"
            onClick={() => {
              setOpen(false);
              saveOpen(mode, false);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 12h12" />
            </svg>
          </button>
        </div>
        {loaded.loading && !loaded.plots && <p className="mm-note">Se încarcă parcelele…</p>}
        {loaded.failed && <p className="mm-note">Parcelele nu s-au încărcat. Încearcă pe Harta.</p>}
      </section>
    </div>
  );
}
