/* The farmer's /rapoarte. The page itself is web/screens/rapoarte.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('rapoarte');
export const viewport = SCREEN_VIEWPORT;

export default function RapoartePage() {
  return <Screen name="rapoarte" />;
}
