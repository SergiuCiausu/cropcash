/* Ported from farm-app/subsidies/recolte.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Recolte · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function RecoltePage() {
  return (
    <LegacyPage scripts={["shared","engine","data-calls","app","papers","seasons","recolte","notifications"]} palette="both">
      <main className="main">
        <div>
          <header className="page-h">
            <div>
              <h1 id="title">Recolte</h1>
              <p className="lead" id="lead">Ce ai strâns, ce ai în pământ și ce ai notat.</p>
            </div>
          </header>
          <p className="offline" data-offline="" hidden>Nu ai internet. Ce notezi se trimite când ai internet.</p>
          <div className="bento">
            <section className="card s12" id="result" hidden>
              <div className="card-h">
                <h2>Plan și realitate</h2>
                <span id="r-tag"></span>
              </div>
              <div id="compare"></div>
              <div className="ob-actions" id="reopen"></div>
            </section>
            <section className="card s12" id="s-crops">
              <h2 id="crops-title">Culturile tale</h2>
              <div id="crop-list"></div>
              <div className="h-links">
                <button type="button" className="h-quiet" id="g-open" hidden>Notează recolta</button>
                {" "}
                <button type="button" className="h-quiet" id="p-open">Schimbă semănatul</button>
                {" "}
                <button type="button" className="h-quiet" id="a-edit" hidden>Schimbă culturile</button>
              </div>
            </section>
            <section className="card s12" id="log">
              <div id="add">
                <div className="h-log-h">
                  <h2>Notează</h2>
                  <div className="vtabs" role="group" aria-label="Ce notezi" id="kinds"></div>
                </div>
                <div className="h-paper" id="paper"></div>
                <p className="note h-paper-note" id="paper-note" role="status" hidden></p>
                <form className="h-record" id="record" noValidate>
                  <label id="what-box">
                    <span id="what-label"></span>
                    <select id="what"></select>
                  </label>
                  {" "}
                  <label id="for-box" hidden>
                    {"Pentru"}
                    <select id="for"></select>
                  </label>
                  {" "}
                  <label>
                    {"Suma, în lei"}
                    <input id="amount" inputMode="numeric" autoComplete="off" />
                  </label>
                  {" "}
                  <label>
                    {"Data"}
                    <input id="date" type="date" />
                  </label>
                  {" "}
                  <p className="ob-err" id="err" role="alert" hidden></p>
                  {" "}
                  <button type="submit" className="btn btn-dark">Salvează</button>
                </form>
              </div>
              <p className="note" id="no-add" hidden></p>
              <h2 id="log-title" hidden>Ce s-a notat</h2>
              <div id="records"></div>
            </section>
          </div>
          <p className="h-end" id="close-row" hidden>
            <span id="close-q"></span>
            <button type="button" className="h-quiet" id="a-close"></button>
          </p>
        </div>
      </main>
      <dialog className="h-sheet" id="g-edit" aria-labelledby="g-title">
        <form id="g-form" noValidate>
          <h2 id="g-title">Ce ai strâns anul ăsta</h2>
          <div id="g-rows"></div>
          <p className="ob-err" id="g-err" role="alert" hidden></p>
          <div className="ob-actions">
            <button type="submit" className="btn btn-dark">Salvează</button>
            <button type="button" className="btn btn-line" data-close="">Renunță</button>
          </div>
        </form>
      </dialog>
      <dialog className="h-sheet" id="p-edit" aria-labelledby="p-title">
        <form id="p-form" noValidate>
          <p className="ob-err" id="p-err" role="alert" hidden></p>
          <h2 id="p-title">Ce ai acum în pământ</h2>
          <div id="p-rows"></div>
          <div className="ob-actions">
            <button type="submit" className="btn btn-dark">Salvează</button>
            <button type="button" className="btn btn-line" data-close="">Renunță</button>
          </div>
        </form>
      </dialog>
      <dialog className="h-sheet" id="edit" aria-labelledby="e-title">
        <form id="edit-form" method="dialog" noValidate>
          <h2 id="e-title"></h2>
          <div id="e-crops"></div>
          {" "}
          <label className="ob-field">
            {"Bani la început, în lei"}
            <input id="e-open" inputMode="numeric" autoComplete="off" />
          </label>
          {" "}
          <p className="ob-err" id="e-err" role="alert" hidden></p>
          <div className="ob-actions">
            <button type="submit" className="btn btn-dark" value="save">Salvează</button>
            <button type="button" className="btn btn-line" id="e-cancel">Renunță</button>
          </div>
        </form>
      </dialog>
      <dialog className="h-sheet" id="own" aria-labelledby="o-title">
        <form id="own-form" noValidate>
          <h2 id="o-title">Altă cultură</h2>
          <p className="note">Scrie cifrele tale pentru un an normal. Le folosim pentru salariu și prognoză. La APIA o socotim teren arabil.</p>
          {" "}
          <label className="ob-field">
            {"Numele culturii"}
            <input id="o-name" autoComplete="off" maxLength={40} />
          </label>
          {" "}
          <label className="ob-field" id="o-ha-field">
            {"Hectare"}
            <input id="o-ha" inputMode="decimal" autoComplete="off" />
          </label>
          {" "}
          <div className="own-pair">
            <label className="ob-field">
              {"Luna semănatului"}
              <select id="o-sow"></select>
            </label>
            {" "}
            <label className="ob-field">
              {"Luna recoltei"}
              <select id="o-harvest"></select>
            </label>
          </div>
          <div className="own-pair">
            <label className="ob-field">
              {"Tone/ha, an normal"}
              <input id="o-yield" inputMode="decimal" autoComplete="off" />
            </label>
            {" "}
            <label className="ob-field">
              {"Tone/ha, an slab"}
              <input id="o-bad" inputMode="decimal" autoComplete="off" placeholder="Nu știu" />
            </label>
          </div>
          {" "}
          <label className="ob-field">
            {"Preț, lei/kg"}
            <input id="o-price" inputMode="decimal" autoComplete="off" />
          </label>
          {" "}
          <p className="own-h">Cheltuieli pe hectar, în lei</p>
          <div className="own-three">
            <label className="ob-field">
              {"La semănat"}
              <input id="o-c-sow" inputMode="numeric" autoComplete="off" placeholder="0" />
            </label>
            {" "}
            <label className="ob-field">
              {"Până la recoltă"}
              <input id="o-c-care" inputMode="numeric" autoComplete="off" placeholder="0" />
            </label>
            {" "}
            <label className="ob-field">
              {"La recoltat"}
              <input id="o-c-harvest" inputMode="numeric" autoComplete="off" placeholder="0" />
            </label>
          </div>
          <p className="ob-err" id="o-err" role="alert" hidden></p>
          <div className="ob-actions">
            <button type="submit" className="btn btn-dark">Gata</button>
            <button type="button" className="btn btn-line" id="o-cancel">Renunță</button>
          </div>
        </form>
      </dialog>
      <dialog className="h-sheet" id="confirm" aria-labelledby="q-title">
        <h2 id="q-title"></h2>
        <p className="note" id="q-text"></p>
        <div className="ob-actions">
          <button type="button" className="btn btn-dark" id="q-yes"></button>
          <button type="button" className="btn btn-line" id="q-no">Renunță</button>
        </div>
      </dialog>
    </LegacyPage>
  );
}
