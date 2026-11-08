/* The farmer's /calendar. The page itself is web/screens/calendar.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('calendar');
export const viewport = SCREEN_VIEWPORT;

export default function CalendarPage() {
  return <Screen name="calendar" />;
}
