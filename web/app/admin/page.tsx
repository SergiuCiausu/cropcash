/* The admin panel's /admin. Signed-in only, no /ferma-lui-ion copy. The page itself is web/screens/admin.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('admin');
export const viewport = SCREEN_VIEWPORT;

export default function AdminPage() {
  return <Screen name="admin" />;
}
