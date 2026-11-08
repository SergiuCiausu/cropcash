/* The farmer's /surse. The page itself is web/screens/surse.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('surse');
export const viewport = SCREEN_VIEWPORT;

export default function SursePage() {
  return <Screen name="surse" />;
}
