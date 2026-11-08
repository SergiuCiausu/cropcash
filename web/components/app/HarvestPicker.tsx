'use client';
/* Switching between harvest years: a real <select> in the rail and the phone's top bar, so a phone opens
   its own large picker. The crop is chosen on the strip of tabs (CropTabs.tsx). Whole-farm pages name
   what they show as plain text, styled so it doesn't look like a button. */
import { useContext } from 'react';
import type { FarmView } from '../../lib/cc/plan';
import { useStore } from '../../lib/cc/react';
import { harvestName } from '../../lib/cc/harvests';
import { CROP_TAB_PAGES } from '../../lib/ui/nav';
import { CHEVRON } from './bits';
import { FrameContext } from './context';

/** The last option, which opens Recolte to start a new year instead of picking one. */
const NEW_YEAR = '__new';

export function HarvestChip({ view }: { view: FarmView }) {
  const store = useStore();
  const { page, href } = useContext(FrameContext);
  if (view.scope === 'farm') {
    /* Acasă always shows the year under way; the other whole-farm pages show every year at once. */
    const year = CROP_TAB_PAGES.includes(page);
    return (
      <span className="h-chip whole" title={year ? 'Aici vezi anul în curs. Alt an alegi în Recolte, Calendar, Prognoză sau Subvenții.' : 'Aici vezi toată ferma.'}>
        {year ? harvestName(view.scoped) : 'Toată ferma'}
      </span>
    );
  }
  const items = [...view.harvests.items].sort((a, b) => b.year - a.year);
  return (
    <span className="h-chip h-select">
      <select
        aria-label="Alege recolta"
        value={view.selected.id}
        onChange={(e) => {
          if (e.target.value === NEW_YEAR) {
            location.href = href('/recolte#nou');
            return;
          }
          /* The picked crop stays when the new year has it too; otherwise the page opens on the whole farm. */
          store?.selectHarvest(e.target.value, view.harvests.crop);
        }}
      >
        {items.map((h) => (
          <option key={h.id} value={h.id}>
            {harvestName(h)}
          </option>
        ))}
        <option value={NEW_YEAR}>+ Începe anul următor</option>
      </select>
      {CHEVRON}
    </span>
  );
}
