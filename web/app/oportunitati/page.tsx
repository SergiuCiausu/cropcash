/* Ported from farm-app/subsidies/oportunitati.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Oportunități · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function OportunitatiPage() {
  return (
    <LegacyPage scripts={["shared","data-calls","data-sources","engine","app","oportunitati","notifications"]} palette="both">
      <main className="main">
        <div>
          <header className="page-h">
            <div>
              <h1>Oportunități</h1>
              <p className="lead">Bani pentru investiții în fermă, din surse oficiale.</p>
            </div>
          </header>
          <nav className="subnav" aria-label="Subvenții"></nav>
          <p className="offline" data-offline="" hidden>Nu ai internet. Vezi ultima listă salvată, cu data ei jos.</p>
          <section className="cta field verdict split" id="verdict"></section>
          <div className="vtabs" role="group" aria-label="Ce arăt" id="vtabs"></div>
          <div className="find" id="find" hidden>
            <input type="search" id="f-text" placeholder="Caută un cuvânt" aria-label="Caută un cuvânt" />
            {" "}
            <button type="button" className="btn btn-line" id="f-toggle" aria-controls="filters" aria-expanded="false">
              {"Filtre "}
              <span id="f-count"></span>
            </button>
          </div>
          <div className="filters four" id="filters" hidden>
            <label>
              {"Program"}
              <select id="f-kind">
                <option value="">Toate</option>
                <option value="afir">AFIR</option>
                <option value="mipe">Fonduri europene (MIPE)</option>
                <option value="ec">Comisia Europeană</option>
              </select>
            </label>
            {" "}
            <label>
              {"Stare"}
              <select id="f-status">
                <option value="">Toate</option>
                <option value="open">Deschis</option>
                <option value="announced">Anunțat</option>
              </select>
            </label>
            {" "}
            <label>
              {"Termen"}
              <select id="f-days">
                <option value="">Oricând</option>
                <option value="30">Sub 30 de zile</option>
                <option value="90">Sub 90 de zile</option>
              </select>
            </label>
            {" "}
            <label>
              {"Bani alocați"}
              <select id="f-eur">
                <option value="0">Oricât</option>
                <option value="1000000">Peste 1 mil. €</option>
                <option value="10000000">Peste 10 mil. €</option>
              </select>
            </label>
          </div>
          <div id="list"></div>
          <p className="note gap" id="foot"></p>
        </div>
      </main>
      <dialog className="detail" id="detail" aria-labelledby="d-title"></dialog>
    </LegacyPage>
  );
}
