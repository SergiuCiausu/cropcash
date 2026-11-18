/* Installing the app on the phone (F-21). Chrome announces it once, early, often before the page that
   shows the card has loaded, so Frame imports this file and the announcement is kept here. Needs
   internet only for the install itself. */

interface InstallPrompt extends Event {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallWay = 'prompt' | 'iphone';

let waiting: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    waiting = e as InstallPrompt;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    waiting = null;
    installed = true;
    changed();
  });
}

const isStandalone = () => installed || !!window.matchMedia?.('(display-mode: standalone)')?.matches || (navigator as { standalone?: boolean }).standalone === true;
/* iPads report themselves as Macs, but Macs have no touch screen. */
const isIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** How this phone can install the app, or null when it's installed or can't be offered. */
export function installWay(): InstallWay | null {
  if (isStandalone()) return null;
  if (waiting) return 'prompt';
  return isIphone() ? 'iphone' : null;
}

export function onInstallChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows the phone's own install question. It can be asked only once. */
export async function askToInstall(): Promise<boolean> {
  const event = waiting;
  if (!event) return false;
  waiting = null;
  try {
    await event.prompt();
    return (await event.userChoice).outcome === 'accepted';
  } finally {
    changed();
  }
}
