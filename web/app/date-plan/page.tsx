/* The farmer's /date-plan. The page itself is web/screens/date-plan.tsx. */
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../components/Screen';

export const metadata = screenMetadata('date-plan');
export const viewport = SCREEN_VIEWPORT;

export default function DatePlanPage() {
  return <Screen name="date-plan" />;
}
