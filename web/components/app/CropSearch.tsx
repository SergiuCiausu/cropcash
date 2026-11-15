'use client';
/* Search every crop on the APIA cerere (docs/data/apia-crop-codes.json), named the way APIA names it.
   Works offline: the list ships with the app. */
import { useId, useMemo, useState } from 'react';
import { searchCatalogue, type CatalogueCrop } from '../../../packages/shared/src/data/catalogue';

export function CropSearch({
  catalogue,
  exclude = [],
  label = 'Altă cultură',
  placeholder = 'Scrie numele sau codul APIA, de ex. rapiță',
  onPick,
}: {
  catalogue: readonly CatalogueCrop[];
  exclude?: readonly string[];
  label?: string;
  placeholder?: string;
  onPick: (crop: CatalogueCrop) => void;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const found = useMemo(() => searchCatalogue(catalogue, q, 40).filter((c) => !exclude.includes(c.id)).slice(0, 8), [catalogue, q, exclude]);
  return (
    <div className="crop-search">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="search" autoComplete="off" value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} />
      {q.trim() !== '' && (
        <ul aria-live="polite">
          {found.length ? (
            found.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setQ('');
                    onPick(c);
                  }}
                >
                  <b>{c.name_ro}</b>
                  <span>
                    cod APIA {c.code}
                    {c.priced ? '' : ' · scrii tu cifrele'}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="crop-search-none">Nu am găsit „{q.trim()}” pe lista APIA.</li>
          )}
        </ul>
      )}
    </div>
  );
}
