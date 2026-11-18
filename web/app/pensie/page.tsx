/* The farmer's /pensie. The page itself is web/screens/pensie.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('pensie');
export const viewport = SCREEN_VIEWPORT;

export default function PensiePage() {
  return <Screen name="pensie" />;
}
