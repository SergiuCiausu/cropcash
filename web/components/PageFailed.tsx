'use client';
/* Shown instead of a page that could not start (docs/failure-handling-plan.md, FAIL-06). What the
   farmer saved is on the phone whatever happened to the page, so it says that too. */
import { hasFarmCopy } from '../lib/live/auth';
import { appHref, modeOf } from '../lib/paths';
import '../styles/skeleton.css';

const TEXT = {
  failed: 'Pagina nu a pornit',
  failedWhy: 'Mai încearcă o dată. Dacă tot nu merge, închide aplicația și deschide-o din nou.',
  offlineWhy: 'Nu ai internet, iar pagina asta nu e încă salvată pe telefon. Pornește internetul și încearcă din nou.',
  kept: 'Datele tale sunt păstrate pe telefon.',
  retry: 'Încearcă din nou',
  home: 'Mergi la Acasă',
};

function farmOnPhone() {
  try {
    return hasFarmCopy(localStorage);
  } catch {
    return false;
  }
}

export default function PageFailed({ onRetry = () => location.reload() }: { onRetry?: () => void }) {
  return (
    <div className="boot-fail" role="alert">
      <div className="ob-card">
        <h1>{TEXT.failed}</h1>
        <p className="lead">{navigator.onLine ? TEXT.failedWhy : TEXT.offlineWhy}</p>
        {farmOnPhone() && <p className="lead">{TEXT.kept}</p>}
        <div className="ob-actions">
          <button type="button" className="btn btn-dark" onClick={onRetry}>
            {TEXT.retry}
          </button>
          <a className="btn btn-line" href={appHref('/acasa', modeOf(location.pathname))}>
            {TEXT.home}
          </a>
        </div>
      </div>
    </div>
  );
}
