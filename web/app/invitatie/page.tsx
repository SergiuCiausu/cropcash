/* /invitatie?cod=…: accepting a farmer's invitation (components/pages/Invitatie.tsx). */
import type { Metadata } from 'next';
import Invitatie from '../../components/pages/Invitatie';
import { APP_VIEWPORT } from '../../components/appStyles';

export const metadata: Metadata = { title: 'Invitație · CropCash' };
export const viewport = APP_VIEWPORT;

export default function InvitatiePage() {
  return <Invitatie />;
}
