/* The farmer's /de-raportat. The page itself is web/screens/de-raportat.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('de-raportat');
export const viewport = SCREEN_VIEWPORT;

export default function DeRaportatPage() {
  return <Screen name="de-raportat" />;
}
