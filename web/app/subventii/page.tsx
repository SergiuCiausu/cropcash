/* The farmer's /subventii. The page itself is web/screens/subventii.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('subventii');
export const viewport = SCREEN_VIEWPORT;

export default function SubventiiPage() {
  return <Screen name="subventii" />;
}
