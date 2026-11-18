/* /contabil: the farms an accountant was let in to, and their reports (components/pages/Contabil.tsx).
   Signed-in only, no farm needed, no /ferma-lui-ion copy. */
import type { Metadata } from 'next';
import Contabil from '../../components/pages/Contabil';
import { APP_VIEWPORT } from '../../components/appStyles';

export const metadata: Metadata = { title: 'Rapoartele fermelor · CropCash' };
export const viewport = APP_VIEWPORT;

export default function ContabilPage() {
  return <Contabil />;
}
