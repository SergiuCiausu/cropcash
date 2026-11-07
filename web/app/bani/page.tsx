/* Ported from farm-app/subsidies/bani.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Contul tău · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function BaniPage() {
  return (
    <LegacyPage scripts={["config","shared","engine","data-calls","app","bani","notifications"]} palette="both">
      <main className="main">
        <div>
          <header className="page-h">
            <div>
              <h1>Contul tău</h1>
              <p className="lead">Banii care vin prin CropCash. Totul e simulat: nu se mișcă bani reali.</p>
            </div>
          </header>
          <p className="offline" data-offline="" hidden>Nu ai internet. Vezi ce e salvat pe telefon, dar banii nu se pot muta acum.</p>
          <div className="bento" id="cards"></div>
        </div>
      </main>
      <dialog className="h-sheet" id="split" aria-labelledby="s-title">
        <h2 id="s-title"></h2>
        <p className="note" id="s-lead"></p>
        <ol className="ac-envs" id="s-bars"></ol>
        <p className="note" id="s-why"></p>
        <p className="ob-err" id="s-err" role="alert" hidden></p>
        <div className="ob-actions">
          <button type="button" className="btn btn-dark" data-act="accept" data-needs-net="Pornește internetul ca să muți banii.">Bine așa</button>
          <button type="button" className="btn btn-line" data-act="later">Mai târziu</button>
        </div>
      </dialog>
    </LegacyPage>
  );
}
