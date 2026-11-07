/* Ported from farm-app/subsidies/login.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Intră în cont · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function LoginPage() {
  return (
    <LegacyPage scripts={["shared","config","live","login"]} palette="both">
      <main className="ob">
        <form className="ob-card" id="form">
          <div className="ob-top">
            <span className="logo">
              <span className="mark" id="mark"></span>
              <span>CropCash</span>
            </span>
          </div>
          <h1 id="title" tabIndex={-1}></h1>
          <p className="lead" id="tagline"></p>
          {" "}
          <label className="ob-field">
            <span id="email-label"></span>
            <input id="email" type="email" inputMode="email" autoComplete="email" required />
          </label>
          {" "}
          <label className="ob-field">
            <span id="password-label"></span>
            <input id="password" type="password" autoComplete="current-password" required minLength={6} />
          </label>
          {" "}
          <p className="lead" id="hint" hidden></p>
          <p className="ob-err" id="error" role="alert" hidden></p>
          <p className="lead" id="info" role="status" hidden></p>
          <div className="ob-actions">
            <button type="submit" className="btn btn-dark" id="submit"></button>
            {" "}
            <button type="button" className="btn btn-line" id="switch"></button>
          </div>
        </form>
      </main>
    </LegacyPage>
  );
}
