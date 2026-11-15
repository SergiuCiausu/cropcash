'use client';
/* FarmMap without a server render: MapLibre needs the browser. Pages use this one (docs/harta-plan.md, step 7). */
import dynamic from 'next/dynamic';

export const FarmMapLazy = dynamic(() => import('./FarmMap').then((m) => m.FarmMap), {
  ssr: false,
  loading: () => <div className="farm-map full" aria-busy="true" aria-label="Se încarcă harta" />,
});
