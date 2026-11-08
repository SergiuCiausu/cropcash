/* One app page, as both routes use it: /salariu (the farmer's app) and /ferma-lui-ion/salariu
   (Ion's example farm). The route files only pick a screen (components/Screen.tsx). */
import type { ComponentType } from 'react';
import type { DEMO_PAGES } from '../lib/paths';

/** "acasa", "date-plan", …: the pages in lib/paths.ts, without the slash. */
export type ScreenName = (typeof DEMO_PAGES)[number] extends `/${infer N}` ? N : never;

/** A screen: its title, and its content inside the store and the frame (components/app). */
export interface ScreenDef {
  /** The tab title, in Romanian. */
  title: string;
  /** The page's content inside <main>, reading the farm through the hooks in lib/cc/react.tsx. */
  App: ComponentType;
}
