/* The farm app in Next.js. Pages are ported from farm-app/ and the landing page (web/scripts/port-legacy.mjs). */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/* Installable on the phone (plan step 9b): the manifest and icons in public/, made by scripts/make-icons.mjs.
   Pages set their own title; these fields reach every page. */
export const metadata: Metadata = {
  applicationName: 'CropCash',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'CropCash', statusBarStyle: 'default' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ro" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Was an @import at the top of desktop.css. */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
