/* The farmer's /prognoza. The page itself is web/screens/prognoza.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('prognoza');
export const viewport = SCREEN_VIEWPORT;

export default function PrognozaPage() {
  return <Screen name="prognoza" />;
}
