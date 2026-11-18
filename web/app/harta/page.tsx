/* The farmer's /harta. The page itself is web/screens/harta.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('harta');
export const viewport = SCREEN_VIEWPORT;

export default function HartaPage() {
  return <Screen name="harta" />;
}
