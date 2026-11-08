'use client';
/* "Pune CropCash pe ecranul telefonului" (F-21). Only for a farmer's own farm: an app installed from
   Ion's farm would open on the login page. "Nu acum" stays dismissed. */
import { useContext, useEffect, useState } from 'react';
import { storageKey } from '../../lib/paths';
import { askToInstall, installWay, onInstallChange, type InstallWay } from '../../lib/ui/install';
import { NetButton } from './bits';
import { FrameContext } from './context';

export function InstallCard() {
  const { mode } = useContext(FrameContext);
  const key = storageKey('cropcash-install-dismissed', mode);
  const [way, setWay] = useState<InstallWay | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(!!localStorage.getItem(key));
    } catch {
      /* No storage: the card simply comes back next time. */
    }
    const read = () => setWay(installWay());
    read();
    return onInstallChange(read);
  }, [key]);

  if (mode === 'demo' || !way || dismissed) return null;
  const notNow = () => {
    setDismissed(true);
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* Hidden for this visit anyway. */
    }
  };
  return (
    <section className="card s12">
      <h2>Pune CropCash pe ecranul telefonului</h2>
      <p className="note">Îl deschizi ca pe orice aplicație și vezi banii fermei și fără internet.</p>
      {way === 'iphone' && <p className="note gap">În Safari, apasă pe butonul de partajare (pătratul cu săgeată în sus), apoi alege să adaugi pe ecranul principal.</p>}
      <div className="ob-actions">
        {way === 'prompt' && (
          <NetButton className="btn btn-dark" reason="Pornește internetul ca să instalezi aplicația." onClick={() => void askToInstall()}>
            Pune pe telefon
          </NetButton>
        )}
        <button type="button" className="btn btn-line" onClick={notNow}>
          Nu acum
        </button>
      </div>
    </section>
  );
}
