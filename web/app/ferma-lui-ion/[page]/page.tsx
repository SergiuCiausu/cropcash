/* Ion's example farm: the same pages as the farmer's app, under /ferma-lui-ion (docs/13 §A1).
   Built ahead for each page in lib/paths.ts; any other name is a 404. */
import type { Metadata } from 'next';
import Screen, { SCREEN_VIEWPORT, screenMetadata } from '../../../components/Screen';
import { DEMO_PAGES } from '../../../lib/paths';
import type { ScreenName } from '../../../screens';

export const dynamicParams = false;
export const viewport = SCREEN_VIEWPORT;

export function generateStaticParams() {
  return DEMO_PAGES.map((p) => ({ page: p.slice(1) }));
}

type Props = { params: Promise<{ page: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return screenMetadata((await params).page as ScreenName, 'demo');
}

export default async function IonPage({ params }: Props) {
  return <Screen name={(await params).page as ScreenName} mode="demo" />;
}
