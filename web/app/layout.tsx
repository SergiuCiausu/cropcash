/* The farm app in Next.js. Pages are ported from farm-app/ and the landing page (web/scripts/port-legacy.mjs). */
import type { ReactNode } from 'react';

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
