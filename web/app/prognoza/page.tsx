/* Ported from farm-app/subsidies/prognoza.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Prognoză · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function PrognozaPage() {
  return (
    <LegacyPage scripts={["react","recharts","shared","engine","data-calls","app","chart","prognoza","notifications"]} palette="both">
      <main className="main">
        <div>
          <header className="page-h">
            <div>
              <h1>Prognoză</h1>
              <p className="lead">Cum arată banii tăi în următoarele 12 luni.</p>
            </div>
          </header>
          <p className="offline" data-offline="" hidden>Nu ai internet. Prognoza se calculează pe telefon, din datele salvate.</p>
          <div className="vtabs page-tabs" role="group" aria-label="Ce fel de an" id="years"></div>
          <div className="fc-pair" id="pair">
            <section className="card fc-main">
              <div className="card-h">
                <h2 id="c-title"></h2>
                <span id="c-low"></span>
              </div>
              <div className="chart fc-chart" id="fc"></div>
              <p className="note">Linia plină e anul ales, înainte de salariu și pensie. Liniile punctate sunt ceilalți doi ani.</p>
              <div className="fc-keys" id="keys"></div>
            </section>
            <section className="card" id="ani">
              <div className="card-h">
                <h2>Următorii ani</h2>
                <span id="l-kind"></span>
              </div>
              <div className="vtabs" role="group" aria-label="Ce fel de ani" id="years-long"></div>
              <div className="ha-row l-range">
                <label htmlFor="l-years">
                  {"În câți ani? "}
                  <output id="l-out" htmlFor="l-years"></output>
                </label>
                {" "}
                <input type="range" id="l-years" min="1" step="1" />
              </div>
              <p className="l-head" id="l-head"></p>
              <p className="lead" id="l-range"></p>
              <div className="chart fc-chart" id="l-chart"></div>
              <div className="fc-keys l-keys" id="l-keys"></div>
              <p className="note" id="l-first"></p>
              <p className="note">
                {"O estimare, nu o promisiune. Fiecare an e la fel ca cel ales, cu prețurile, costurile și subvențiile de azi, deci „ani slabi” înseamnă că toți ar ieși slabi. Regulile pentru subvenții sunt stabilite până în "}
                <span id="l-rules"></span>
                {". „Rămân” e înainte de salariu și pensie."}
              </p>
              <div className="ob-actions">
                <a className="btn btn-line" href="/recolte#strans">Schimbă recolta</a>
              </div>
            </section>
          </div>
          <section className="cta field verdict" id="bad" hidden></section>
          <section className="card" id="real" hidden>
            <div className="card-h">
              <h2>Plan și realitate</h2>
              <span>
                <a href="/recolte">Notează</a>
              </span>
            </div>
            <div id="real-body"></div>
          </section>
          <div className="bento">
            <section className="card s6">
              <h2>De unde vin banii</h2>
              <ul className="bars" id="in"></ul>
            </section>
            <section className="card s6">
              <h2>Unde se duc banii</h2>
              <ul className="bars out" id="out"></ul>
            </section>
            <section className="card s12">
              <div className="card-h">
                <h2>Culturile tale, într-un an normal</h2>
                <span>Estimat</span>
              </div>
              <table className="crop-table" id="crops"></table>
            </section>
          </div>
          <p className="note gap" id="foot"></p>
          {" "}
          <a className="btn btn-dark next-step" href="/salariu">Mai departe: cât poți scoate pe lună</a>
        </div>
      </main>
    </LegacyPage>
  );
}
