/* The farmer's /contracte. The page itself is web/screens/contracte.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('contracte');
export const viewport = SCREEN_VIEWPORT;

export default function ContractePage() {
  return <Screen name="contracte" />;
}
