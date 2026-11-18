/* The farmer's /salariu. The page itself is web/screens/salariu.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('salariu');
export const viewport = SCREEN_VIEWPORT;

export default function SalariuPage() {
  return <Screen name="salariu" />;
}
