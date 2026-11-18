/* Onboarding in three steps, in the same Rail frame as the rest of the app: the lime sidebar lists the
   steps and fills in the farm as it's typed. Phones get the lime top bar instead (components/pages/Onboarding.tsx). */
import type { Metadata } from 'next';
import Onboarding from '../../components/pages/Onboarding';
import { APP_VIEWPORT } from '../../components/appStyles';

export const metadata: Metadata = { title: 'Începe · CropCash' };
export const viewport = APP_VIEWPORT;

export default function OnboardingPage() {
  return <Onboarding />;
}
