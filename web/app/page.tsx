/* The landing page. Its design is landing-variations/10-harvest.html (ported once by
   web/scripts/port-legacy.mjs --landing), with the "Dealu Verde" sample farm replaced by Ion:
   every figure comes from docs/data through the engine, at build time (lib/landing-data.ts). */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../components/LegacyPage';
import { landingFigures } from '../lib/landing-data';
import '../styles/shared.css';
import '../styles/desktop.css';

export const metadata: Metadata = { title: 'CropCash: salariu din recoltă' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#F8F8F3' };

const group = (n: number) => String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export default function LandingPage() {
  const f = landingFigures();
  const costTotal = f.costs.reduce((s, c) => s + c[2], 0);
  const crops = f.crops.map((c) => c.n.toLocaleLowerCase('ro')).join(' și ');
  return (
    <LegacyPage scripts={['shared', 'landing']} palette="both" variant="Harvest" globals={{ __LANDING: f }}>
      <style dangerouslySetInnerHTML={{ __html: "\n:root { --gutter: 24px; --section: 96px; --lime: #B4E85C; --photo-dim: .72; --photo-text: #F7F6EF; --photo-text-2: #E9E7DD; --surface-2: #F1F1EA; --float: 0 8px 30px rgba(20, 32, 26, .08); }\n@media (max-width: 640px) { :root { --gutter: 16px; --section: 64px; } }\nhtml, body { height: auto; }\nhtml { scroll-behavior: smooth; scroll-padding-top: 76px; }\nbody { place-items: normal; overscroll-behavior: auto; }\nmain { overflow-x: clip; }\na { color: inherit; text-decoration: none; }\n.container { max-width: 1200px; margin: 0 auto; padding: 0 var(--gutter); }\n.section { position: relative; padding: var(--section) 0 0; }\n.section-header { display: grid; gap: 16px; margin-bottom: 48px; justify-items: start; }\n.lead { max-width: 46ch; }\n.text-sm { font-size: 14px; line-height: 1.55; color: var(--text-2); }\n.below { position: relative; isolation: isolate; }\n.contours { position: absolute; left: 0; width: 100%; height: 900px; object-fit: cover; object-position: top; z-index: -1; pointer-events: none; opacity: .75; }\n.contours.top { top: 0; }\n.contours.end { bottom: 0; height: 620px; transform: scaleY(-1); }\n\n/* Nav */\n.nav { position: sticky; top: 0; z-index: 50; height: 60px; margin-bottom: -60px; display: flex; align-items: center; border-bottom: 1px solid transparent; color: var(--photo-text); transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease; }\n.nav .logo .mark { background: var(--lime); color: #18201C; transition: background-color 150ms ease, color 150ms ease; }\n.nav .btn { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease; }\n.nav .btn-line { background: transparent; border-color: rgba(247, 246, 239, .55); color: var(--photo-text); }\n.nav .btn-dark { background: var(--lime); color: #18201C; }\n.nav :focus-visible { outline-color: var(--lime); }\n.nav.is-scrolled { background: #FFFFFF; border-bottom-color: var(--hair); color: var(--text-1); }\n.nav.is-scrolled .logo .mark { background: #1A1A1A; color: #FAF9F7; }\n.nav.is-scrolled .links { color: var(--text-2); }\n.nav.is-scrolled .btn-line { background: var(--surface); border-color: var(--hair-2); color: var(--text-1); }\n.nav.is-scrolled .btn-dark { background: #1A1A1A; color: #FAF9F7; }\n.nav.is-scrolled :focus-visible { outline-color: var(--ink-b); }\n.nav .container { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; }\n.links { display: flex; gap: 28px; font-size: 13.5px; color: var(--photo-text); }\n.links a { padding: 8px 0; }\n.nav-cta { display: flex; gap: 8px; }\n\n/* Hero: the photo carries the tractor on the right, so the copy stays on its dark left side */\n.hero { position: relative; display: flex; align-items: center; height: calc(clamp(560px, 50vw, 860px) + 60px); padding-top: 60px; overflow: hidden; isolation: isolate; background: #1E1B20; }\n.hero-img { position: absolute; inset: 0; z-index: -1; width: 100%; height: 100%; object-fit: cover; object-position: 100% 58%; filter: brightness(var(--photo-dim)); }\n.hero .container { width: 100%; }\n.hero-copy { width: min(420px, 100%); color: var(--photo-text); text-shadow: 0 1px 2px rgba(0, 0, 0, .45), 0 0 18px rgba(0, 0, 0, .4); }\n.hero .btn { text-shadow: none; }\n.hero .eyebrow { color: var(--photo-text); }\n.hero h1 { margin-top: 16px; color: inherit; }\n.hero h1 span { display: block; }\n.hero h1 .b { color: var(--lime); }\n.hero .lead { margin-top: 16px; color: var(--photo-text-2); }\n.hero .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 28px; }\n.hero .btn-a { background: var(--lime); color: #18201C; }\n.hero .btn-b { border-color: rgba(247, 246, 239, .55); color: var(--photo-text); }\n.hero :focus-visible { outline-color: var(--lime); }\n.demo-note { margin-top: 16px; font-size: 13px; line-height: 1.45; color: var(--photo-text-2); }\n\n/* Cards: a visual on top, title and text below */\n.card { display: flex; flex-direction: column; padding: 0; overflow: hidden; border-radius: 20px; }\n.card-visual { position: relative; flex: 1; display: grid; place-items: center; min-height: 280px; padding: 0 24px; --wash: var(--hero-tint); background: color-mix(in srgb, var(--wash) 25%, #FFFFFF); }\n.card-visual.t-b { --wash: var(--tint-b); }\n.card-visual.t-c { --wash: var(--tint-c); }\n.lp-margin { width: 100%; max-width: 480px; display: grid; gap: 24px; padding-block: 24px; font-size: 15px; }\n.lp-row { display: grid; grid-template-columns: 80px minmax(0, 1fr) 76px; gap: 12px; align-items: center; }\n.lp-row b { font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }\n.lp-bar { height: 16px; border-radius: 5px; background: rgba(20, 32, 26, .08); overflow: hidden; }\n.lp-bar i { display: block; height: 100%; border-radius: 5px; background: var(--a); transform-origin: left; }\n.lp-bills { width: 100%; max-width: 440px; margin: 0; padding: 8px 0 16px; list-style: none; }\n.lp-bills .tm b, .lp-bills .tm small { overflow: visible; white-space: normal; text-overflow: clip; }\n.lp-res { width: 100%; max-width: 440px; padding-block: 24px; }\n.lp-chips { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0 0 56px; padding: 0; list-style: none; }\n.lp-chips li { position: relative; padding: 8px 4px; border: 1px solid color-mix(in srgb, var(--ink-b) 30%, transparent); border-radius: 999px; background: var(--tint-b); color: var(--ink-b); font-size: 13px; font-weight: 500; text-align: center; white-space: nowrap; }\n.lp-chips i { position: absolute; top: 100%; left: calc(50% - 7px); width: 14px; height: 14px; margin-top: 6px; border-radius: 50%; background: var(--ch5); opacity: 0; }\n.lp-res .lp-bar { height: 20px; border-radius: 10px; }\n.lp-res .lp-bar i { border-radius: 10px; background: var(--ink-b); }\n.lp-foot { display: flex; justify-content: space-between; align-items: baseline; margin-top: 14px; }\n.lp-foot b { font-size: 22px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }\n.lp-foot span { font-size: 14px; color: var(--text-2); }\n.lp-costs { width: 100%; max-width: 440px; display: grid; grid-template-columns: 168px minmax(0, 1fr); gap: 24px; align-items: center; padding-block: 24px; }\n.lp-ring { position: relative; aspect-ratio: 1; }\n.lp-ring svg { display: block; width: 100%; height: 100%; transform: rotate(-90deg); }\n.lp-total { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; line-height: 1.2; }\n.lp-total b { font-size: 20px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }\n.lp-total span { font-size: 12.5px; color: var(--text-2); }\n.lp-leg { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; font-size: 14px; }\n.lp-leg li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 8px; align-items: center; }\n.lp-leg i { width: 10px; height: 10px; border-radius: 50%; }\n.lp-leg b { font-weight: 500; font-variant-numeric: tabular-nums; }\n.with-act { grid-template-columns: minmax(0, 1fr) auto; align-items: end; }\n.with-act .lead { margin-top: 16px; }\n.card-body { display: grid; gap: 8px; padding: 24px; }\n.card-body h3 { font-size: 16px; font-weight: 600; line-height: 1.4; letter-spacing: -.01em; }\n.span-5 { grid-column: span 5; } .span-6 { grid-column: span 6; } .span-7 { grid-column: span 7; }\n\n/* How it works */\n.steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }\n.steps li, .trust li { padding: 24px; background: var(--surface); border: 1px solid var(--hair); border-radius: 20px; box-shadow: 0 1px 2px rgba(0, 0, 0, .04); }\n.tile { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; font-size: 19px; background: var(--hero-tint); color: var(--text-1); }\n.tile.b { background: var(--tint-b); color: var(--ink-b); }\n.tile.c { background: var(--tint-c); color: var(--ink-c); }\n.steps b, .trust b { display: block; margin-top: 16px; font-size: 16px; font-weight: 600; letter-spacing: -.01em; line-height: 1.4; }\n.steps p, .trust p { margin-top: 4px; }\n\n/* Forecast: Contour's wide card with its toolbar */\n.toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding: 24px 24px 0; }\n.toolbar .lbl { font-size: 13px; font-weight: 500; color: var(--text-2); }\n.seg { background: var(--surface-2); border-color: var(--hair); }\n.seg button { color: var(--text-2); }\n.seg button[aria-pressed=\"true\"] { color: var(--text-1); }\n.plot { padding: 12px 24px 24px; }\n.chart.big { height: 320px; }\n.figs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; border-top: 1px solid var(--hair); }\n.figs > div { min-width: 0; padding: 16px 24px; }\n.figs > div + div { border-left: 1px solid var(--hair); }\n.figs dt { font-size: 13px; color: var(--text-2); }\n.figs dd { margin: 2px 0 0; }\n.trust { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }\n\n/* Close and footer */\n.final { padding-bottom: var(--section); text-align: center; }\n.final .lead { margin: 16px auto 28px; }\nfooter { border-top: 1px solid var(--hair); padding: 48px 0 40px; font-size: 13px; color: var(--text-2); }\n.fcols { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 24px; }\n.fcols h2 { margin-bottom: 12px; font-size: 12px; font-weight: 500; letter-spacing: 0; line-height: 1.4; color: var(--text-2); }\n.fcols a:not(.logo) { display: block; padding: 2px 0; margin-bottom: 6px; }\n.fcols p { max-width: 40ch; }\n.fcols .logo { margin-bottom: 12px; color: var(--text-1); }\n.copy { margin-top: 32px; font-size: 12.5px; }\n@media (hover: hover) and (pointer: fine) { .nav.is-scrolled .links a:hover, .fcols a:not(.logo):hover { color: var(--text-1); } .hero .btn-b:hover { background: rgba(247, 246, 239, .14); } }\n\n/* Under 960 the photo becomes a band, and the copy moves onto the light page */\n@media (max-width: 959px) {\n  :root { --photo-dim: .8; }\n  .hero { display: block; height: auto; padding-top: 0; overflow: visible; background: none; }\n  .hero-img { position: static; display: block; height: clamp(320px, 88vw, 460px); object-position: 80% 60%; }\n  .hero .container { padding-top: 32px; }\n  .hero-copy { width: auto; color: var(--text-1); text-shadow: none; }\n  .hero .eyebrow { color: var(--ink-a); }\n  .hero h1 .b { color: var(--ink-a); }\n  .hero .lead { color: var(--text-2); }\n  .hero .btn-a { background: #1A1A1A; color: #FAF9F7; }\n  .hero .btn-b { background: var(--surface); border-color: var(--hair-2); color: var(--text-1); }\n  .hero :focus-visible { outline-color: var(--ink-b); }\n  .demo-note { color: var(--text-2); }\n  .steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n}\n@media (max-width: 860px) {\n  .links { display: none; }\n  .bento > *, .bento > .span-5, .bento > .span-7 { grid-column: 1 / -1; }\n}\n@media (max-width: 640px) {\n  h1 { font-size: 30px; }\n  h2 { font-size: 24px; }\n  .section-header { margin-bottom: 32px; }\n  .bento { gap: 12px; }\n  .card-visual { min-height: 0; padding: 0 12px; }\n  .lp-margin { padding-block: 20px; gap: 18px; font-size: 14px; }\n  .card-body { padding: 16px; }\n  .steps { gap: 12px; }\n  .steps li, .trust li { padding: 16px; }\n  .trust { grid-template-columns: minmax(0, 1fr); gap: 12px; }\n  .toolbar { padding: 16px 16px 0; }\n  .toolbar .seg { display: grid; width: 100%; }\n  .seg button { min-width: 0; min-height: 48px; padding: 0 4px; }\n  .plot { padding: 12px 16px 16px; }\n  .chart.big { height: 220px; }\n  .figs { grid-template-columns: minmax(0, 1fr); }\n  .figs > div { padding: 12px 16px; }\n  .figs > div + div { border-left: 0; border-top: 1px solid var(--hair); }\n  .with-act { grid-template-columns: minmax(0, 1fr); justify-items: start; }\n  .lp-costs { grid-template-columns: 132px minmax(0, 1fr); gap: 16px; padding-block: 16px; }\n  .lp-leg { font-size: 13px; }\n  .fcols { grid-template-columns: 1fr 1fr; }\n  .fcols > :first-child { grid-column: 1 / -1; }\n  .contours.top { height: 620px; }\n}\n@media (max-width: 479px) { .nav-cta .btn-line { display: none; } }\n@media (max-width: 359px) {\n  .nav-cta .btn { padding: 0 12px; }\n  .nav-cta .ic { display: none; }\n  .steps { grid-template-columns: minmax(0, 1fr); }\n}\n@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }\n" }} />
      <header className="nav" id="nav">
        <div className="container">
          <a className="logo" href="#top">
            <span className="mark" data-ic="sprout"></span>
            <span>CropCash</span>
          </a>
          {" "}
          <nav className="links" aria-label="Principal">
            <a href="#how">Cum merge</a>
            <a href="#features">Ce vezi</a>
            <a href="#forecast">Prognoză</a>
            <a href="#trust">Ce știm sigur</a>
          </nav>
          <div className="nav-cta">
            <a className="btn btn-line" href="#forecast">Vezi prognoza</a>
            {" "}
            <a className="btn btn-dark" href="/acasa">
              {"Vezi ferma lui Ion "}
              <span data-ic="arrow"></span>
            </a>
          </div>
        </div>
      </header>
      <main id="top">
        <section className="hero" aria-label="Pe scurt">
          <img className="hero-img" src="/img/harvest-2400.jpg" srcSet="/img/harvest-1200.jpg 1200w, /img/harvest-2400.jpg 2400w" sizes="(max-width: 959px) 200vw, 120vw" width="2400" height="1018" fetchPriority="high" alt="Un tractor ară un câmp la apus, cu dealuri verzi în spate." />
          {" "}
          <div className="container">
            <div className="hero-copy">
              <p className="eyebrow">Banii fermei, lună de lună</p>
              <h1>
                <span>Recolta vine o dată.</span>
                <span className="b">Salariul vine lunar.</span>
              </h1>
              <p className="lead">Subvenția APIA și recolta vin în două-trei tranșe pe an. CropCash le împarte într-un salariu pentru fiecare lună și te anunță din timp când banii sunt puțini.</p>
              <div className="actions">
                <a className="btn btn-a" href="/acasa">
                  {"Vezi ferma lui Ion "}
                  <span data-ic="arrow"></span>
                </a>
                {" "}
                <a className="btn btn-b" href="#how">Cum merge</a>
              </div>
              <p className="demo-note">{`Exemplu: ${f.name}, ${f.ha} ha de ${crops}. Cifrele vin din calculul aplicației. Nimic de aici nu mută bani reali.`}</p>
            </div>
          </div>
        </section>
        <div className="below">
          <img className="contours top" src="/img/contours.svg" alt="" aria-hidden="true" />
          {" "}
          <img className="contours end" src="/img/contours.svg" alt="" aria-hidden="true" />
          {" "}
          <section className="section" id="how">
            <div className="container">
              <div className="section-header">
                <h2>De la chitanțe la un an limpede</h2>
                <p className="lead">Patru pași, fiecare destul de scurt cât să-l faci între treburi.</p>
              </div>
              <ol className="steps">
                <li>
                  <span className="tile" data-ic="sack"></span>
                  <b>Notezi ce vinzi și ce plătești</b>
                  <p className="text-sm">O vânzare sau o cheltuială în câteva atingeri, și o poți șterge dacă ai greșit.</p>
                </li>
                <li>
                  <span className="tile c" data-ic="cal"></span>
                  <b>Vezi ce urmează</b>
                  <p className="text-sm">Banii de la APIA, vânzările și cheltuielile, în ordinea în care vin.</p>
                </li>
                <li>
                  <span className="tile b" data-ic="shield"></span>
                  <b>Primești un salariu</b>
                  <p className="text-sm">Aplicația împarte banii anului în sume lunare pe care le poți cheltui liniștit.</p>
                </li>
                <li>
                  <span className="tile" data-ic="chart"></span>
                  <b>Vezi anul care vine</b>
                  <p className="text-sm">Douăsprezece luni de bani în cont, pentru un an slab, normal și bun.</p>
                </li>
              </ol>
            </div>
          </section>
          <section className="section" id="features">
            <div className="container">
              <div className="section-header with-act">
                <div>
                  <h2>Toată ferma pe o pagină</h2>
                  <p className="lead">{`Ce urmărește aplicația, pe ferma lui ${f.name}.`}</p>
                </div>
                <button type="button" className="btn btn-line" id="motion" aria-pressed="false"></button>
              </div>
              <div className="bento">
                <article className="card span-7">
                  <div className="card-visual">
                    <div className="lp-margin" id="margin-loop" role="img"></div>
                  </div>
                  <div className="card-body">
                    <h3>Cât rămâne pe hectar, cultură cu cultură</h3>
                    <p className="text-sm">Ce-ți lasă fiecare cultură după cheltuieli, la producția și prețul obișnuite.</p>
                  </div>
                </article>
                <article className="card span-5">
                  <div className="card-visual t-c">
                    <ul className="lp-bills" id="bills-loop" role="img"></ul>
                  </div>
                  <div className="card-body">
                    <h3>Ce urmează, înainte să vină</h3>
                    <p className="text-sm">Subvenții, vânzări și cheltuieli într-o singură listă. Sumele estimate scriu asta.</p>
                  </div>
                </article>
                <article className="card span-5">
                  <div className="card-visual t-b">
                    <div className="lp-costs" id="costs-loop" role="img"></div>
                  </div>
                  <div className="card-body">
                    <h3>Pe ce se duc banii sezonului</h3>
                    <p className="text-sm">{`Cheltuielile pe lucrări și partea lor din ${group(costTotal)} lei, dintr-o privire.`}</p>
                  </div>
                </article>
                <article className="card span-7">
                  <div className="card-visual t-h">
                    <div className="lp-res" id="reserve-loop" role="img"></div>
                  </div>
                  <div className="card-body">
                    <h3>Salariul din banii anului</h3>
                    <p className="text-sm">Subvenția și recolta se adună, iar aplicația le împarte pe luni.</p>
                  </div>
                </article>
              </div>
            </div>
          </section>
          <section className="section" id="forecast">
            <div className="container">
              <div className="section-header">
                <h2>Îți ajung banii până la recoltă?</h2>
                <p className="lead">Alege anul și vezi cum se schimbă. Un interval, nu o promisiune.</p>
              </div>
              <article className="card" style={{ "overflow": "visible" }}>
                <div className="toolbar">
                  <div>
                    <p className="lbl">{f.endLabel}</p>
                    <p className="n28" data-f="end"></p>
                  </div>
                  <div className="seg" role="group" aria-label="Ce fel de an">
                    <button type="button" data-path="poor" aria-pressed="false">An slab</button>
                    <button type="button" data-path="expected" aria-pressed="true">An normal</button>
                    <button type="button" data-path="good" aria-pressed="false">An bun</button>
                  </div>
                </div>
                <div className="plot">
                  <div className="chart big"></div>
                </div>
                <dl className="figs">
                  <div>
                    <dt>
                      {"Cel mai puțin, în "}
                      <span data-f="low-m"></span>
                    </dt>
                    <dd className="n20" data-f="low-v"></dd>
                  </div>
                  <div>
                    <dt>Într-un an slab</dt>
                    <dd className="n20" data-f="poor"></dd>
                  </div>
                  <div>
                    <dt>Într-un an bun</dt>
                    <dd className="n20" data-f="good"></dd>
                  </div>
                </dl>
              </article>
            </div>
          </section>
          <section className="section" id="trust">
            <div className="container">
              <div className="section-header">
                <h2>Spune ce știe și ce nu</h2>
              </div>
              <ul className="trust">
                <li>
                  <span className="tile b" data-ic="chart"></span>
                  <b>Intervale, nu promisiuni</b>
                  <p className="text-sm">Fiecare prognoză arată un an slab, unul normal și unul bun.</p>
                </li>
                <li>
                  <span className="tile b" data-ic="seed"></span>
                  <b>Estimările scriu că sunt estimări</b>
                  <p className="text-sm">Subvențiile, recolta din hambar și plățile care încă n-au venit au o etichetă clară.</p>
                </li>
                <li>
                  <span className="tile b" data-ic="shield"></span>
                  <b>Cifre din surse oficiale</b>
                  <p className="text-sm">Sumele APIA și termenele vin din ghidurile publicate. Ce n-am putut verifica scrie „de verificat”.</p>
                </li>
                <li>
                  <span className="tile b" data-ic="check"></span>
                  <b>Greșelile se repară ușor</b>
                  <p className="text-sm">Orice vânzare sau cheltuială notată se poate șterge.</p>
                </li>
              </ul>
            </div>
          </section>
          <section className="section final">
            <div className="container">
              <h2>Începe cu ferma lui Ion</h2>
              <p className="lead">Fără cont și fără bancă. Când vrei, pui datele fermei tale.</p>
              {" "}
              <a className="btn btn-dark" href="/acasa">
                {"Vezi ferma lui Ion "}
                <span data-ic="arrow"></span>
              </a>
            </div>
          </section>
        </div>
      </main>
      <footer>
        <div className="container">
          <div className="fcols">
            <div>
              <a className="logo" href="#top">
                <span className="mark" data-ic="sprout"></span>
                <span>CropCash</span>
              </a>
              <p>Salariu și pensie din subvenție și recoltă, pentru fermele mici și mijlocii. Nimic de aici nu mută bani reali.</p>
            </div>
            <div>
              <h2>Aplicația</h2>
              <a href="/acasa">Acasă</a>
              <a href="/prognoza">Prognoză</a>
              <a href="/recolte">Recolte</a>
              <a href="/salariu">Salariu</a>
            </div>
            <div>
              <h2>Pagina asta</h2>
              <a href="#top">Sus</a>
              <a href="#how">Cum merge</a>
              <a href="#features">Ce vezi</a>
              <a href="#forecast">Prognoză</a>
            </div>
          </div>
          <p className="copy">Prognozele sunt estimări, nu sfaturi financiare.</p>
        </div>
      </footer>
    </LegacyPage>
  );
}
