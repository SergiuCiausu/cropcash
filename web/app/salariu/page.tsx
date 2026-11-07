/* Ported from farm-app/subsidies/salariu.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Salariu · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function SalariuPage() {
  return (
    <LegacyPage scripts={["shared","engine","data-calls","app","salariu","notifications"]} palette="both">
      <main className="main">
        <div>
          <header className="page-h">
            <div>
              <h1>Salariul tău</h1>
              <p className="lead" id="lead"></p>
            </div>
          </header>
          <p className="offline" data-offline="" hidden>Nu ai internet. Salariul se calculează pe telefon, din datele salvate.</p>
          <div className="bento">
            <section className="chart-card field hero-card pay-hero s12">
              <div>
                <p className="eyebrow" id="h-label"></p>
                <p className="amount" id="h-amount"></p>
                <p className="why" id="h-why" aria-live="polite"></p>
              </div>
              <div className="year-pick" role="group" aria-label="Ce fel de an" id="years"></div>
            </section>
            <section className="card s5">
              <div className="pay-sum">
                <h2 id="r-title"></h2>
                <ul className="sums" id="r-lines"></ul>
                <p className="sum-end" id="r-end"></p>
              </div>
            </section>
            <section className="card s7">
              <h2>Lună cu lună</h2>
              <p className="note" id="m-intro"></p>
              <p className="m-head">
                <span>Luna</span>
                <span>Îți rămân</span>
              </p>
              <ol className="months" id="m-list"></ol>
              <p className="note gap" id="m-note"></p>
              {" "}
              <button type="button" className="btn btn-line m-more" id="m-more" hidden></button>
            </section>
            <section className="card s12">
              <div className="card-h">
                <h2>Ce am presupus</h2>
                <span>
                  <a href="/date-plan">Schimbă</a>
                </span>
              </div>
              <ul className="assumed" id="assumed"></ul>
            </section>
          </div>
        </div>
      </main>
    </LegacyPage>
  );
}
