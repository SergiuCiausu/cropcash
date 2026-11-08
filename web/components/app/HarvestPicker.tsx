'use client';
/* Switching between harvest years: the chip in the rail and top bar, and the sheet it opens. The crop
   is chosen on the strip of tabs (CropTabs.tsx). Whole-farm pages name what they show and open no sheet. */
import { useContext } from 'react';
import type { FarmView } from '../../lib/cc/plan';
import { useStore } from '../../lib/cc/react';
import { harvestName, statusWord } from '../../lib/cc/harvests';
import { CROP_TAB_PAGES } from '../../lib/ui/nav';
import { CHEVRON, Sheet } from './bits';
import { FrameContext } from './context';

export function HarvestChip({ view, onOpen }: { view: FarmView; onOpen: () => void }) {
  const { page } = useContext(FrameContext);
  if (view.scope === 'farm') return <span className="h-chip whole">{CROP_TAB_PAGES.includes(page) ? harvestName(view.scoped) : 'Toată ferma'}</span>;
  return (
    <button type="button" className="h-chip" aria-haspopup="dialog" onClick={onOpen}>
      {harvestName(view.selected)}
      {CHEVRON}
    </button>
  );
}

export function HarvestSheet({ view, open, onClose }: { view: FarmView; open: boolean; onClose: () => void }) {
  const store = useStore();
  const { href } = useContext(FrameContext);
  /* The picked crop stays when the new year has it too; otherwise the page opens on the whole farm. */
  const pick = (id: string) => {
    store?.selectHarvest(id, view.harvests.crop);
    onClose();
  };
  const items = [...view.harvests.items].sort((a, b) => b.year - a.year);
  return (
    <Sheet open={open} onClose={onClose} className="h-sheet" label="Alege recolta">
      <h2>Alege recolta</h2>
      <div className="h-rows">
        {items.map((h) => (
          <button key={h.id} type="button" aria-current={h.id === view.selected.id ? 'true' : undefined} onClick={() => pick(h.id)}>
            <b>{harvestName(h)}</b>
            <span>{statusWord(h)}</span>
          </button>
        ))}
      </div>
      <a className="btn btn-line" href={href('/recolte#nou')}>
        Începe anul următor
      </a>
    </Sheet>
  );
}
