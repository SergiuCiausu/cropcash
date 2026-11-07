/* Ported from farm-app/subsidies/subventii.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Subvenția ta · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function SubventiiPage() {
  return (
    <LegacyPage scripts={["shared","engine","data-calls","app","papers","subventii","notifications"]} palette="both">
      <main className="main">
        <div>
          <header className="page-h">
            <div>
              <h1>Subvenția ta</h1>
              <p className="lead">Cât primești de la APIA pentru 2026 și când vin banii.</p>
            </div>
          </header>
          <nav className="subnav" aria-label="Subvenții"></nav>
          <div className="bento">
            <section className="chart-card field hero-card s6">
              <p className="eyebrow">De la APIA primești</p>
              <p className="amount" id="total"></p>
              <p className="range" id="range"></p>
              <p className="why" id="why"></p>
              <div className="sum" id="sum"></div>
              <div className="hero-paper" id="decision" hidden></div>
            </section>
            <section className="card s6">
              <div className="card-h">
                <h2>Când vin banii</h2>
                <span id="filed"></span>
              </div>
              <div className="pay" id="pay"></div>
              <div className="axis" aria-hidden="true">
                <div className="axis-track" id="axis"></div>
                <div className="axis-m" id="axis-m"></div>
              </div>
              <p className="note gap">Planul tău socotește cu ultima zi, ca să fii acoperit dacă banii vin târziu.</p>
              <p className="note gap pay-link">
                <a href="/calendar">Vezi tot calendarul</a>
              </p>
            </section>
            <section className="card s7">
              <div className="card-h">
                <h2>Ce primești</h2>
                <span>Apasă ca să vezi calculul</span>
              </div>
              <div id="schemes"></div>
              <p className="note gap" id="schemes-note" hidden>Pe rânduri rămâne calculul nostru. Totalul de sus vine din decizia ta de plată.</p>
            </section>
            <section className="card s5">
              <h2>Ce nu primești și de ce</h2>
              <div id="reasons"></div>
            </section>
            <section className="card s12">
              <div className="card-h">
                <h2>Ce s-ar schimba dacă...</h2>
                <span>Doar o simulare</span>
              </div>
              <p className="note" id="sim-note">Unele schimbări mici pot costa mult, pentru că regulile se schimbă la anumite praguri.</p>
              <div className="sim">
                <div>
                  <label htmlFor="ha-num" id="ha-label">Câte hectare ai lucra</label>
                  {" "}
                  <div className="ha-row">
                    <input type="range" id="ha-range" min="1" max="60" step="1" aria-label="Hectare" />
                    {" "}
                    <input type="number" id="ha-num" min="1" max="60" step="0.01" inputMode="decimal" />
                  </div>
                  <div className="chips" id="ha-chips"></div>
                  <p className="lab" id="crop-lab">Ce culturi ai pune</p>
                  <div className="chips" id="crop-chips"></div>
                  <div className="res" id="res" aria-live="polite"></div>
                </div>
                <div className="step-chart" id="step-chart"></div>
              </div>
            </section>
          </div>
          <p className="note gap" id="rate"></p>
          {" "}
          <a className="btn btn-dark next-step" href="/calendar">Mai departe: când vin banii</a>
        </div>
      </main>
      <dialog className="detail" id="detail" aria-labelledby="d-title"></dialog>
    </LegacyPage>
  );
}
