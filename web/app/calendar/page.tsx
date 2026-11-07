/* Ported from farm-app/subsidies/calendar.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Calendar · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function CalendarPage() {
  return (
    <LegacyPage scripts={["shared","engine","data-calls","app","calendar","notifications"]} palette="both">
      <main className="main">
        <div>
          <header className="page-h">
            <div>
              <h1>Calendar</h1>
              <p className="lead">Bani, termene și lucrări, pe un singur an.</p>
            </div>
          </header>
          <p className="offline" data-offline="" hidden>Nu ai internet. Vezi ultimele date salvate. Ce bifezi se trimite când ai internet.</p>
          <section className="card cal" id="cal" aria-labelledby="cal-title">
            <div className="cal-h">
              <h2 id="cal-title" aria-live="polite"></h2>
              <div className="cal-nav">
                <button type="button" data-cal="today">Azi</button>
                {" "}
                <button type="button" className="cal-arrow" data-cal="prev" aria-label="Luna trecută">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m15 6-6 6 6 6"></path>
                  </svg>
                </button>
                {" "}
                <button type="button" className="cal-arrow" data-cal="next" aria-label="Luna viitoare">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m9 6 6 6-6 6"></path>
                  </svg>
                </button>
              </div>
            </div>
            <div className="cal-body">
              <div className="cal-main">
                <div className="cal-week" aria-hidden="true">
                  <span>L</span>
                  <span>Ma</span>
                  <span>Mi</span>
                  <span>J</span>
                  <span>V</span>
                  <span>S</span>
                  <span>D</span>
                </div>
                <div className="cal-grid" id="cal-grid"></div>
              </div>
              <div className="cal-side">
                <div className="cal-day" id="cal-day" aria-live="polite"></div>
                <div className="cal-month" id="cal-month"></div>
              </div>
            </div>
          </section>
          <section className="cta field verdict" id="next"></section>
          <div className="vtabs" role="group" aria-label="Ce arăt" id="vtabs"></div>
          <div id="list"></div>
          <div id="done"></div>
          <section className="card remember" id="remember"></section>
          <p className="note gap" id="foot"></p>
          {" "}
          <a className="btn btn-dark next-step" href="/prognoza">Mai departe: prognoza pe un an</a>
        </div>
      </main>
      <dialog className="detail" id="detail" aria-labelledby="d-title"></dialog>
    </LegacyPage>
  );
}
