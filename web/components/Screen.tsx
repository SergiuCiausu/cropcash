/* An app page, in the farmer's app or on Ion's farm: its body from web/screens, inside ReactScreen.
   The route files stay three lines, so /salariu and /ferma-lui-ion/salariu can't drift apart. */
import type { Metadata } from 'next';
import AppSkeleton from './skeleton/AppSkeleton';
import { SCREEN_SKELETONS, WITH_ACTION } from './skeleton/screens';
import { SCREENS, type ScreenDef, type ScreenName } from '../screens';
import ReactScreen from './app/ReactScreen';
import type { Mode } from '../lib/paths';
import { APP_VIEWPORT } from './appStyles';
import '../styles/demo.css';

/** "Salariu · CropCash", or "Salariu · Ferma lui Ion · CropCash" on Ion's farm. */
export const screenMetadata = (name: ScreenName, mode: Mode = 'farm'): Metadata => ({
  title: mode === 'demo' ? SCREENS[name].title.replace(/ · CropCash$/, ' · Ferma lui Ion · CropCash') : SCREENS[name].title,
});
export const SCREEN_VIEWPORT = APP_VIEWPORT;

export default function Screen({ name, mode = 'farm' }: { name: ScreenName; mode?: Mode }) {
  const def: ScreenDef = SCREENS[name];
  const Shapes = SCREEN_SKELETONS[name];
  const skeleton = (
    <AppSkeleton mode={mode} action={WITH_ACTION.includes(name)}>
      <Shapes />
    </AppSkeleton>
  );
  const { App } = def;
  return (
    <ReactScreen page={`/${name}`} mode={mode} skeleton={skeleton}>
      <App />
    </ReactScreen>
  );
}
