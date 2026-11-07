/* Ported from farm-app/subsidies/date-plan.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Datele planului · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function DatePlanPage() {
  return (
    <LegacyPage scripts={["shared","engine","data-calls","app","date-plan","notifications"]} palette="both">
      <main className="main">
        <div>
          <header className="page-h">
            <div>
              <h1>Datele planului</h1>
              <p className="lead">Din aceste cifre calculăm salariul. Schimbă ce nu se potrivește cu ferma ta.</p>
            </div>
          </header>
          <p className="offline" data-offline="" hidden>Nu ai internet. Poți încerca cifre aici, dar le salvezi când revii online.</p>
          <section className="chart-card field hero-card plan-preview" aria-live="polite">
            <p className="eyebrow">Salariul cu aceste cifre</p>
            <p className="amount" id="p-amount"></p>
            <p className="why" id="p-why"></p>
          </section>
          <form id="plan-form" noValidate>
            <div className="bento">
              <section className="card s6">
                <h2>Bani la început</h2>
                <p className="note">
                  {"Cât aveai în cont când a început recolta "}
                  <span id="m-year"></span>
                  {"."}
                </p>
                {" "}
                <label className="ob-field">
                  {"Suma, în lei"}
                  <input id="opening" inputMode="numeric" autoComplete="off" />
                </label>
                {" "}
                <p className="ob-err" id="opening-err" role="alert" hidden></p>
              </section>
              <section className="card s6">
                <h2>Pensie</h2>
                <p className="note" id="pension-note"></p>
                {" "}
                <label className="ob-field" id="pension-field">
                  {"Suma pe lună, în lei"}
                  <input id="pension" inputMode="numeric" autoComplete="off" />
                </label>
                {" "}
                <p className="ob-err" id="pension-err" role="alert" hidden></p>
              </section>
              <section className="card s12">
                <h2>Recolta, într-un an normal</h2>
                <p className="note">Anul slab și anul bun se schimbă odată cu aceste cifre. Costurile rămân cele medii.</p>
                <div className="crop-figs" id="crops"></div>
              </section>
            </div>
            <p className="plan-again" id="p-again"></p>
            <p className="ob-err" id="save-err" role="alert" hidden></p>
            <div className="ob-actions plan-actions">
              <button type="submit" className="btn btn-dark" id="save">Salvează</button>
              {" "}
              <a className="btn btn-line" href="/salariu">Renunță</a>
            </div>
          </form>
        </div>
      </main>
    </LegacyPage>
  );
}
