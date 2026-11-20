/* „De verificat” (docs/admin-verificari-plan.md). Signed-in admins only, no /ferma-lui-ion copy. The page itself is web/screens/verificari.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('verificari');
export const viewport = SCREEN_VIEWPORT;

export default function VerificariPage() {
  return <Screen name="verificari" />;
}
