/* The farmer's /arenda. The page itself is web/screens/arenda.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('arenda');
export const viewport = SCREEN_VIEWPORT;

export default function ArendaPage() {
  return <Screen name="arenda" />;
}
