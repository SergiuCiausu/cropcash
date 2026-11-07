/* Ported from farm-app/subsidies/surse.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Ce s-a schimbat · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function SursePage() {
  return (
    <LegacyPage scripts={["shared","config","data-sources","engine","data-calls","app","surse","notifications"]} palette="both">
      <main className="main">
        <div>
          <header className="page-h">
            <div>
              <h1>Ce s-a schimbat</h1>
              <p className="lead">Urmărim paginile oficiale, ca să nu fie nevoie s-o faci tu.</p>
            </div>
          </header>
          <nav className="subnav" aria-label="Subvenții"></nav>
          <p className="offline" data-offline="" hidden>Nu ai internet. Vezi ultima listă salvată, cu data ei sus.</p>
          <section className="cta field verdict" id="summary"></section>
          <div className="vtabs" role="group" aria-label="Ce arăt" id="vtabs"></div>
          <div id="panel"></div>
        </div>
      </main>
      <dialog className="h-sheet" id="add" aria-labelledby="add-title">
        <form id="add-form" noValidate>
          <h2 id="add-title">Adaugă o sursă</h2>
          <div id="add-fields">
            <label className="ob-field">
              {"Linkul paginii sau al PDF-ului"}
              <input id="add-url" inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck="false" placeholder="afir.ro/pagina" />
            </label>
            {" "}
            <label className="ob-field">
              {"Cum vrei s-o numești? (nu e obligatoriu)"}
              <input id="add-name" autoComplete="off" maxLength={120} />
            </label>
            {" "}
            <p className="note gap">Lista ta ține de acest telefon sau calculator. Pe alt aparat n-o vei vedea. Alți fermieri nu o văd.</p>
            <p className="ob-err" id="add-err" role="alert" hidden></p>
            <div className="ob-actions">
              <button type="submit" className="btn btn-dark" id="add-save">Citește pagina</button>
              <button type="button" className="btn btn-line" data-close="">Renunță</button>
            </div>
          </div>
          <div id="add-result" aria-live="polite" hidden></div>
        </form>
      </dialog>
    </LegacyPage>
  );
}
