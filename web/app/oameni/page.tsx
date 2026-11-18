/* The farmer's /oameni. The page itself is web/screens/oameni.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('oameni');
export const viewport = SCREEN_VIEWPORT;

export default function OameniPage() {
  return <Screen name="oameni" />;
}
