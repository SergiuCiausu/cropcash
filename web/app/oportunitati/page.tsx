/* The farmer's /oportunitati. The page itself is web/screens/oportunitati.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('oportunitati');
export const viewport = SCREEN_VIEWPORT;

export default function OportunitatiPage() {
  return <Screen name="oportunitati" />;
}
