'use client';
/* The same for a failure in the root layout, which replaces the whole document. */
import { useEffect } from 'react';
import PageFailed from '../components/PageFailed';
import { reloadOnce, tabStore } from '../lib/boot-retry';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const reloading = typeof window !== 'undefined' && reloadOnce(error, tabStore(), () => location.reload());
  useEffect(() => {
    console.error('page failed', error);
  }, [error]);
  return (
    <html lang="ro">
      <body>{reloading ? null : <PageFailed />}</body>
    </html>
  );
}
