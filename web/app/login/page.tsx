/* "Intră în cont", in the same Rail frame as onboarding and the pages: the lime sidebar switches between
   signing in and making an account (pills on phones), and the form sits in a card (components/pages/Login.tsx). */
import type { Metadata } from 'next';
import Login from '../../components/pages/Login';
import { APP_VIEWPORT } from '../../components/appStyles';

export const metadata: Metadata = { title: 'Intră în cont · CropCash' };
export const viewport = APP_VIEWPORT;

export default function LoginPage() {
  return <Login />;
}
