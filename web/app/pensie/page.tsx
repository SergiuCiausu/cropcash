/* Ported from farm-app/subsidies/pensie.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Pensie · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function PensiePage() {
  return (
    <LegacyPage scripts={["react","recharts","config","shared","engine","data-calls","app","pension-chart","pensie","notifications"]} palette="both">
      <main className="main">
        <div>
          <header className="page-h">
            <div>
              <h1>Pensie</h1>
              <p className="lead">Bani puși deoparte în fiecare lună, pentru după 65 de ani. Totul e simulat: nu se mișcă bani reali.</p>
            </div>
          </header>
          <p className="offline" data-offline="" hidden>Nu ai internet. Socotelile merg din datele salvate pe telefon, dar pensia nu se poate porni, schimba sau opri acum.</p>
          <div className="bento">
            <section className="chart-card field hero-card s12" aria-live="polite">
              <div>
                <p className="eyebrow" id="h-label"></p>
                <p className="amount" id="h-amount"></p>
                <p className="why" id="h-why"></p>
              </div>
            </section>
            <section className="card s7">
              <div className="card-h">
                <h2 id="m-title">Cât pui pe lună?</h2>
              </div>
              <div id="m-body"></div>
            </section>
            <section className="card s5" id="side"></section>
            <section className="card s12" id="grow">
              <div className="card-h">
                <h2>Dacă banii cresc mai încet sau mai repede</h2>
              </div>
              <div className="chips" role="group" aria-label="Cât cresc banii pe an" id="g-pick"></div>
              {" "}
              <label className="ob-field pn-compare">
                {"Compară cu"}
                <select id="g-compare">
                  <option value="pilon3">Doar Pilonul III</option>
                  <option value="contract">Casa de Pensii: contract</option>
                  <option value="declaration">Casa de Pensii: Declarația Unică</option>
                  <option value="cei">Cont de economii (CEI)</option>
                </select>
              </label>
              {" "}
              <p className="note" id="g-cmp-note" aria-live="polite" hidden></p>
              <div className="chart pn-chart" id="g-chart"></div>
              <div id="range"></div>
            </section>
            <section className="card s12">
              <details className="fold pn-fold">
                <summary>
                  {"De ce nu Casa de Pensii?"}
                  <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 9 6 6 6-6"></path>
                  </svg>
                </summary>
                <div id="why-not"></div>
              </details>
            </section>
          </div>
        </div>
      </main>
      <dialog className="h-sheet" id="ask" aria-labelledby="a-title">
        <h2 id="a-title"></h2>
        <p className="note" id="a-text"></p>
        <p className="ob-err" id="a-err" role="alert" hidden></p>
        <div className="ob-actions">
          <button type="button" className="btn btn-dark" id="a-yes">Bine așa</button>
          <button type="button" className="btn btn-line" id="a-no">Renunță</button>
        </div>
      </dialog>
    </LegacyPage>
  );
}
