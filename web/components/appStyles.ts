/* What every page in the Rail frame shares: the four stylesheets and the viewport.
   Its own module, so login and onboarding don't pull in every screen through Screen.tsx. */
import type { Viewport } from 'next';
import '../styles/shared.css';
import '../styles/desktop.css';
import '../styles/rail.css';
import '../styles/subsidies.css';

export const APP_VIEWPORT: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#FBFAF3' };
