/* Ported from farm-app/desktop/2-rail.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Acasă · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function AcasaPage() {
  return (
    <LegacyPage scripts={["react","recharts","shared","engine","data-calls","app","chart","acasa","notifications"]} palette="both">
      <main className="main">
        <div>
          <header className="page-h">
            <div>
              <h1 id="hello"></h1>
              <p className="lead" id="lead"></p>
            </div>
            <div className="acts">
              <a className="btn btn-dark" href="/recolte">Notează o vânzare</a>
            </div>
          </header>
          <p className="offline" data-offline="" hidden>Nu ai internet. Vezi ultimele date salvate pe acest telefon.</p>
          <div className="bento">
            <section className="card chart-card hero-card s8">
              <p className="eyebrow">Salariul tău</p>
              <p className="amount" id="h-amount"></p>
              <p className="why" id="h-why"></p>
              <div className="chart fc-chart" id="fc"></div>
            </section>
            <div className="s4 side-stats ac-side">
              <section className="card kpi">
                <p className="lbl">Bani la tine acum</p>
                <p className="n20" id="now"></p>
                <p className="sub2" id="low"></p>
              </section>
              {" "}
              <a className="card kpi kpi-link" id="old-age" href="/pensie">
                <p className="lbl">Pensie</p>
                <p className="n20" id="old-month"></p>
                <p className="sub2" id="old-sum"></p>
              </a>
            </div>
          </div>
          <div className="tiles gap" id="tiles"></div>
          <div className="bento gap">
            <section className="card s7">
              <div className="card-h">
                <h2>Ce urmează</h2>
              </div>
              <ol className="ac-list" id="coming"></ol>
              <p className="note">
                <a href="/calendar">Vezi tot calendarul</a>
              </p>
            </section>
            <section className="card s5 ac-calls">
              <div className="card-h">
                <h2>Oportunități</h2>
              </div>
              <ol className="ac-list" id="calls"></ol>
              <p className="note">
                <a href="/oportunitati">Vezi toate oportunitățile</a>
              </p>
            </section>
            <section className="card s12" id="weather" hidden></section>
          </div>
        </div>
      </main>
    </LegacyPage>
  );
}
