/* The farmer's /bani. The page itself is web/screens/bani.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('bani');
export const viewport = SCREEN_VIEWPORT;

export default function BaniPage() {
  return <Screen name="bani" />;
}
