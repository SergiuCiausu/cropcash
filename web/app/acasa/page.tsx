/* The farmer's /acasa. The page itself is web/screens/acasa.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('acasa');
export const viewport = SCREEN_VIEWPORT;

export default function AcasaPage() {
  return <Screen name="acasa" />;
}
