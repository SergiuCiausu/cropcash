/* Ported from farm-app/subsidies/onboarding.html by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '../../components/LegacyPage';
import '../../styles/shared.css';
import '../../styles/desktop.css';
import '../../styles/rail.css';
import '../../styles/subsidies.css';

export const metadata: Metadata = { title: "Începe · CropCash" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: "#B4E85C" };

export default function OnboardingPage() {
  return (
    <LegacyPage scripts={["shared","engine","app","papers","seasons","onboarding"]} palette="both">
      <main className="ob">
        <form className="ob-card" id="step" noValidate></form>
      </main>
    </LegacyPage>
  );
}
