'use client';
/* The strip of crop tabs at the top of a page: the whole farm, then each crop of the harvest. A tab
   only changes what the store has picked, so the page redraws in place, with no load and no new
   address. The choice stays on the phone, so this works without internet. */
import { useContext, useEffect, useRef } from 'react';
import { cropTabs } from '../../lib/cc/harvests';
import type { FarmView } from '../../lib/cc/plan';
import { useStore } from '../../lib/cc/react';
import { FrameContext } from './context';

export function CropTabs({ view }: { view: FarmView }) {
  const store = useStore();
  const { href, page } = useContext(FrameContext);
  const row = useRef<HTMLDivElement>(null);
  const tabs = cropTabs(view.scoped, view.tabCrop, view.cropName);

  /* With many crops the row scrolls sideways, and the picked one stays in sight. */
  useEffect(() => {
    const box = row.current;
    const on = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (box && on) box.scrollLeft = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2;
  }, [view.tabCrop]);

  /* Adding a crop is a form on Recolte, so this one does change page. */
  const addCrop = () => {
    store?.selectHarvest(view.scoped.id, null);
    if (page === '/recolte') location.hash = 'cultura';
    else location.href = href('/recolte#cultura');
  };

  return (
    <div className="crop-tabs">
      <div className="vtabs" role="group" aria-label="Alege cultura" ref={row}>
        {tabs.map((t) => (
          <button key={t.cropId ?? 'farm'} type="button" className="chip" aria-pressed={t.current} onClick={() => store?.selectHarvest(view.selected.id, t.cropId)}>
            {t.label}
            {t.sub && <span className="n">{t.sub}</span>}
          </button>
        ))}
        {view.scoped.status === 'open' && (
          <button type="button" className="chip add" onClick={addCrop}>
            + Adaugă
          </button>
        )}
      </div>
    </div>
  );
}
