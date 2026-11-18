/* The farmer's /recolte. The page itself is web/screens/recolte.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('recolte');
export const viewport = SCREEN_VIEWPORT;

export default function RecoltePage() {
  return <Screen name="recolte" />;
}
